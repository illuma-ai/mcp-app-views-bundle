/**
 * Presentational parts of the Test Plans views: the plans list, a plan (suite tree and test cases),
 * a test case with its steps, the steps editor, the new test case review form and the build results.
 * Containers in TestScreens.tsx load the data; every write is started from a button handler there.
 */
import { Badge, Button, Field, Input, MessageBar, MessageBarBody, Select, Tab, TabList, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular, ArrowLeftRegular, CheckmarkCircleFilled, ChevronDownRegular, ChevronRightRegular, DismissCircleFilled, ErrorCircleRegular, SubtractCircleRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Iteration } from "../lib/boards-logic";
import { type CaseRef, type Plan, type Step, type Suite, type TestResult, flattenSuites, formatDuration, summariseOutcomes } from "../lib/testplans";
import { LinkButton, StateDot, TypeIcon } from "./parts";

const NARROW = "@media (max-width: 480px)";

const useStyles = makeStyles({
  page: { backgroundColor: tokens.colorNeutralBackground2, padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: "8px" },
  bar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" },
  heading: { fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500, fontWeight: tokens.fontWeightSemibold, margin: 0 },
  panel: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4 },
  head: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 84px 130px 110px",
    gap: "8px",
    padding: "6px 8px",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    [NARROW]: { gridTemplateColumns: "minmax(0,1fr) 72px" },
  },
  row: {
    "display": "grid",
    "gridTemplateColumns": "minmax(0,1fr) 84px 130px 110px",
    "gap": "8px",
    "alignItems": "center",
    "padding": "6px 8px",
    "borderBottom": `1px solid ${tokens.colorNeutralStroke3}`,
    "fontSize": tokens.fontSizeBase300,
    "minWidth": 0,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    [NARROW]: { gridTemplateColumns: "minmax(0,1fr) 72px" },
  },
  hideNarrow: { [NARROW]: { display: "none" } },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", justifyContent: "flex-start", textAlign: "left", minWidth: 0 },
  split: { display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 5fr)", gap: "8px", [NARROW]: { gridTemplateColumns: "minmax(0, 1fr)" } },
  tree: { padding: "6px 0", minHeight: "120px" },
  treeRow: { display: "flex", alignItems: "center", gap: "2px", fontSize: tokens.fontSizeBase300, minWidth: 0 },
  selected: { backgroundColor: tokens.colorBrandBackground2 },
  empty: { padding: "28px 16px", textAlign: "center", color: tokens.colorNeutralForeground3 },
  form: { display: "flex", flexDirection: "column", gap: "8px", padding: "12px", backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", [NARROW]: { gridTemplateColumns: "minmax(0, 1fr)" } },
  stepRow: { display: "grid", gridTemplateColumns: "24px minmax(0,1fr) minmax(0,1fr) 32px", gap: "6px", alignItems: "start", [NARROW]: { gridTemplateColumns: "20px minmax(0,1fr) 32px" } },
  stepExpected: { [NARROW]: { gridColumn: "2 / span 1" } },
  help: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  chips: { display: "flex", gap: "8px", flexWrap: "wrap" },
  err: { color: tokens.colorStatusDangerForeground1, fontSize: tokens.fontSizeBase200, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
});

const TC = "#004B50";

// ---- plans list ---------------------------------------------------------------------------------

export interface PlansListProps {
  plans: Plan[];
  iterations: Iteration[];
  canCreate: boolean;
  busy?: boolean;
  error?: string | null;
  onOpen?: (plan: Plan) => void;
  /** Starts creating a plan (the form's Create button); the host asks the user to approve. */
  onCreate?: (values: { name: string; iteration: string; areaPath: string; description: string; startDate: string; endDate: string }) => void;
}

export function PlansList(props: PlansListProps): ReactElement {
  const s = useStyles();
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({
    name: "",
    iteration: props.iterations.find((i) => i.timeFrame === "current")?.path ?? props.iterations[0]?.path ?? "",
    areaPath: "",
    description: "",
    startDate: "",
    endDate: "",
  });
  const set = (k: keyof typeof v, value: string): void => setV((p) => ({ ...p, [k]: value }));
  return (
    <div className={s.page}>
      <div className={s.bar}>
        <h1 className={s.heading}>Test Plans</h1>
        {props.canCreate && (
          <Button appearance="primary" icon={<AddRegular />} onClick={() => setAdding(true)}>
            New Test Plan
          </Button>
        )}
      </div>
      {adding && props.canCreate && (
        <div className={s.form}>
          <Field label="Name" required>
            <Input value={v.name} onChange={(_, d) => set("name", d.value)} />
          </Field>
          <div className={s.grid2}>
            <Field label="Iteration">
              <Select value={v.iteration} onChange={(_, d) => set("iteration", d.value)}>
                {props.iterations.map((it) => (
                  <option key={it.id} value={it.path}>
                    {it.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Area Path">
              <Input value={v.areaPath} placeholder="Default area" onChange={(_, d) => set("areaPath", d.value)} />
            </Field>
            <Field label="Start Date">
              <Input type="date" value={v.startDate} onChange={(_, d) => set("startDate", d.value)} />
            </Field>
            <Field label="End Date">
              <Input type="date" value={v.endDate} onChange={(_, d) => set("endDate", d.value)} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea rows={2} value={v.description} onChange={(_, d) => set("description", d.value)} />
          </Field>
          <div className={s.bar}>
            <span className={s.note}>Nothing is created until you press Create. The host then asks you to approve it.</span>
            <span>
              <Button appearance="subtle" onClick={() => setAdding(false)}>
                Cancel
              </Button>{" "}
              <Button appearance="primary" disabled={props.busy || v.name.trim() === "" || v.iteration === ""} onClick={() => props.onCreate?.({ ...v, name: v.name.trim() })}>
                Create
              </Button>
            </span>
          </div>
        </div>
      )}
      {props.error && (
        <MessageBar intent="error">
          <MessageBarBody>{props.error}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.panel} role="table" aria-label="Test plans">
        <div className={s.head} role="row">
          <span>Name</span>
          <span>State</span>
          <span className={s.hideNarrow}>Iteration</span>
          <span className={s.hideNarrow}>Owner</span>
        </div>
        {props.plans.length === 0 && <div className={s.empty}>No test plans</div>}
        {props.plans.map((p) => (
          <div key={p.id} className={s.row} role="row" data-testid={`plan-${p.id}`}>
            <LinkButton className={s.ellipsis} onClick={() => props.onOpen?.(p)}>
              {p.name}
            </LinkButton>
            <span>{p.state ? <StateDot state={p.state} colors={{ Active: "#007acc", Inactive: "#b2b2b2" }} /> : ""}</span>
            <span className={s.hideNarrow}>{p.iteration ?? ""}</span>
            <span className={s.hideNarrow}>{p.owner ?? ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- a plan: suites and cases ---------------------------------------------------------------------

export interface CaseRow extends CaseRef {
  state?: string;
  priority?: number;
}

export interface PlanViewProps {
  plan: Plan;
  suites: Suite[];
  suiteId?: number;
  cases: CaseRow[];
  casesLoading?: boolean;
  canWrite: boolean;
  busy?: boolean;
  error?: string | null;
  onBack?: () => void;
  onSuite?: (id: number) => void;
  onOpenCase?: (id: number) => void;
  onOpenWeb?: (what: "execute" | "chart") => void;
  /** Starts the review form for a new test case in the selected suite. */
  onNewCase?: () => void;
  /** Starts creating a suite under the selected one (the inline form's Create button). */
  onNewSuite?: (name: string) => void;
}

export function PlanView(props: PlanViewProps): ReactElement {
  const s = useStyles();
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [suiteName, setSuiteName] = useState("");
  const hidden = new Set<number>();
  const visible = flattenSuites(props.suites).filter(({ suite }) => {
    if (hidden.has(suite.id)) {
      suite.children.forEach((c) => hidden.add(c.id));
      return false;
    }
    if (collapsed.has(suite.id)) suite.children.forEach((c) => hidden.add(c.id));
    return true;
  });
  return (
    <div className={s.page}>
      <div className={s.bar}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {props.onBack && <Button appearance="subtle" size="small" icon={<ArrowLeftRegular />} aria-label="Back to test plans" onClick={props.onBack} />}
          <h1 className={s.heading}>{props.plan.name}</h1>
        </span>
        <TabList selectedValue="define" size="small">
          <Tab value="define">Define</Tab>
          <Tab value="execute" onClick={() => props.onOpenWeb?.("execute")}>
            Execute
          </Tab>
          <Tab value="chart" onClick={() => props.onOpenWeb?.("chart")}>
            Chart
          </Tab>
        </TabList>
      </div>
      <div className={s.split}>
        <div className={`${s.panel} ${s.tree}`} role="tree" aria-label="Test suites">
          {visible.map(({ suite, depth }) => (
            <div
              key={suite.id}
              className={`${s.treeRow}${props.suiteId === suite.id ? ` ${s.selected}` : ""}`}
              style={{ paddingLeft: 4 + depth * 14 }}
              role="treeitem"
              aria-selected={props.suiteId === suite.id}>
              {suite.children.length > 0 ? (
                <Button
                  appearance="transparent"
                  size="small"
                  icon={collapsed.has(suite.id) ? <ChevronRightRegular /> : <ChevronDownRegular />}
                  aria-label={`${collapsed.has(suite.id) ? "Expand" : "Collapse"} ${suite.name}`}
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(suite.id)) next.delete(suite.id);
                      else next.add(suite.id);
                      return next;
                    })
                  }
                />
              ) : (
                <span style={{ width: 24 }} />
              )}
              <LinkButton className={s.ellipsis} onClick={() => props.onSuite?.(suite.id)}>
                {suite.name}
              </LinkButton>
            </div>
          ))}
          {props.canWrite && props.suiteId !== undefined && (
            <div style={{ padding: "6px 8px" }}>
              {adding ? (
                <span style={{ display: "flex", gap: 4 }}>
                  <Input size="small" autoFocus placeholder="Suite name" value={suiteName} onChange={(_, d) => setSuiteName(d.value)} />
                  <Button
                    size="small"
                    appearance="primary"
                    disabled={props.busy || suiteName.trim() === ""}
                    onClick={() => {
                      props.onNewSuite?.(suiteName.trim());
                      setSuiteName("");
                      setAdding(false);
                    }}>
                    Create
                  </Button>
                </span>
              ) : (
                <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => setAdding(true)}>
                  New suite
                </Button>
              )}
            </div>
          )}
        </div>
        <div className={s.panel}>
          <div className={s.bar} style={{ padding: "6px 8px" }}>
            <span className={s.help}>{props.casesLoading ? "Loading..." : `${props.cases.length} test ${props.cases.length === 1 ? "case" : "cases"}`}</span>
            {props.canWrite && props.suiteId !== undefined && (
              <Button appearance="primary" size="small" icon={<AddRegular />} onClick={props.onNewCase}>
                New Test Case
              </Button>
            )}
          </div>
          <div className={s.head} role="row">
            <span>Title</span>
            <span>ID</span>
            <span className={s.hideNarrow}>State</span>
            <span className={s.hideNarrow}>Priority</span>
          </div>
          {!props.casesLoading && props.cases.length === 0 && <div className={s.empty}>No test cases in this suite</div>}
          {props.cases.map((c) => (
            <div key={c.id} className={s.row} role="row" data-testid={`case-${c.id}`}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <TypeIcon type="Test Case" color={TC} />
                <LinkButton className={s.ellipsis} onClick={() => props.onOpenCase?.(c.id)}>
                  {c.title}
                </LinkButton>
              </span>
              <span>{c.id}</span>
              <span className={s.hideNarrow}>{c.state ?? ""}</span>
              <span className={s.hideNarrow}>{c.priority ?? ""}</span>
            </div>
          ))}
        </div>
      </div>
      {props.error && (
        <MessageBar intent="error">
          <MessageBarBody>{props.error}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}

// ---- steps ----------------------------------------------------------------------------------------

export function StepsEditor({ steps, disabled, onChange }: { steps: Step[]; disabled?: boolean; onChange: (steps: Step[]) => void }): ReactElement {
  const s = useStyles();
  const set = (i: number, patch: Partial<Step>): void => onChange(steps.map((st, j) => (j === i ? { ...st, ...patch } : st)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }} role="group" aria-label="Steps">
      <div className={s.help}>Steps: action and expected result</div>
      {steps.map((st, i) => (
        <div key={i} className={s.stepRow}>
          <span className={s.help} style={{ paddingTop: 6 }}>
            {i + 1}
          </span>
          <Textarea rows={1} resize="vertical" aria-label={`Step ${i + 1} action`} placeholder="Action" value={st.action} disabled={disabled} onChange={(_, d) => set(i, { action: d.value })} />
          <span className={s.stepExpected} style={{ display: "contents" }}>
            <Textarea
              rows={1}
              resize="vertical"
              aria-label={`Step ${i + 1} expected result`}
              placeholder="Expected result"
              value={st.expected}
              disabled={disabled}
              onChange={(_, d) => set(i, { expected: d.value })}
            />
          </span>
          <Button appearance="subtle" size="small" aria-label={`Remove step ${i + 1}`} disabled={disabled} icon={<DismissCircleFilled />} onClick={() => onChange(steps.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div>
        <Button appearance="subtle" size="small" icon={<AddRegular />} disabled={disabled} onClick={() => onChange([...steps, { action: "", expected: "" }])}>
          Add step
        </Button>
      </div>
    </div>
  );
}

// ---- a test case ----------------------------------------------------------------------------------

export interface CaseViewProps {
  id: number;
  title: string;
  state?: string;
  priority?: number;
  steps: Step[];
  canEdit: boolean;
  busy?: boolean;
  error?: string | null;
  saved?: string | null;
  onBack?: () => void;
  /** Starts saving the edited steps (Save); the host asks the user to approve. */
  onSaveSteps?: (steps: Step[]) => void;
  onOpenWeb?: () => void;
}

export function CaseView(props: CaseViewProps): ReactElement {
  const s = useStyles();
  const [steps, setSteps] = useState<Step[]>(props.steps);
  const changed = JSON.stringify(steps) !== JSON.stringify(props.steps);
  return (
    <div className={s.page}>
      <div className={s.bar}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {props.onBack && <Button appearance="subtle" size="small" icon={<ArrowLeftRegular />} aria-label="Back" onClick={props.onBack} />}
          <TypeIcon type="Test Case" color={TC} />
          <LinkButton onClick={props.onOpenWeb}>{`TEST CASE ${props.id}`}</LinkButton>
        </span>
        {props.canEdit && (
          <Button appearance="primary" disabled={props.busy || !changed} onClick={() => props.onSaveSteps?.(steps)}>
            Save
          </Button>
        )}
      </div>
      <h1 className={s.heading}>{props.title}</h1>
      <div className={s.chips}>
        {props.state && <StateDot state={props.state} />}
        {props.priority !== undefined && <span className={s.help}>{`Priority ${props.priority}`}</span>}
      </div>
      <div className={s.panel} style={{ padding: 12 }}>
        {props.canEdit ? (
          <StepsEditor steps={steps} disabled={props.busy} onChange={setSteps} />
        ) : props.steps.length === 0 ? (
          <div className={s.help}>No steps</div>
        ) : (
          <div role="table" aria-label="Steps">
            {props.steps.map((st, i) => (
              <div key={i} className={s.stepRow} style={{ padding: "4px 0" }}>
                <span className={s.help}>{i + 1}</span>
                <span style={{ whiteSpace: "pre-wrap" }}>{st.action}</span>
                <span className={s.stepExpected} style={{ whiteSpace: "pre-wrap", color: tokens.colorNeutralForeground2 }}>
                  {st.expected}
                </span>
                <span />
              </div>
            ))}
          </div>
        )}
      </div>
      {props.error && (
        <MessageBar intent="error">
          <MessageBarBody>{props.error}</MessageBarBody>
        </MessageBar>
      )}
      {props.saved && (
        <MessageBar intent="success">
          <MessageBarBody>{props.saved}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}

// ---- new test case (review before create) -------------------------------------------------------------

export interface SuiteChoice {
  planId: number;
  suiteId: number;
  label: string;
}

export interface TestCaseValues {
  title: string;
  steps: Step[];
  priority: string;
  areaPath: string;
  iterationPath: string;
  testsWorkItemId: string;
}

export interface TestCaseFormProps {
  initial?: Partial<TestCaseValues>;
  /** Suites the case can be added to (empty: the case is created without a suite). */
  suites: SuiteChoice[];
  initialSuite?: { planId: number; suiteId: number };
  iterations: Iteration[];
  defaultIterationPath?: string;
  defaultAreaPath?: string;
  busy?: boolean;
  error?: string | null;
  /** Starts the create (the Create button); the host then asks the user to approve each call. */
  onSave?: (values: TestCaseValues, suite?: { planId: number; suiteId: number }) => void;
  onCancel?: () => void;
}

export function TestCaseForm(props: TestCaseFormProps): ReactElement {
  const s = useStyles();
  const [v, setV] = useState<TestCaseValues>({
    title: "",
    steps: [{ action: "", expected: "" }],
    priority: "",
    areaPath: props.defaultAreaPath ?? "",
    iterationPath: props.defaultIterationPath ?? "",
    testsWorkItemId: "",
    ...Object.fromEntries(Object.entries(props.initial ?? {}).filter(([, x]) => x !== "" && x !== undefined && !(Array.isArray(x) && x.length === 0))),
  });
  const [suite, setSuite] = useState<string>(props.initialSuite ? `${props.initialSuite.planId}:${props.initialSuite.suiteId}` : "");
  const [touched, setTouched] = useState(false);
  const titleMissing = touched && v.title.trim() === "";
  const set = <K extends keyof TestCaseValues>(k: K, value: TestCaseValues[K]): void => setV((p) => ({ ...p, [k]: value }));
  const onSaveClick = (): void => {
    setTouched(true);
    if (v.title.trim() === "") return;
    const [planId, suiteId] = suite ? suite.split(":").map(Number) : [];
    props.onSave?.({ ...v, title: v.title.trim() }, suite ? { planId, suiteId } : undefined);
  };
  return (
    <div className={s.form}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: tokens.fontSizeBase200, fontWeight: 600, letterSpacing: "0.04em" }}>
        <TypeIcon type="Test Case" color={TC} />
        <span>NEW TEST CASE *</span>
      </div>
      <Field validationState={titleMissing ? "error" : "none"} validationMessage={titleMissing ? "Field 'Title' cannot be empty." : undefined}>
        <Input size="large" aria-label="Title" placeholder="Enter title" value={v.title} disabled={props.busy} onChange={(_, d) => set("title", d.value)} />
      </Field>
      <StepsEditor steps={v.steps} disabled={props.busy} onChange={(steps) => set("steps", steps)} />
      <div className={s.grid2}>
        <Field label="Priority">
          <Select value={v.priority} disabled={props.busy} onChange={(_, d) => set("priority", d.value)}>
            <option value="" />
            {["1", "2", "3", "4"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Iteration">
          <Select value={v.iterationPath} disabled={props.busy} onChange={(_, d) => set("iterationPath", d.value)}>
            {props.iterations.map((it) => (
              <option key={it.id} value={it.path}>
                {it.name}
              </option>
            ))}
            {props.iterations.every((it) => it.path !== v.iterationPath) && v.iterationPath && <option value={v.iterationPath}>{v.iterationPath}</option>}
          </Select>
        </Field>
        <Field label="Area">
          <Input value={v.areaPath} disabled={props.busy} onChange={(_, d) => set("areaPath", d.value)} />
        </Field>
        <Field label="Tests work item (id)">
          <Input type="number" placeholder="Optional" value={v.testsWorkItemId} disabled={props.busy} onChange={(_, d) => set("testsWorkItemId", d.value)} />
        </Field>
      </div>
      <Field label="Add to test suite">
        <Select value={suite} disabled={props.busy} onChange={(_, d) => setSuite(d.value)}>
          <option value="">Do not add to a suite</option>
          {props.suites.map((c) => (
            <option key={`${c.planId}:${c.suiteId}`} value={`${c.planId}:${c.suiteId}`}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className={s.note}>Nothing is created until you press Create. The host then asks you to approve the create, and again for adding it to the suite.</div>
      {props.error && (
        <MessageBar intent="error">
          <MessageBarBody>{props.error}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.bar}>
        <span />
        <span>
          {props.onCancel && (
            <Button appearance="subtle" onClick={props.onCancel}>
              Cancel
            </Button>
          )}{" "}
          <Button appearance="primary" disabled={props.busy} onClick={onSaveClick}>
            Create
          </Button>
        </span>
      </div>
    </div>
  );
}

// ---- results of a build -------------------------------------------------------------------------------

const OUTCOME_ICON: Record<string, ReactElement> = {
  Passed: <CheckmarkCircleFilled color="#107c10" />,
  Failed: <DismissCircleFilled color="#c50f1f" />,
  Aborted: <ErrorCircleRegular color="#8a8886" />,
  Blocked: <SubtractCircleRegular color="#d83b01" />,
  Inconclusive: <ErrorCircleRegular color="#8a8886" />,
  NotExecuted: <SubtractCircleRegular color="#8a8886" />,
  Other: <ErrorCircleRegular color="#8a8886" />,
};

export function ResultsView({ buildId, results }: { buildId?: number; results: TestResult[] }): ReactElement {
  const s = useStyles();
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const summary = summariseOutcomes(results);
  return (
    <div className={s.page}>
      <div className={s.bar}>
        <h1 className={s.heading}>{buildId ? `Test results, build ${buildId}` : "Test results"}</h1>
        <span className={s.help}>{`${results.length} ${results.length === 1 ? "result" : "results"}`}</span>
      </div>
      {summary.length > 0 && (
        <div className={s.chips} aria-label="Outcome summary">
          {summary.map((o) => (
            <Badge key={o.outcome} appearance="tint" size="large" icon={OUTCOME_ICON[o.outcome]}>
              {`${o.outcome} ${o.count}`}
            </Badge>
          ))}
        </div>
      )}
      <div className={s.panel} role="table" aria-label="Test results">
        <div className={s.head} role="row">
          <span>Test</span>
          <span>Outcome</span>
          <span className={s.hideNarrow}>Duration</span>
          <span className={s.hideNarrow}>Run</span>
        </div>
        {results.length === 0 && <div className={s.empty}>No test results</div>}
        {results.map((r) => (
          <div key={r.id}>
            <div className={s.row} role="row" data-testid={`result-${r.id}`}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <LinkButton
                  className={s.ellipsis}
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    })
                  }>
                  {r.title}
                </LinkButton>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {OUTCOME_ICON[r.outcome]}
                {r.outcome}
              </span>
              <span className={s.hideNarrow}>{formatDuration(r.durationMs)}</span>
              <span className={s.hideNarrow}>{r.runId ?? ""}</span>
            </div>
            {open.has(r.id) && (r.error || r.stack) && (
              <div style={{ padding: "4px 12px 8px" }}>
                {r.error && <div className={s.err}>{r.error}</div>}
                {r.stack && <pre className={s.err}>{r.stack}</pre>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
