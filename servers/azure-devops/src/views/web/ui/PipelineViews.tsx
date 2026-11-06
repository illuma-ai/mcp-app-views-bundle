/**
 * Presentational parts of the Pipelines views: the pipeline list, one pipeline's runs, one run
 * (summary, errors, stages and jobs, log) and the run pipeline review form. Containers in
 * PipelineScreens.tsx load the data; starting a run is a button handler there.
 */
import { SURFACE } from "../lib/host-theme";
import { Avatar, Button, Field, Input, MessageBar, MessageBarBody, Select, Tab, TabList, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import {
  ArrowLeftRegular,
  BranchForkRegular,
  CheckmarkCircleFilled,
  ClockRegular,
  DismissCircleFilled,
  ErrorCircleRegular,
  FilterRegular,
  InfoRegular,
  PlayCircleRegular,
  SubtractCircleFilled,
  TimerRegular,
  WarningFilled,
  ArrowSyncCircleFilled,
  CircleRegular,
  CalendarClockRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useState } from "react";
import { agoLabel } from "../lib/detail";
import { withDefaults } from "../lib/form";
import {
  type Pipeline,
  type Run,
  type RunFormValues,
  type RunResult,
  type StageRow,
  type TimelineNode,
  RESULT_LABEL,
  errorIssues,
  formatDuration,
  jobsSummary,
  parseVariables,
  runHeading,
  stageRows,
  worst,
} from "../lib/pipelines";
import { LinkButton, initialsOf } from "./parts";

const NARROW = "@media (max-width: 480px)";

const useStyles = makeStyles({
  action: { height: "30px", minHeight: "30px" },
  page: { backgroundColor: tokens.colorNeutralBackground2, padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: "8px" },
  bar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" },
  heading: { margin: 0, fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500, fontWeight: tokens.fontWeightRegular },
  panel: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4, padding: "12px 16px", display: "flex", flexDirection: "column", gap: "4px" },
  panelTitle: { fontSize: tokens.fontSizeBase400, margin: "0 0 4px" },
  head: { display: "grid", gap: "8px", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, padding: "4px 0" },
  listHead: { gridTemplateColumns: "minmax(0,2fr) minmax(0,3fr) 130px", [NARROW]: { gridTemplateColumns: "minmax(0,1fr)" } },
  runHead: { gridTemplateColumns: "minmax(0,3fr) minmax(0,1fr) 130px", [NARROW]: { gridTemplateColumns: "minmax(0,1fr)" } },
  row: {
    display: "grid",
    alignItems: "center",
    gap: "8px",
    padding: "5px 0",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    fontSize: tokens.fontSizeBase300,
    minWidth: 0,
  },
  listRow: { gridTemplateColumns: "minmax(0,2fr) minmax(0,3fr) 130px", [NARROW]: { gridTemplateColumns: "minmax(0,1fr)" } },
  runRow: { gridTemplateColumns: "minmax(0,3fr) minmax(0,1fr) 130px", [NARROW]: { gridTemplateColumns: "minmax(0,1fr)" } },
  name: { display: "flex", alignItems: "center", gap: "12px", minWidth: 0, fontWeight: tokens.fontWeightSemibold },
  titleLine: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", justifyContent: "flex-start", textAlign: "left", minWidth: 0, fontWeight: tokens.fontWeightSemibold },
  sub: { display: "flex", alignItems: "center", gap: "6px", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, flexWrap: "wrap" },
  mono: { fontFamily: tokens.fontFamilyMonospace },
  time: { display: "flex", flexDirection: "column", gap: "2px", fontSize: tokens.fontSizeBase200 },
  timeLine: { display: "inline-flex", alignItems: "center", gap: "4px" },
  help: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  empty: { textAlign: "center", padding: "20px", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300 },
  banner: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4, padding: "21px 16px", display: "flex", alignItems: "center", gap: "12px", fontSize: tokens.fontSizeBase300 },
  summaryTop: { display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", alignItems: "flex-start" },
  summaryTitle: { display: "flex", alignItems: "center", gap: "6px", fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500 },
  facts: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", marginTop: "8px", [NARROW]: { gridTemplateColumns: "minmax(0, 1fr)" } },
  factLabel: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  factValue: { display: "flex", alignItems: "center", gap: "6px", fontSize: tokens.fontSizeBase300 },
  errorRow: { display: "flex", gap: "8px", alignItems: "flex-start", padding: "8px 0", borderTop: `1px solid ${tokens.colorNeutralStroke3}`, fontSize: tokens.fontSizeBase300 },
  stageRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0,2fr) minmax(0,2fr) 80px",
    gap: "8px",
    alignItems: "center",
    padding: "8px 0",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    fontSize: tokens.fontSizeBase300,
  },
  log: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    backgroundColor: SURFACE.inset,
    padding: "8px",
    overflow: "auto",
    maxHeight: "320px",
    whiteSpace: "pre-wrap",
    margin: 0,
  },
  filter: { minWidth: "160px" },
  form: { backgroundColor: tokens.colorNeutralBackground1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", [NARROW]: { gridTemplateColumns: "minmax(0, 1fr)" } },
});

const RESULT_COLOR: Record<RunResult, string> = { succeeded: "#107c10", failed: "#c50f1f", partial: "#c19c00", canceled: "#8a8886", running: "#0f6cbd", queued: "#8a8886", unknown: "#8a8886" };

/** The result icon of a run, stage or job. */
export function ResultIcon({ result, size = 24 }: { result: RunResult; size?: number }): ReactElement {
  const p = { fontSize: size, color: RESULT_COLOR[result] };
  const icon =
    result === "succeeded" ? (
      <CheckmarkCircleFilled {...p} />
    ) : result === "failed" ? (
      <DismissCircleFilled {...p} />
    ) : result === "partial" ? (
      <WarningFilled {...p} />
    ) : result === "canceled" ? (
      <SubtractCircleFilled {...p} />
    ) : result === "running" ? (
      <ArrowSyncCircleFilled {...p} />
    ) : result === "queued" ? (
      <ClockRegular {...p} />
    ) : (
      <CircleRegular {...p} />
    );
  return (
    <span role="img" aria-label={RESULT_LABEL[result]} title={RESULT_LABEL[result]} style={{ display: "inline-flex" }}>
      {icon}
    </span>
  );
}

function RunTimes({ run, now }: { run: Run; now?: Date }): ReactElement {
  const s = useStyles();
  const when = run.queued ?? run.started;
  const dur = formatDuration(run.started, run.finished);
  return (
    <div className={s.time}>
      <span className={s.timeLine}>
        <CalendarClockRegular />
        {when ? agoLabel(when, now) : ""}
      </span>
      {dur && (
        <span className={s.timeLine}>
          <TimerRegular />
          {dur}
        </span>
      )}
    </div>
  );
}

/** "Individual CI for (avatar) main 4672446d". */
function RunWho({ run, showCommit }: { run: Run; showCommit?: boolean }): ReactElement {
  const s = useStyles();
  return (
    <div className={s.sub}>
      <span>{`${run.trigger} for`}</span>
      {run.requestedBy && <Avatar name={run.requestedBy.name} initials={initialsOf(run.requestedBy.name)} size={16} color="colorful" />}
      <span className={s.timeLine}>
        <BranchForkRegular />
        <span className={s.mono}>{run.branch}</span>
      </span>
      {showCommit && run.commit && <span className={s.mono}>{run.commit}</span>}
    </div>
  );
}

// ---- pipeline list ------------------------------------------------------------------------------

export type PipelineTab = "Recent" | "All" | "Runs";

export interface PipelineListProps {
  pipelines: Pipeline[];
  runs: Run[];
  tab: PipelineTab;
  loading?: boolean;
  canCreate?: boolean;
  now?: Date;
  onTab?: (tab: PipelineTab) => void;
  onNew?: () => void;
  onOpen?: (pipeline: Pipeline) => void;
  onOpenRun?: (run: Run) => void;
}

export function PipelineList(props: PipelineListProps): ReactElement {
  const s = useStyles();
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const pipelines = props.pipelines.filter((p) => needle === "" || p.name.toLowerCase().includes(needle));
  const recent = pipelines.filter((p) => p.lastRun).sort((a, b) => Date.parse(b.lastRun?.queued ?? "") - Date.parse(a.lastRun?.queued ?? ""));
  const runs = props.runs.filter((r) => needle === "" || r.pipelineName.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle));
  const shown = props.tab === "Recent" ? recent : pipelines;
  return (
    <div className={s.page}>
      <div className={s.bar}>
        <h1 className={s.heading}>Pipelines</h1>
        <Button appearance="primary" className={s.action} onClick={props.onNew}>
          New pipeline
        </Button>
      </div>
      <div className={s.bar}>
        <TabList selectedValue={props.tab} size="small" onTabSelect={(_, d) => props.onTab?.(d.value as PipelineTab)}>
          <Tab value="Recent">Recent</Tab>
          <Tab value="All">All</Tab>
          <Tab value="Runs">Runs</Tab>
        </TabList>
        <Input className={s.filter} contentBefore={<FilterRegular />} placeholder="Filter pipelines" aria-label="Filter pipelines" value={filter} onChange={(_, d) => setFilter(d.value)} />
      </div>
      {props.tab === "Runs" ? (
        <div className={s.panel} role="list" aria-label="Runs">
          <div className={`${s.head} ${s.runHead}`}>
            <span>Description</span>
            <span>Pipeline</span>
            <span />
          </div>
          {!props.loading && runs.length === 0 && <div className={s.empty}>No runs</div>}
          {runs.map((r) => (
            <div key={r.id} className={`${s.row} ${s.runRow}`} role="listitem">
              <div className={s.name}>
                <ResultIcon result={r.result} />
                <div style={{ minWidth: 0 }}>
                  <LinkButton className={s.titleLine} onClick={() => props.onOpenRun?.(r)}>
                    {runHeading(r)}
                  </LinkButton>
                  <RunWho run={r} showCommit />
                </div>
              </div>
              <span>{r.pipelineName}</span>
              <RunTimes run={r} now={props.now} />
            </div>
          ))}
        </div>
      ) : (
        <div className={s.panel} role="list" aria-label="Pipelines">
          <h2 className={s.panelTitle}>{props.tab === "Recent" ? "Recently run pipelines" : "All pipelines"}</h2>
          <div className={`${s.head} ${s.listHead}`}>
            <span>Pipeline</span>
            <span>Last run</span>
            <span />
          </div>
          {!props.loading && shown.length === 0 && <div className={s.empty}>{props.tab === "Recent" ? "No pipelines have run yet" : "No pipelines"}</div>}
          {shown.map((p) => (
            <div key={p.id} className={`${s.row} ${s.listRow}`} role="listitem" data-testid={`pipeline-${p.id}`}>
              <div className={s.name}>
                {p.lastRun ? <ResultIcon result={p.lastRun.result} /> : <PlayCircleRegular fontSize={24} />}
                <LinkButton className={s.titleLine} onClick={() => props.onOpen?.(p)}>
                  {p.name}
                </LinkButton>
              </div>
              {p.lastRun ? (
                <div style={{ minWidth: 0 }}>
                  <LinkButton className={s.titleLine} onClick={() => props.onOpenRun?.(p.lastRun as Run)}>
                    {runHeading(p.lastRun)}
                  </LinkButton>
                  <RunWho run={p.lastRun} />
                </div>
              ) : (
                <span className={s.help}>No runs yet</span>
              )}
              {p.lastRun ? <RunTimes run={p.lastRun} now={props.now} /> : <span />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- one pipeline's runs ------------------------------------------------------------------------

export type RunsTab = "Runs" | "Stages" | "Branches" | "Analytics";

export interface PipelineRunsProps {
  pipeline: { id: number; name: string };
  runs: Run[];
  tab: RunsTab;
  loading?: boolean;
  canRun: boolean;
  now?: Date;
  onTab?: (tab: RunsTab) => void;
  onBack?: () => void;
  /** Opens the review form for a new run (the "Run pipeline" button). */
  onRun?: () => void;
  /** Opens the pipeline's YAML editor in the web UI. */
  onEdit?: () => void;
  onOpenRun?: (run: Run) => void;
}

export function PipelineRuns(props: PipelineRunsProps): ReactElement {
  const s = useStyles();
  const runs = props.runs;
  const latestByBranch = [...new Map(runs.map((r) => [r.branch, r])).values()];
  const done = runs.filter((r) => r.result !== "running" && r.result !== "queued");
  const succeeded = done.filter((r) => r.result === "succeeded").length;
  const durations = runs.map((r) => (r.started && r.finished ? Date.parse(r.finished) - Date.parse(r.started) : NaN)).filter((n) => Number.isFinite(n) && n >= 0);
  const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  return (
    <div className={s.page}>
      <div className={s.bar}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {props.onBack && <Button appearance="subtle" size="small" icon={<ArrowLeftRegular />} aria-label="Back to pipelines" onClick={props.onBack} />}
          <h1 className={s.heading}>{props.pipeline.name}</h1>
        </span>
        <span style={{ display: "inline-flex", gap: 8 }}>
          <Button appearance="secondary" className={s.action} onClick={props.onEdit}>
            Edit
          </Button>
          {props.canRun && (
            <Button appearance="primary" className={s.action} onClick={props.onRun}>
              Run pipeline
            </Button>
          )}
        </span>
      </div>
      <TabList selectedValue={props.tab} size="small" onTabSelect={(_, d) => props.onTab?.(d.value as RunsTab)}>
        <Tab value="Runs">Runs</Tab>
        <Tab value="Stages">Stages</Tab>
        <Tab value="Branches">Branches</Tab>
        <Tab value="Analytics">Analytics</Tab>
      </TabList>
      {props.tab === "Runs" && (
        <div className={s.panel} role="list" aria-label="Runs">
          <div className={`${s.head} ${s.runHead}`}>
            <span>Description</span>
            <span>Stages</span>
            <span />
          </div>
          {!props.loading && runs.length === 0 && <div className={s.empty}>Get started and run this pipeline for the first time!</div>}
          {runs.map((r) => (
            <div key={r.id} className={`${s.row} ${s.runRow}`} role="listitem" data-testid={`run-${r.id}`}>
              <div className={s.name}>
                <ResultIcon result={r.result} />
                <div style={{ minWidth: 0 }}>
                  <LinkButton className={s.titleLine} onClick={() => props.onOpenRun?.(r)}>
                    {runHeading(r)}
                  </LinkButton>
                  <RunWho run={r} showCommit />
                </div>
              </div>
              <ResultIcon result={r.result} />
              <RunTimes run={r} now={props.now} />
            </div>
          ))}
        </div>
      )}
      {props.tab === "Stages" && (
        <div className={s.panel}>
          <div className={s.help}>The stages of a run are listed on the run. Open a run to see its stages and jobs.</div>
        </div>
      )}
      {props.tab === "Branches" && (
        <div className={s.panel} role="list" aria-label="Branches">
          <div className={`${s.head} ${s.runHead}`}>
            <span>Branch</span>
            <span />
            <span />
          </div>
          {latestByBranch.length === 0 && <div className={s.empty}>No runs yet</div>}
          {latestByBranch.map((r) => (
            <div key={r.branch} className={`${s.row} ${s.runRow}`} role="listitem">
              <div className={s.name}>
                <ResultIcon result={r.result} />
                <span className={s.mono}>{r.branch}</span>
              </div>
              <LinkButton onClick={() => props.onOpenRun?.(r)}>{`#${r.number}`}</LinkButton>
              <RunTimes run={r} now={props.now} />
            </div>
          ))}
        </div>
      )}
      {props.tab === "Analytics" && (
        <div className={s.panel}>
          <div className={s.facts}>
            <div>
              <div className={s.factLabel}>Runs</div>
              <div className={s.factValue}>{runs.length}</div>
            </div>
            <div>
              <div className={s.factLabel}>Pass rate</div>
              <div className={s.factValue}>{done.length > 0 ? `${Math.round((succeeded / done.length) * 100)}%` : "No data"}</div>
            </div>
            <div>
              <div className={s.factLabel}>Average duration</div>
              <div className={s.factValue}>{avg > 0 ? formatDuration("1970-01-01T00:00:00Z", new Date(avg).toISOString()) : "No data"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- one run ------------------------------------------------------------------------------------

export interface RunDetailProps {
  run: Run;
  timeline: TimelineNode[];
  changeCount: number;
  workItemCount: number;
  /** The log being shown (a job or task name) and its lines. */
  log?: { name: string; lines: string[] } | null;
  logLoading?: boolean;
  logError?: string | null;
  canRun: boolean;
  now?: Date;
  onBack?: () => void;
  onRunNew?: () => void;
  /** Opens the run in the web UI (rerun failed jobs, parameters, changes, documentation). */
  onOpenWeb?: () => void;
  /** Opens the troubleshooting documentation. */
  onOpenDocs?: () => void;
  onOpenLog?: (node: TimelineNode) => void;
}

export const DOCS_URL = "https://learn.microsoft.com/azure/devops/pipelines/troubleshooting/troubleshooting";

export function RunDetailView(props: RunDetailProps): ReactElement {
  const s = useStyles();
  const [view, setView] = useState<"Stages" | "Jobs">("Stages");
  const { run } = props;
  const rows: StageRow[] = stageRowsOf(props.timeline);
  const jobs = props.timeline.filter((n) => n.kind === "Job");
  const errors = errorIssues(props.timeline);
  const dur = formatDuration(run.started, run.finished);
  return (
    <div className={s.page}>
      <div className={s.bar}>
        <span style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
          {props.onBack && <Button appearance="subtle" size="small" icon={<ArrowLeftRegular />} aria-label="Back to the pipeline" onClick={props.onBack} />}
          <ResultIcon result={run.result} size={28} />
          <span style={{ minWidth: 0 }}>
            <h1 className={s.heading}>{runHeading(run)}</h1>
            <span className={s.help}>{run.pipelineName}</span>
          </span>
        </span>
        <span style={{ display: "inline-flex", gap: 8 }}>
          {run.result === "failed" && (
            <Button appearance="secondary" className={s.action} onClick={props.onOpenWeb}>
              Rerun failed jobs
            </Button>
          )}
          {props.canRun && (
            <Button appearance="primary" className={s.action} onClick={props.onRunNew}>
              Run new
            </Button>
          )}
        </span>
      </div>
      <div className={s.banner}>
        <InfoRegular color="#0f6cbd" />
        <span>This run will be cleaned up after 1 month based on your project settings.</span>
      </div>
      <TabList selectedValue="Summary" size="small">
        <Tab value="Summary">Summary</Tab>
        <Tab value="Coverage" disabled>
          Code Coverage*
        </Tab>
      </TabList>
      <div className={s.panel}>
        <div className={s.summaryTop}>
          <div>
            <div className={s.summaryTitle}>
              <span>{`${run.trigger} by`}</span>
              {run.requestedBy && <Avatar name={run.requestedBy.name} initials={initialsOf(run.requestedBy.name)} size={24} color="colorful" />}
              <span>{run.requestedBy?.name ?? ""}</span>
            </div>
            <div className={s.sub} style={{ marginTop: 4 }}>
              <span className={s.timeLine}>
                <CalendarClockRegular />
                {run.queued || run.started ? agoLabel((run.queued ?? run.started) as string, props.now) : ""}
              </span>
              {dur && (
                <span className={s.timeLine}>
                  <TimerRegular />
                  {dur}
                </span>
              )}
            </div>
          </div>
          <span style={{ display: "inline-flex", gap: 8 }}>
            <Button appearance="secondary" onClick={props.onOpenWeb}>{`View ${props.changeCount} ${props.changeCount === 1 ? "change" : "changes"}`}</Button>
            <Button appearance="secondary" onClick={props.onOpenWeb}>
              Parameters
            </Button>
          </span>
        </div>
        <div className={s.facts}>
          <div>
            <div className={s.factLabel}>Repository and version</div>
            <div className={s.factValue}>{run.repository ?? ""}</div>
            <div className={s.factValue}>
              <BranchForkRegular />
              <span>{run.branch}</span>
              <span className={s.mono}>{run.commit}</span>
            </div>
          </div>
          <div>
            <div className={s.factLabel}>Related</div>
            <div className={s.factValue}>{`${props.workItemCount} work items`}</div>
            <div className={s.factValue}>0 published</div>
          </div>
          <div>
            <div className={s.factLabel}>Tests and coverage</div>
            <LinkButton onClick={props.onOpenWeb}>Get started</LinkButton>
          </div>
        </div>
      </div>
      {errors.length > 0 && (
        <div className={s.panel}>
          <h2 className={s.panelTitle}>
            Errors <span className={s.help}>{errors.length}</span>
          </h2>
          {errors.map((e, i) => (
            <div key={i} className={s.errorRow}>
              <ErrorCircleRegular color="#c50f1f" fontSize={20} />
              <div style={{ minWidth: 0 }}>
                <div style={{ wordBreak: "break-word" }}>{e.message}</div>
                <div className={s.help}>{run.number}</div>
              </div>
            </div>
          ))}
          <div style={{ textAlign: "right", paddingTop: 8 }}>
            <LinkButton onClick={() => props.onOpenDocs?.()}>View documentation for troubleshooting failed runs</LinkButton>
          </div>
        </div>
      )}
      <div className={s.panel}>
        <TabList selectedValue={view} size="small" onTabSelect={(_, d) => setView(d.value as "Stages" | "Jobs")}>
          <Tab value="Stages">Stages</Tab>
          <Tab value="Jobs">Jobs</Tab>
        </TabList>
        {view === "Stages" &&
          rows.map((r) => (
            <div key={r.stage.id}>
              <div className={s.stageRow}>
                <span className={s.name}>
                  <ResultIcon result={r.stage.result} />
                  {r.stage.name}
                </span>
                <span>{jobsSummary(r.jobs)}</span>
                <span className={s.help}>{formatDuration(r.stage.started, r.stage.finished)}</span>
              </div>
              {r.jobs.map((j) => (
                <div key={j.id} className={s.stageRow} style={{ paddingLeft: 28 }}>
                  <span className={s.name}>
                    <ResultIcon result={j.result} size={20} />
                    <LinkButton onClick={() => props.onOpenLog?.(j)}>{j.name}</LinkButton>
                  </span>
                  <span className={s.help}>{formatDuration(j.started, j.finished)}</span>
                  <span />
                </div>
              ))}
            </div>
          ))}
        {view === "Jobs" &&
          jobs.map((j) => (
            <div key={j.id} className={s.stageRow}>
              <span className={s.name}>
                <ResultIcon result={j.result} size={20} />
                <LinkButton onClick={() => props.onOpenLog?.(j)}>{j.name}</LinkButton>
              </span>
              <span className={s.help}>{RESULT_LABEL[j.result]}</span>
              <span className={s.help}>{formatDuration(j.started, j.finished)}</span>
            </div>
          ))}
        {rows.length === 0 && <div className={s.empty}>No stages were recorded for this run</div>}
      </div>
      {(props.log || props.logLoading || props.logError) && (
        <div className={s.panel} aria-label="Log">
          <h2 className={s.panelTitle}>{props.log ? `Log: ${props.log.name}` : "Log"}</h2>
          {props.logLoading && <div className={s.help}>Loading the log...</div>}
          {props.logError && (
            <MessageBar intent="error">
              <MessageBarBody>{props.logError}</MessageBarBody>
            </MessageBar>
          )}
          {props.log && <pre className={s.log}>{props.log.lines.length > 0 ? props.log.lines.join("\n") : "This step wrote no log."}</pre>}
        </div>
      )}
    </div>
  );
}

function stageRowsOf(nodes: TimelineNode[]): StageRow[] {
  return stageRows(nodes).map((r) => ({ ...r, stage: { ...r.stage, result: r.stage.kind === "Stage" && r.stage.id === "stage" ? worst(r.jobs.map((j) => j.result)) : r.stage.result } }));
}

// ---- run pipeline form --------------------------------------------------------------------------

export interface RunFormProps {
  pipelines: { id: number; name: string }[];
  branches: string[];
  initial?: Partial<RunFormValues>;
  busy?: boolean;
  error?: string | null;
  onPipeline?: (id: number) => void;
  onSave?: (values: RunFormValues) => void;
  onCancel?: () => void;
}

export function RunForm(props: RunFormProps): ReactElement {
  const s = useStyles();
  const defaultBranch = props.branches.includes("main") ? "main" : props.branches.includes("master") ? "master" : (props.branches[0] ?? "");
  const [v, setV] = useState<RunFormValues>(withDefaults({ pipelineId: props.pipelines[0]?.id ?? 0, branch: defaultBranch, variables: "" }, props.initial));
  const [touched, setTouched] = useState(false);
  const { invalid } = parseVariables(v.variables);
  const bad = v.pipelineId === 0 || v.branch === "" || invalid.length > 0;
  return (
    <div className={s.form}>
      <div style={{ fontSize: tokens.fontSizeBase200, fontWeight: 600, letterSpacing: "0.04em", display: "flex", gap: 6, alignItems: "center" }}>
        <PlayCircleRegular color="#0f6cbd" />
        <span>RUN PIPELINE *</span>
      </div>
      <div className={s.grid2}>
        <Field label="Pipeline">
          <Select
            value={String(v.pipelineId)}
            disabled={props.busy}
            onChange={(_, d) => {
              setV((p) => ({ ...p, pipelineId: Number(d.value) }));
              props.onPipeline?.(Number(d.value));
            }}>
            {props.pipelines.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Branch/tag" validationState={touched && v.branch === "" ? "error" : "none"} validationMessage={touched && v.branch === "" ? "Choose a branch" : undefined}>
          {props.branches.length > 0 ? (
            <Select value={v.branch} disabled={props.busy} onChange={(_, d) => setV((p) => ({ ...p, branch: d.value }))}>
              {props.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          ) : (
            <Input value={v.branch} disabled={props.busy} onChange={(_, d) => setV((p) => ({ ...p, branch: d.value }))} />
          )}
        </Field>
      </div>
      <Field
        label="Variables (NAME=value, one per line)"
        validationState={touched && invalid.length > 0 ? "error" : "none"}
        validationMessage={touched && invalid.length > 0 ? `Not a NAME=value line: ${invalid[0]}` : undefined}>
        <Textarea rows={3} resize="vertical" placeholder="Optional" value={v.variables} disabled={props.busy} onChange={(_, d) => setV((p) => ({ ...p, variables: d.value }))} />
      </Field>
      <div className={s.help}>Nothing is started until you press Run. The host then asks you to approve it.</div>
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
          <Button
            appearance="primary"
            disabled={props.busy}
            onClick={() => {
              setTouched(true);
              if (!bad) props.onSave?.(v);
            }}>
            Run
          </Button>
        </span>
      </div>
    </div>
  );
}
