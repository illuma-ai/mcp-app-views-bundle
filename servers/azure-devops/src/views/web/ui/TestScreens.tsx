/**
 * The Test Plans screens: containers that load plans, suites, cases and results through the host.
 * Reads happen in loaders; every write starts from a handler named `on...` (a Create or Save button),
 * runs through `useWrite`, and is approved by the user in the host. A test enforces this.
 */
import type { ReactElement } from "react";
import { useState } from "react";
import { TOOL } from "../lib/api";
import { loadIterations } from "../lib/boards-data";
import { type Iteration, pickDefaultIteration } from "../lib/boards-logic";
import { parseToolResult } from "../lib/result";
import { type Plan, flattenSuites, parseSteps, stepsFromProposal, stepsToText, toCaseRefs, toPlans, toResults, toSuites, type Step } from "../lib/testplans";
import { FIELD, toCard } from "../lib/work-items";
import { useLoad } from "./hooks";
import { CreatedPanel } from "./NewItemForm";
import { ErrorBar, Loading, useApi, useWrite } from "./parts";
import { CaseView, type CaseRow, type SuiteChoice, PlanView, PlansList, ResultsView, TestCaseForm, type TestCaseValues } from "./TestPlanViews";

export interface TestCasePrefill {
  title?: string;
  steps?: Step[];
  priority?: string;
  areaPath?: string;
  iterationPath?: string;
  testsWorkItemId?: string;
  planId?: number;
  suiteId?: number;
}

/** The proposal the model passes to `testplan_test_case_form`. */
export function testCasePrefillFrom(args: Record<string, unknown>): TestCasePrefill {
  const str = (k: string): string | undefined => (typeof args[k] === "string" ? (args[k] as string) : undefined);
  const num = (k: string): number | undefined => (typeof args[k] === "number" ? (args[k] as number) : undefined);
  return {
    title: str("title"),
    steps: stepsFromProposal(args.steps),
    priority: args.priority !== undefined ? String(args.priority) : undefined,
    areaPath: str("areaPath"),
    iterationPath: str("iterationPath"),
    testsWorkItemId: args.testsWorkItemId !== undefined ? String(args.testsWorkItemId) : undefined,
    planId: num("planId"),
    suiteId: num("suiteId"),
  };
}

// ---- test case ----------------------------------------------------------------------------------

export function CaseScreen({ id, onBack }: { id: number; onBack?: () => void }): ReactElement {
  const api = useApi();
  const write = useWrite();
  const [saved, setSaved] = useState<string | null>(null);
  const { state, reload } = useLoad(async () => {
    const item = await api.getTestCase(id);
    const f = item.fields ?? {};
    return {
      title: String(f[FIELD.title] ?? ""),
      state: typeof f[FIELD.state] === "string" ? (f[FIELD.state] as string) : undefined,
      priority: typeof f[FIELD.priority] === "number" ? (f[FIELD.priority] as number) : undefined,
      steps: parseSteps(f["Microsoft.VSTS.TCM.Steps"]),
    };
  }, `case:${id}`);

  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBar>{state.error}</ErrorBar>;
  const onSaveSteps = (steps: Step[]): void => {
    write.run(async () => {
      await api.updateSteps(id, stepsToText(steps));
      setSaved("Steps saved.");
      reload();
    }, "Could not save the steps");
  };
  return (
    <CaseView
      key={JSON.stringify(state.data.steps)}
      id={id}
      {...state.data}
      canEdit={api.can(TOOL.caseWrite)}
      busy={write.busy}
      error={write.error}
      saved={saved}
      onBack={onBack}
      onSaveSteps={onSaveSteps}
      onOpenWeb={() => api.openLink(`https://dev.azure.com/${encodeURIComponent(api.config.org)}/${encodeURIComponent(api.config.project)}/_workitems/edit/${id}`)}
    />
  );
}

// ---- new test case ------------------------------------------------------------------------------

export function TestCaseFormScreen({ prefill, onClose, onCreated }: { prefill?: TestCasePrefill; onClose?: () => void; onCreated?: () => void }): ReactElement {
  const api = useApi();
  const write = useWrite();
  const [created, setCreated] = useState<{ id: number; title: string } | null>(null);
  const [openId, setOpenId] = useState<number | undefined>();
  const [another, setAnother] = useState(false);

  const { state } = useLoad(async () => {
    const plans = toPlans(await api.testPlans().catch(() => ({})));
    const choices: SuiteChoice[] = [];
    for (const plan of plans.slice(0, 5)) {
      const suites = toSuites(await api.testSuites(plan.id).catch(() => ({})));
      for (const { suite, depth } of flattenSuites(suites)) choices.push({ planId: plan.id, suiteId: suite.id, label: `${plan.name} / ${"- ".repeat(depth)}${suite.name}` });
    }
    const iterations = await loadIterations(api).catch(() => [] as Iteration[]);
    return { choices, iterations };
  }, "case-form");

  if (openId !== undefined) return <CaseScreen id={openId} onBack={() => setOpenId(undefined)} />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBar>{state.error}</ErrorBar>;
  if (created) {
    return (
      <CreatedPanel
        type="Test Case"
        id={created.id}
        title={created.title}
        onOpen={() => setOpenId(created.id)}
        onAnother={() => {
          setCreated(null);
          setAnother(true);
        }}
        onClose={onClose}
      />
    );
  }

  const { choices, iterations } = state.data;
  const current = iterations.find((i) => i.timeFrame === "current") ?? pickDefaultIteration(iterations);
  const initialSuite = !another && prefill?.planId !== undefined && prefill.suiteId !== undefined ? { planId: prefill.planId, suiteId: prefill.suiteId } : undefined;
  const onSave = (values: TestCaseValues, suite?: { planId: number; suiteId: number }): void => {
    write.run(async () => {
      const item = await api.createTestCase(
        {
          title: values.title,
          steps: stepsToText(values.steps),
          priority: values.priority ? Number(values.priority) : undefined,
          areaPath: values.areaPath || undefined,
          iterationPath: values.iterationPath || undefined,
          testsWorkItemId: values.testsWorkItemId ? Number(values.testsWorkItemId) : undefined,
        },
        suite
      );
      setCreated({ id: item.id, title: values.title });
      onCreated?.();
    }, "Could not create the test case");
  };
  return (
    <TestCaseForm
      initial={another ? undefined : prefill}
      suites={choices}
      initialSuite={initialSuite}
      iterations={iterations}
      defaultIterationPath={prefill?.iterationPath ?? current?.path}
      defaultAreaPath={prefill?.areaPath ?? api.config.project}
      busy={write.busy}
      error={write.error}
      onSave={onSave}
      onCancel={onClose}
    />
  );
}

// ---- a plan -------------------------------------------------------------------------------------

function PlanScreen({ plan, onBack }: { plan: Plan; onBack: () => void }): ReactElement {
  const api = useApi();
  const write = useWrite();
  const [suiteId, setSuiteId] = useState<number | undefined>();
  const [caseId, setCaseId] = useState<number | undefined>();
  const [creating, setCreating] = useState(false);

  const suitesLoad = useLoad(async () => toSuites(await api.testSuites(plan.id)), `suites:${plan.id}`);
  const suites = suitesLoad.state.status === "ready" ? suitesLoad.state.data : [];
  const selected = suiteId ?? plan.rootSuiteId ?? suites[0]?.id;

  const casesLoad = useLoad(
    async (): Promise<CaseRow[]> => {
      if (selected === undefined) return [];
      const refs = toCaseRefs(await api.testCases(plan.id, selected));
      if (refs.length === 0) return [];
      const details = new Map(
        (
          await api
            .batch(
              refs.map((r) => r.id),
              [FIELD.id, FIELD.title, FIELD.state, FIELD.priority]
            )
            .catch(() => [])
        ).map((w) => [w.id, toCard(w)])
      );
      return refs.map((r) => ({ ...r, state: details.get(r.id)?.state, priority: details.get(r.id)?.priority }));
    },
    `cases:${plan.id}:${selected ?? ""}`
  );

  if (caseId !== undefined) return <CaseScreen id={caseId} onBack={() => setCaseId(undefined)} />;
  if (creating) {
    return (
      <TestCaseFormScreen
        prefill={selected !== undefined ? { planId: plan.id, suiteId: selected } : undefined}
        onClose={() => {
          setCreating(false);
          casesLoad.reload();
        }}
        onCreated={casesLoad.reload}
      />
    );
  }
  if (suitesLoad.state.status === "loading") return <Loading />;
  if (suitesLoad.state.status === "error") return <ErrorBar>{suitesLoad.state.error}</ErrorBar>;

  const onNewSuite = (name: string): void => {
    if (selected === undefined) return;
    write.run(async () => {
      await api.createSuite(plan.id, selected, name);
      suitesLoad.reload();
    }, "Could not create the suite");
  };
  const web = (path: string): void => api.openLink(`https://dev.azure.com/${encodeURIComponent(api.config.org)}/${encodeURIComponent(api.config.project)}/_testManagement/${path}`);
  return (
    <PlanView
      plan={plan}
      suites={suites}
      suiteId={selected}
      cases={casesLoad.state.status === "ready" ? casesLoad.state.data : []}
      casesLoading={casesLoad.state.status === "loading"}
      canWrite={api.can(TOOL.caseWrite)}
      busy={write.busy}
      error={write.error ?? (casesLoad.state.status === "error" ? casesLoad.state.error : null)}
      onBack={onBack}
      onSuite={setSuiteId}
      onOpenCase={setCaseId}
      onOpenWeb={(what) => web(what === "execute" ? `?planId=${plan.id}` : `?planId=${plan.id}&charts=true`)}
      onNewCase={() => setCreating(true)}
      onNewSuite={api.can(TOOL.suiteWrite) ? onNewSuite : undefined}
    />
  );
}

// ---- plans --------------------------------------------------------------------------------------

export function TestPlansScreen(): ReactElement {
  const api = useApi();
  const write = useWrite();
  const [plan, setPlan] = useState<Plan | undefined>();

  const { state, reload } = useLoad(async () => {
    const plans = toPlans(await api.testPlans());
    const iterations = await loadIterations(api).catch(() => [] as Iteration[]);
    return { plans, iterations };
  }, "plans");

  if (plan) return <PlanScreen plan={plan} onBack={() => setPlan(undefined)} />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBar>{state.error}</ErrorBar>;

  const onCreate = (v: { name: string; iteration: string; areaPath: string; description: string; startDate: string; endDate: string }): void => {
    write.run(async () => {
      await api.createTestPlan({
        name: v.name,
        iteration: v.iteration,
        areaPath: v.areaPath || undefined,
        description: v.description || undefined,
        startDate: v.startDate ? `${v.startDate}T00:00:00Z` : undefined,
        endDate: v.endDate ? `${v.endDate}T00:00:00Z` : undefined,
      });
      reload();
    }, "Could not create the test plan");
  };
  return <PlansList plans={state.data.plans} iterations={state.data.iterations} canCreate={api.can(TOOL.planWrite)} busy={write.busy} error={write.error} onOpen={setPlan} onCreate={onCreate} />;
}

// ---- results ------------------------------------------------------------------------------------

/** Results of a build: the tool result that opened the view already holds them. */
export function TestResultsScreen({ args, result }: { args: Record<string, unknown>; result?: unknown }): ReactElement {
  const parsed = parseToolResult(result as never);
  if (parsed.error) return <ErrorBar>{parsed.error}</ErrorBar>;
  const buildId = typeof args.buildid === "number" ? args.buildid : undefined;
  return <ResultsView buildId={buildId} results={toResults(parsed.data)} />;
}
