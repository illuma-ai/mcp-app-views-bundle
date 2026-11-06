/**
 * Browser entry point, bundled with the MCP Apps SDK, React and Fluent UI into each view document.
 *
 * One bundle serves every view; the inline `#k-config` JSON names the mode and carries the project,
 * team and tool list. The SDK `App` handles the handshake, host context, tool calls and links; this
 * file adapts it to React.
 */
import { App } from "@modelcontextprotocol/ext-apps/app-with-deps";
import { FluentProvider, teamsHighContrastTheme, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import type { ReactElement } from "react";
import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { type HostBridge, AdoApi, type ViewConfig } from "../lib/api";
import { frameStyle, surfaceVars, themeKind } from "../lib/host-theme";
import { parseToolResult, type ToolResultLike } from "../lib/result";
import { Frame, StableViewport } from "../ui/Frame";
import { proposalToValues } from "../lib/form";
import { PipelineEntry, RunFormScreen, runPrefillFrom } from "../ui/PipelineScreens";
import { PullEntry, PullFormScreen, pullPrefillFrom } from "../ui/PullScreens";
import { TestCaseFormScreen, TestPlansScreen, TestResultsScreen, testCasePrefillFrom } from "../ui/TestScreens";
import { BoardsScreen, NewItemScreen, SprintScreen, WorkItemEntry, ListScreen, type NewItemPrefill } from "../ui/Screens";
import { ApiContext, ErrorBar, Loading, RenderErrorBoundary } from "../ui/parts";

export type Mode = "pipelines" | "pipeline-form" | "pull-requests" | "pr-form" | "board" | "backlog" | "sprint" | "new-item" | "work-item" | "query" | "test-plans" | "test-case" | "test-results";
interface PageConfig {
  mode: Mode;
  config: ViewConfig;
}
interface HostCtx {
  theme?: string;
  locale?: string;
  timeZone?: string;
  styles?: { variables?: Record<string, unknown> };
}

interface State {
  args: Record<string, unknown>;
  result?: ToolResultLike;
  received: boolean;
  /** True once the host handshake finished; tool calls are only possible after it. */
  ready: boolean;
  ctx: HostCtx;
  failure?: string;
}

/** The latest tool input, result and host context, readable by React. */
class Store {
  private state: State = { args: {}, received: false, ready: false, ctx: {} };
  private listeners = new Set<() => void>();
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = (): State => this.state;
  set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
}

function readConfig(): PageConfig {
  try {
    const parsed = JSON.parse(document.getElementById("k-config")?.textContent ?? "{}") as Partial<PageConfig>;
    return {
      mode: parsed.mode ?? "board",
      config: parsed.config ?? { org: "", project: "", team: "", tools: [] },
    };
  } catch {
    return { mode: "board", config: { org: "", project: "", team: "", tools: [] } };
  }
}

function useForcedColors(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia("(forced-colors: active)");
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    () => window.matchMedia("(forced-colors: active)").matches
  );
}

/** The form's pre-fill comes from the entry tool's arguments (the assistant's proposal). */
function prefillFrom(args: Record<string, unknown>): NewItemPrefill {
  return proposalToValues(args);
}

function Root({ mode, api, store }: { mode: Mode; api: AdoApi; store: Store }): ReactElement {
  const st = useSyncExternalStore(store.subscribe, store.get);
  const forced = useForcedColors();
  const kind = themeKind(st.ctx.theme, forced);
  const theme = kind === "dark" ? webDarkTheme : kind === "highContrast" ? teamsHighContrastTheme : webLightTheme;
  const style = frameStyle(st.ctx.styles?.variables);

  // The project the opening tool call named (or the server default) is the scope of every call the view makes.
  api.setScope(st.args.project, st.args.team);
  let content: ReactElement;
  if (st.failure) content = <ErrorBar>{st.failure}</ErrorBar>;
  else if (!st.ready) content = <Loading />;
  else if (!st.received) {
    // Every view waits for the opening tool's input and result: they carry the proposal or the ids to show.
    content = <Loading />;
  } else if (mode === "new-item") content = <NewItemScreen prefill={prefillFrom(st.args)} />;
  else if (mode === "pipelines") content = <PipelineEntry args={st.args} />;
  else if (mode === "pipeline-form") content = <RunFormScreen prefill={runPrefillFrom(st.args)} />;
  else if (mode === "pull-requests") content = <PullEntry args={st.args} />;
  else if (mode === "pr-form") content = <PullFormScreen prefill={pullPrefillFrom(st.args)} />;
  else if (mode === "test-plans") content = <TestPlansScreen />;
  else if (mode === "test-case") content = <TestCaseFormScreen prefill={testCasePrefillFrom(st.args)} />;
  else if (mode === "test-results") content = <TestResultsScreen args={st.args} result={st.result} />;
  else if (mode === "sprint") content = <SprintScreen initialIteration={typeof st.args.iteration === "string" ? st.args.iteration : undefined} />;
  else if (mode === "work-item") content = <WorkItemEntry args={st.args} result={st.result} />;
  else if (mode === "query") content = <ListScreen heading="Query results" result={parseToolResult(st.result).data} />;
  else content = <BoardsScreen initialPage={mode === "backlog" || st.args.view === "backlog" ? "backlog" : "board"} />;

  return (
    <FluentProvider theme={theme} style={{ background: "transparent", ...surfaceVars(kind) }}>
      <ApiContext.Provider value={api}>
        <Frame style={style}>
          <StableViewport>
            <RenderErrorBoundary>{content}</RenderErrorBoundary>
          </StableViewport>
        </Frame>
      </ApiContext.Provider>
    </FluentProvider>
  );
}

async function start(): Promise<void> {
  const page = readConfig();
  const store = new Store();
  const app = new App({ name: "azure-devops-views", version: "1.0.0" }, {}, { autoResize: true });
  const caps = (): Record<string, unknown> => (app.getHostCapabilities() ?? {}) as Record<string, unknown>;
  const host: HostBridge = {
    callTool: (name, args) => app.callServerTool({ name, arguments: args }) as Promise<ToolResultLike>,
    openLink: async (url) => {
      await app.openLink({ url });
    },
    sendMessage: async (text) => {
      await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
    },
    canCallTools: () => Boolean(caps().serverTools),
    canOpenLinks: () => Boolean(caps().openLinks),
    canMessage: () => Boolean(caps().message),
  };
  const api = new AdoApi(host, page.config);

  // Handlers are registered before connect(): the host may send the result right after it.
  app.ontoolinput = (params) => store.set({ args: (params.arguments ?? {}) as Record<string, unknown> });
  app.ontoolresult = (res) => store.set({ result: res as ToolResultLike, received: true });
  app.onhostcontextchanged = (ctx) => store.set({ ctx: { ...(app.getHostContext() as HostCtx), ...(ctx as HostCtx) } });
  app.onteardown = async () => ({});

  createRoot(document.getElementById("app") as HTMLElement).render(<Root mode={page.mode} api={api} store={store} />);

  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("The host did not respond.")), 5000));
  try {
    await Promise.race([app.connect(), timeout]);
    const ctx = app.getHostContext();
    store.set({ ready: true, ...(ctx ? { ctx: ctx as HostCtx } : {}) });
  } catch (e) {
    store.set({ failure: `${(e as Error).message} The same information is in the tool result text.` });
  }
}

void start();
