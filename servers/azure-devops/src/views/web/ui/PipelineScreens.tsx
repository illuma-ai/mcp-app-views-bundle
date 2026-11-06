/**
 * The Pipelines screens: containers that load pipelines, runs, a run's timeline and logs through the
 * host. Reads happen in loaders and read handlers; starting a run is the Run button's `on...` handler,
 * runs through `useWrite`, and is approved by the user in the host. A test enforces this.
 */
import type { ReactElement } from "react";
import { useState } from "react";
import { TOOL } from "../lib/api";
import { toBranches, toRepos } from "../lib/pulls";
import { parseVariables, toLogLines, toPipelines, toRuns, toTimeline, type Pipeline, type Run, type RunFormValues, type TimelineNode } from "../lib/pipelines";
import { useLoad } from "./hooks";
import { CreatedPanel } from "./NewItemForm";
import { ErrorBar, Loading, useApi, useWrite } from "./parts";
import { DOCS_URL, PipelineList, PipelineRuns, RunDetailView, RunForm, type PipelineTab, type RunsTab } from "./PipelineViews";

export interface RunPrefill {
  pipeline?: string;
  branch?: string;
  variables?: string;
}

/** The proposal the model passes to `pipelines_run_form`. */
export function runPrefillFrom(args: Record<string, unknown>): RunPrefill {
  const str = (k: string): string | undefined => (typeof args[k] === "string" ? (args[k] as string) : undefined);
  return { pipeline: str("pipeline"), branch: str("branch")?.replace(/^refs\/heads\//, ""), variables: str("variables") };
}

// ---- one run ------------------------------------------------------------------------------------

export function RunScreen({ id, onBack, onRunNew }: { id: number; onBack?: () => void; onRunNew?: (run: Run) => void }): ReactElement {
  const api = useApi();
  const [log, setLog] = useState<{ name: string; lines: string[] } | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const { state } = useLoad(async () => {
    const [raw, timeline, changes] = await Promise.all([api.build(id), api.buildTimeline(id).catch(() => []), api.buildChanges(id).catch(() => [])]);
    const list = Array.isArray(changes) ? changes : [];
    return { run: toRuns([raw])[0], timeline: toTimeline(timeline), changeCount: list.length };
  }, `run:${id}`);

  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBar>{state.error}</ErrorBar>;

  const onOpenLog = (node: TimelineNode): void => {
    if (node.logId === undefined) {
      setLog({ name: node.name, lines: [] });
      return;
    }
    setLogLoading(true);
    setLogError(null);
    api
      .buildLogLines(id, node.logId)
      .then((raw) => setLog({ name: node.name, lines: toLogLines(raw) }))
      .catch((e: Error) => setLogError(`Could not load the log: ${e.message}`))
      .finally(() => setLogLoading(false));
  };
  const web = `https://dev.azure.com/${encodeURIComponent(api.config.org)}/${encodeURIComponent(api.config.project)}/_build/results?buildId=${id}`;
  return (
    <RunDetailView
      run={state.data.run}
      timeline={state.data.timeline}
      changeCount={state.data.changeCount}
      workItemCount={0}
      log={log}
      logLoading={logLoading}
      logError={logError}
      canRun={api.can(TOOL.pipelinesWrite)}
      onBack={onBack}
      onRunNew={() => onRunNew?.(state.data.run)}
      onOpenWeb={() => api.openLink(web)}
      onOpenDocs={() => api.openLink(DOCS_URL)}
      onOpenLog={onOpenLog}
    />
  );
}

// ---- run pipeline -------------------------------------------------------------------------------

export function RunFormScreen({ prefill, pipelineId, onClose, onStarted }: { prefill?: RunPrefill; pipelineId?: number; onClose?: () => void; onStarted?: () => void }): ReactElement {
  const api = useApi();
  const write = useWrite();
  const [chosen, setChosen] = useState<number | undefined>(pipelineId);
  const [started, setStarted] = useState<{ id: number; name: string } | null>(null);
  const [openRun, setOpenRun] = useState<number | undefined>();

  const load = useLoad(async () => {
    const [pipelines, repos] = await Promise.all([api.pipelines().then(toPipelines), api.repositories().then(toRepos)]);
    return { pipelines, repos };
  }, "run-form");
  const data = load.state.status === "ready" ? load.state.data : undefined;
  const wanted = prefill?.pipeline?.toLowerCase();
  const pipeline = data ? (data.pipelines.find((p) => p.id === chosen) ?? data.pipelines.find((p) => String(p.id) === wanted || p.name.toLowerCase() === wanted) ?? data.pipelines[0]) : undefined;
  const repo = data ? (data.repos.find((r) => r.name === pipeline?.lastRun?.repository) ?? data.repos[0]) : undefined;
  const branchesLoad = useLoad(async () => (repo ? toBranches(await api.branches(repo.id)) : []), `run-branches:${repo?.id ?? ""}`);

  if (openRun !== undefined) return <RunScreen id={openRun} onBack={() => setOpenRun(undefined)} />;
  if (load.state.status === "loading" || branchesLoad.state.status === "loading") return <Loading />;
  if (load.state.status === "error") return <ErrorBar>{load.state.error}</ErrorBar>;
  if (branchesLoad.state.status === "error") return <ErrorBar>{branchesLoad.state.error}</ErrorBar>;
  if (started) {
    return <CreatedPanel type="Run" id={started.id} title={started.name} onOpen={() => setOpenRun(started.id)} onAnother={() => setStarted(null)} onClose={onClose} />;
  }
  if (!pipeline) return <ErrorBar>This project has no pipelines to run.</ErrorBar>;

  const onSave = (v: RunFormValues): void => {
    write.run(async () => {
      const run = await api.runPipeline(v.pipelineId, { branch: v.branch, variables: parseVariables(v.variables).variables });
      setStarted({ id: Number(run.id), name: String(run.name ?? pipeline.name) });
      onStarted?.();
    }, "Could not start the run");
  };
  return (
    <RunForm
      key={pipeline.id}
      pipelines={load.state.data.pipelines.map((p) => ({ id: p.id, name: p.name }))}
      branches={branchesLoad.state.data}
      initial={{ pipelineId: pipeline.id, branch: prefill?.branch, variables: prefill?.variables }}
      busy={write.busy}
      error={write.error}
      onPipeline={setChosen}
      onSave={onSave}
      onCancel={onClose}
    />
  );
}

// ---- the list and one pipeline ------------------------------------------------------------------

type Selected = { kind: "pipeline"; pipeline: Pipeline } | { kind: "run"; id: number; back?: Pipeline } | { kind: "form"; pipelineId?: number; back?: Selected };

export function PipelinesScreen({ openRun, openPipeline }: { openRun?: number; openPipeline?: number }): ReactElement {
  const api = useApi();
  const [tab, setTab] = useState<PipelineTab>("Recent");
  const [runsTab, setRunsTab] = useState<RunsTab>("Runs");
  const [selected, setSelected] = useState<Selected | undefined>(openRun ? { kind: "run", id: openRun } : undefined);
  const { state, reload } = useLoad(async () => {
    const [pipelines, runs] = await Promise.all([api.pipelines().then(toPipelines), api.builds({ top: 100 }).then(toRuns)]);
    // Definitions without a latest build in the list result get theirs from the run list.
    return { pipelines: pipelines.map((p) => ({ ...p, lastRun: p.lastRun ?? runs.find((r) => r.pipelineId === p.id) })), runs };
  }, "pipelines");

  const webBase = `https://dev.azure.com/${encodeURIComponent(api.config.org)}/${encodeURIComponent(api.config.project)}/_build`;
  const preselected = state.status === "ready" && openPipeline !== undefined && selected === undefined ? state.data.pipelines.find((p) => p.id === openPipeline) : undefined;
  const current: Selected | undefined = selected ?? (preselected ? { kind: "pipeline", pipeline: preselected } : undefined);

  if (current?.kind === "run")
    return (
      <RunScreen
        id={current.id}
        onBack={() => setSelected(current.back ? { kind: "pipeline", pipeline: current.back } : undefined)}
        onRunNew={(r) => setSelected({ kind: "form", pipelineId: r.pipelineId, back: current })}
      />
    );
  if (current?.kind === "form") {
    return (
      <RunFormScreen
        pipelineId={current.pipelineId}
        onClose={() => {
          setSelected(current.back);
          reload();
        }}
        onStarted={reload}
      />
    );
  }
  if (state.status === "error") return <ErrorBar>{state.error}</ErrorBar>;
  if (current?.kind === "pipeline") {
    const pipeline = current.pipeline;
    const runs = state.status === "ready" ? state.data.runs.filter((r) => r.pipelineId === pipeline.id) : [];
    return (
      <PipelineRuns
        pipeline={pipeline}
        runs={runs}
        tab={runsTab}
        loading={state.status === "loading"}
        canRun={api.can(TOOL.pipelinesWrite)}
        onTab={setRunsTab}
        onBack={() => setSelected(undefined)}
        onRun={() => setSelected({ kind: "form", pipelineId: pipeline.id, back: current })}
        onEdit={() => api.openLink(`${webBase}/edit?definitionId=${pipeline.id}`)}
        onOpenRun={(r) => setSelected({ kind: "run", id: r.id, back: pipeline })}
      />
    );
  }
  return (
    <PipelineList
      pipelines={state.status === "ready" ? state.data.pipelines : []}
      runs={state.status === "ready" ? state.data.runs : []}
      tab={tab}
      loading={state.status === "loading"}
      canCreate
      onTab={setTab}
      onNew={() => api.openLink(`${webBase}?view=newPipeline`)}
      onOpen={(p) => setSelected({ kind: "pipeline", pipeline: p })}
      onOpenRun={(r) => setSelected({ kind: "run", id: r.id })}
    />
  );
}

/** Routes the pipeline tools: one run when the call named it, one pipeline's runs, the list otherwise. */
export function PipelineEntry({ args }: { args: Record<string, unknown> }): ReactElement {
  const num = (v: unknown): number | undefined => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
  const runId = num(args.buildId) ?? num(args.runId);
  const pipelineId = num(args.pipelineId) ?? (Array.isArray(args.definitions) ? num(args.definitions[0]) : undefined) ?? num(args.definitionId);
  return <PipelinesScreen openRun={runId} openPipeline={runId ? undefined : pipelineId} />;
}
