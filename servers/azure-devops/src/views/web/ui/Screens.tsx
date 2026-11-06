/**
 * The boards screens: containers that load data through the host and hand it to the presentational
 * content components. Reads happen in loaders; every write starts from a handler named `on...`
 * (a button, menu item, Enter in the inline box or a drop), runs through `useWrite`, and is approved
 * by the user in the host. A test enforces this.
 */
import { makeStyles, tokens } from "@fluentui/react-components";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { AdoApi, TOOL } from "../lib/api";
import { TASK_LEVEL_ID, defaultLevel, loadChildProgress, loadIterations, loadLevelItems, loadLevels, loadSprintItems, loadTypes } from "../lib/boards-data";
import { type Iteration, groupByState, pickDefaultIteration } from "../lib/boards-logic";
import { type NewItemValues, mergeAcceptance, parentTypeFor, toCreateFields } from "../lib/form";
import { REF, effectiveFields } from "../lib/process-fields";
import { type Draft, buildUpdates, extractWorkItemIds, toComments, toDraft, toHistory, toRelations } from "../lib/detail";
import { parseToolResult } from "../lib/result";
import { FIELD, type Card, toCard, toPerson, workItemUrl } from "../lib/work-items";
import { BacklogContent, type PlanningSprint } from "./BacklogContent";
import { BoardContent } from "./BoardContent";
import { CreatedPanel, NewItemForm, type FormType, type ParentOption } from "./NewItemForm";
import { QueryResults } from "./QueryResults";
import { WorkItemDetail } from "./WorkItemDetail";
import { SprintContent, type SprintTab } from "./SprintContent";
import { ErrorBar, Loading, useApi, useWrite } from "./parts";
import { useLoad } from "./hooks";

const useStyles = makeStyles({
  stack: { display: "flex", flexDirection: "column", gap: "4px" },
  err: { padding: "0 12px 8px", backgroundColor: tokens.colorNeutralBackground2 },
});

export interface NewItemPrefill extends Partial<NewItemValues> {
  type?: string;
  parentId?: number;
}

function webUrl(api: AdoApi, path: string): string {
  const { org, project, team } = api.config;
  const base = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`;
  return path.replace("{base}", base).replace("{team}", encodeURIComponent(team));
}

// ---- new work item ------------------------------------------------------------------------------

export function NewItemScreen({ prefill, onClose, onCreated }: { prefill?: NewItemPrefill; onClose?: () => void; onCreated?: () => void }): ReactElement {
  const api = useApi();
  const write = useWrite();
  const s = useStyles();
  const [type, setType] = useState<string | undefined>(prefill?.type);
  const [created, setCreated] = useState<{ id: number; type: string; title: string } | null>(null);
  const [openId, setOpenId] = useState<number | undefined>();
  const [another, setAnother] = useState(false);

  const { state } = useLoad(async () => {
    const levels = await loadLevels(api);
    // A type the model named that no backlog level lists (a Bug) still gets its form.
    const names = [...new Set([...levels.flatMap((l) => l.types), ...(prefill?.type ? [prefill.type] : [])])];
    const maps = await loadTypes(api, names);
    const iterations = await loadIterations(api).catch(() => [] as Iteration[]);
    const me = await api.me();
    return { levels, maps, iterations, me: me?.displayName ? { name: me.displayName } : undefined };
  }, "form");

  const parentType =
    state.status === "ready" && type
      ? parentTypeFor(
          type,
          state.data.levels.map((l) => l.types)
        )
      : undefined;
  const parentsLoad = useLoad(
    async (): Promise<ParentOption[]> => {
      if (!parentType) return [];
      const items = await loadLevelItems(api, { id: "", name: "", types: [parentType], rank: 0 });
      return items.cards.map((c) => ({ id: c.id, title: c.title }));
    },
    `parents:${parentType ?? ""}`
  );

  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBar>{state.error}</ErrorBar>;

  const { levels, maps, iterations } = state.data;
  const typeNames = [...new Set([...levels.flatMap((l) => l.types), ...(prefill?.type ? [prefill.type] : [])])];
  const forms: FormType[] = typeNames.map((n) => ({
    name: n,
    color: maps.colors[n],
    initialState: maps.info[n]?.states[0]?.name,
    // Acceptance criteria exist on story-like types, not on Basic issues or tasks.
    fields: [...effectiveFields(n, maps.info[n]?.fieldRefs)],
  }));
  const chosen = type && typeNames.includes(type) ? type : (defaultLevel(levels).types[0] ?? typeNames[0]);
  // The web form starts at the team's current iteration, and at the project root when none is current.
  const current = iterations.find((i) => i.timeFrame === "current");

  const onSave = (t: string, values: NewItemValues, parentId?: number): void => {
    const typeFields = new Set(forms.find((f) => f.name === t)?.fields ?? []);
    write.run(async () => {
      // One call carries the fields, iteration, area and parent link, so one approval covers it all.
      const item = await api.createWorkItem(t, toCreateFields(values, typeFields), parentId);
      setCreated({ id: item.id, type: t, title: values.title.trim() });
      onCreated?.();
    }, "Could not create the work item");
  };

  // After Create the form gives way to the result; Open shows the new item in the detail view.
  if (openId !== undefined) return <WorkItemScreen id={openId} onBack={() => setOpenId(undefined)} />;
  if (created) {
    return (
      <CreatedPanel
        type={created.type}
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

  return (
    <div className={s.stack}>
      <NewItemForm
        key={chosen}
        me={state.data.me}
        types={forms}
        type={chosen}
        initial={mergeAcceptance(another ? undefined : prefill, (forms.find((f) => f.name === chosen)?.fields ?? []).includes(REF.acceptance))}
        initialParentId={prefill?.parentId}
        iterations={iterations}
        defaultIterationPath={prefill?.iterationPath || current?.path || api.config.project}
        defaultAreaPath={prefill?.areaPath || api.config.project}
        parents={parentsLoad.state.status === "ready" ? parentsLoad.state.data : []}
        busy={write.busy}
        error={write.error}
        onType={setType}
        onSave={onSave}
      />
    </div>
  );
}

// ---- boards and backlog -------------------------------------------------------------------------

export function BoardsScreen({ initialPage = "board" }: { initialPage?: "board" | "backlog" }): ReactElement {
  const api = useApi();
  const write = useWrite();
  const s = useStyles();
  const [page, setPage] = useState<"board" | "backlog" | "new">(initialPage);
  const [levelName, setLevelName] = useState<string | undefined>();
  const [pending, setPending] = useState<ReadonlyMap<number, string>>(new Map());
  const [openId, setOpenId] = useState<number | undefined>();

  const { state, reload, mutate } = useLoad(
    async () => {
      const levels = await loadLevels(api);
      const level = levels.find((l) => l.name === levelName) ?? defaultLevel(levels);
      const taskLevel = levels.find((l) => l.id === TASK_LEVEL_ID);
      const maps = await loadTypes(api, [...level.types, ...(taskLevel?.types ?? [])]);
      const items = await loadLevelItems(api, level);
      const sprints = await planningSprints(api).catch(() => [] as PlanningSprint[]);
      const taskType = taskLevel?.types[0];
      const taskStates = taskType ? (maps.info[taskType]?.states ?? []) : [];
      const doneStates = new Set(taskStates.filter((st) => st.category === "Completed" || st.name === "Done").map((st) => st.name));
      const progress = await loadChildProgress(api, taskLevel?.types ?? [], doneStates).catch(() => new Map<number, { done: number; total: number }>());
      // Parent titles for the filter bar (one batch for the parents the cards point at).
      const parentIds = [...new Set(items.cards.map((c) => c.parent).filter((p): p is number => p !== undefined))];
      const parentTitles = new Map<number, string>();
      if (parentIds.length > 0) for (const p of await api.batch(parentIds).catch(() => [])) parentTitles.set(p.id, toCard(p).title);
      return { levels, level, maps, items, sprints, progress, parentTitles };
    },
    `board:${levelName ?? ""}`
  );

  const canCreate = api.can(TOOL.workItemWrite);
  const canMove = api.can(TOOL.workItemWrite);

  const onMoveCard = (card: Card, to: string): void => {
    if (state.status !== "ready") return;
    const rev = state.data.items.revs.get(card.id);
    setPending((p) => new Map(p).set(card.id, to));
    write.run(async () => {
      try {
        await api.setState(card.id, to, rev);
        // Approved: show the card in its new column now; the reload confirms it.
        mutate((d) => ({ ...d, items: { ...d.items, cards: d.items.cards.map((c) => (c.id === card.id ? { ...c, state: to } : c)) } }));
        reload();
      } finally {
        setPending((p) => {
          const next = new Map(p);
          next.delete(card.id);
          return next;
        });
      }
    }, `Could not move "${card.title}" to ${to}`);
  };

  const onCreateSprint = (name: string, start: string, finish: string): void => {
    write.run(async () => {
      await api.createSprint(name, `${start}T00:00:00Z`, `${finish}T00:00:00Z`);
      reload();
    }, "Could not create the sprint");
  };

  const onCreateInline = (title: string): void => {
    if (state.status !== "ready") return;
    const type = state.data.level.types[0];
    write.run(async () => {
      await api.createWorkItem(type, { [FIELD.title]: title });
      reload();
    }, "Could not create the work item");
  };

  const onOpenCard = (card: Card): void => setOpenId(card.id);

  if (openId !== undefined) {
    return (
      <WorkItemScreen
        id={openId}
        onBack={() => {
          setOpenId(undefined);
          reload();
        }}
      />
    );
  }
  if (page === "new") {
    return (
      <NewItemScreen
        onClose={() => {
          setPage(initialPage);
          reload();
        }}
        onCreated={reload}
      />
    );
  }
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBar>{state.error}</ErrorBar>;

  const { levels, level, maps, items, sprints, progress, parentTitles } = state.data;
  const names = levels.filter((l) => l.id !== TASK_LEVEL_ID).map((l) => l.name);
  // The web board hides the Removed state unless the board settings include it (no tool returns them).
  const stateList = (maps.info[level.types[0]]?.states ?? []).filter((st) => st.name !== "Removed" && st.category !== "Removed");
  const onAnalytics = (): void => api.openLink(webUrl(api, "{base}/_boards/board/t/{team}/" + encodeURIComponent(level.name) + "?view=analytics"));

  return (
    <div>
      {page === "board" ? (
        <BoardContent
          team={api.config.team}
          levelName={level.name}
          levelNames={names}
          pointsLabel={maps.info[level.types[0]]?.fieldRefs.includes(FIELD.storyPoints) ? "Story Points" : "Effort"}
          columns={groupByState(items.cards, stateList.length ? stateList : [{ name: "To Do" }, { name: "Doing", category: "InProgress" }, { name: "Done", category: "Completed" }])}
          typeColors={maps.colors}
          stateColors={maps.stateColors}
          progress={progress}
          parentTitles={parentTitles}
          pendingMoves={pending}
          canCreate={canCreate}
          canMove={canMove}
          onLevel={setLevelName}
          onViewBacklog={() => setPage("backlog")}
          onAnalytics={onAnalytics}
          onCreateInline={onCreateInline}
          onMoveCard={onMoveCard}
          onOpenCard={onOpenCard}
        />
      ) : (
        <BacklogContent
          team={api.config.team}
          levelName={level.name}
          levelNames={names}
          pointsLabel={maps.info[level.types[0]]?.fieldRefs.includes(FIELD.storyPoints) ? "Story Points" : "Effort"}
          cards={items.cards}
          typeColors={maps.colors}
          stateColors={maps.stateColors}
          sprints={sprints}
          canCreate={canCreate}
          onLevel={setLevelName}
          onViewBoard={() => setPage("board")}
          onAnalytics={onAnalytics}
          onNewWorkItem={() => setPage("new")}
          onOpenCard={onOpenCard}
          onOpenSprint={() => api.openLink(webUrl(api, "{base}/_sprints/backlog/{team}"))}
          onCreateSprint={api.can(TOOL.iterationWrite) ? onCreateSprint : undefined}
          busy={write.busy}
        />
      )}
      {write.error && (
        <div className={s.err}>
          <ErrorBar>{write.error}</ErrorBar>
        </div>
      )}
    </div>
  );
}

/** The sprints the Planning pane lists: the current one first, then the next ones, with their planned effort and item counts by type. */
async function planningSprints(api: AdoApi): Promise<PlanningSprint[]> {
  const all = await loadIterations(api);
  const first = pickDefaultIteration(all);
  const picked = [...(first ? [first] : []), ...all.filter((i) => i.id !== first?.id)].slice(0, 3);
  return Promise.all(
    picked.map(async (it): Promise<PlanningSprint> => {
      const ids = await api.iterationItemIds(it.id).catch(() => [] as number[]);
      const cards = ids.length > 0 ? (await api.batch(ids).catch(() => [])).map(toCard) : [];
      const byType = new Map<string, number>();
      for (const c of cards) byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
      return { name: it.name, count: ids.length, effort: cards.reduce((sum, c) => sum + (c.effort ?? 0), 0), byType: [...byType].map(([type, count]) => ({ type, count })) };
    })
  );
}

// ---- sprints ------------------------------------------------------------------------------------

/** `initialIteration` is a sprint name the model asked for; without it the view opens on the current sprint. */
export function SprintScreen({ initialIteration }: { initialIteration?: string }): ReactElement {
  const api = useApi();
  const write = useWrite();
  const [iterationId, setIterationId] = useState<string | undefined>();
  const [tab, setTab] = useState<SprintTab>("taskboard");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | undefined>();

  const meta = useLoad(async () => {
    const levels = await loadLevels(api);
    const requirement = defaultLevel(levels);
    const taskLevel = levels.find((l) => l.id === TASK_LEVEL_ID);
    const taskType = taskLevel?.types[0] ?? "Task";
    const maps = await loadTypes(api, [...requirement.types, taskType]);
    const iterations = await loadIterations(api);
    return { requirement, taskType, maps, iterations };
  }, "sprint-meta");

  const selected = useMemo(() => {
    if (meta.state.status !== "ready") return undefined;
    const list = meta.state.data.iterations;
    return list.find((i) => i.id === iterationId) ?? list.find((i) => initialIteration && i.name.toLowerCase() === initialIteration.toLowerCase()) ?? pickDefaultIteration(list);
  }, [meta.state, iterationId, initialIteration]);

  const itemsLoad = useLoad(async () => (selected ? loadSprintItems(api, selected.id) : []), `sprint:${selected?.id ?? ""}`);

  if (openId !== undefined) {
    return (
      <WorkItemScreen
        id={openId}
        onBack={() => {
          setOpenId(undefined);
          itemsLoad.reload();
        }}
      />
    );
  }
  if (creating)
    return (
      <NewItemScreen
        onClose={() => {
          setCreating(false);
          itemsLoad.reload();
        }}
        onCreated={itemsLoad.reload}
      />
    );
  if (meta.state.status === "loading") return <Loading />;
  if (meta.state.status === "error") return <ErrorBar>{meta.state.error}</ErrorBar>;
  const { requirement, taskType, maps, iterations } = meta.state.data;
  if (itemsLoad.state.status === "loading") return <Loading />;
  if (itemsLoad.state.status === "error") return <ErrorBar>{itemsLoad.state.error}</ErrorBar>;

  const onSetDates = (iterationPath: string, start: string, finish: string): void => {
    write.run(async () => {
      await api.setIterationDates(iterationPath, `${start}T00:00:00Z`, `${finish}T00:00:00Z`);
      meta.reload();
    }, "Could not set the sprint dates");
  };

  const onOpenWeb = (what: "capacity" | "analytics" | "dates" | "schedule"): void => {
    const path = {
      capacity: "{base}/_sprints/capacity/{team}",
      analytics: "{base}/_sprints/analytics/{team}",
      dates: "{base}/_settings/work-team?type=Iterations",
      schedule: "{base}/_backlogs/backlog/{team}",
    }[what];
    api.openLink(webUrl(api, path));
  };

  return (
    <SprintContent
      team={api.config.team}
      iterations={iterations}
      iteration={selected}
      items={itemsLoad.state.data}
      tab={tab}
      typeColors={maps.colors}
      stateColors={maps.stateColors}
      taskType={taskType}
      taskStates={maps.info[taskType]?.states ?? [{ name: "To Do" }, { name: "Doing" }, { name: "Done", category: "Completed" }]}
      parentTypes={new Set(requirement.types)}
      canCreate={api.can(TOOL.workItemWrite)}
      onIteration={setIterationId}
      onTab={setTab}
      onNewWorkItem={() => setCreating(true)}
      onOpenCard={(c) => setOpenId(c.id)}
      onOpenWeb={onOpenWeb}
      onSetDates={api.can(TOOL.iterationWrite) ? onSetDates : undefined}
      busy={write.busy}
      error={write.error}
    />
  );
}

// ---- work item detail ---------------------------------------------------------------------------

export function WorkItemScreen({ id, onBack, tab }: { id: number; onBack?: () => void; tab?: "details" | "history" | "links" | "attachments" }): ReactElement {
  const api = useApi();
  const write = useWrite();
  const [saved, setSaved] = useState<string | null>(null);

  const { state, reload } = useLoad(async () => {
    const item = await api.getWorkItem(id);
    const type = String(item.fields?.[FIELD.type] ?? "");
    const relations = toRelations(item.relations);
    const linkedIds = relations.map((r) => r.workItemId).filter((n): n is number => n !== undefined);
    const [comments, revisions, iterations, maps, linkedItems, me] = await Promise.all([
      api.comments(id).catch(() => ({})),
      api.revisions(id).catch(() => []),
      loadIterations(api).catch(() => [] as Iteration[]),
      loadTypes(api, [type, ...["Epic", "Issue", "Task"]]),
      linkedIds.length > 0 ? api.batch(linkedIds).catch(() => []) : Promise.resolve([]),
      api.me(),
    ]);
    const linked = Object.fromEntries(linkedItems.map((w) => [w.id, toCard(w)]));
    return {
      item,
      type,
      relations,
      comments: toComments(comments),
      history: toHistory(revisions),
      iterations,
      maps,
      linked,
      me: me?.displayName ? { name: me.displayName, email: me.uniqueName } : undefined,
    };
  }, `item:${id}`);

  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBar>{state.error}</ErrorBar>;
  const { item, type, relations, comments, history, iterations, maps, linked, me } = state.data;
  const fields = item.fields ?? {};
  const original = toDraft(fields);

  const onSave = (draft: Draft): void => {
    const updates = buildUpdates(original, draft, item.rev);
    if (updates.length === 0) return;
    write.run(async () => {
      await api.updateWorkItem(id, updates);
      setSaved("Saved.");
      reload();
    }, "Could not save the work item");
  };
  const onAddComment = (text: string): void => {
    write.run(async () => {
      await api.addComment(id, text);
      setSaved("Comment added.");
      reload();
    }, "Could not add the comment");
  };

  return (
    <WorkItemDetail
      key={`${id}-${item.rev}`}
      id={id}
      rev={item.rev}
      type={type}
      typeColor={maps.colors[type]}
      states={maps.info[type]?.states ?? []}
      stateColors={maps.stateColors}
      original={original}
      areaPath={typeof fields[FIELD.areaPath] === "string" ? (fields[FIELD.areaPath] as string) : undefined}
      reason={typeof fields[FIELD.reason] === "string" ? (fields[FIELD.reason] as string) : undefined}
      changedBy={toPerson(fields["System.ChangedBy"])}
      changed={typeof fields[FIELD.changedDate] === "string" ? (fields[FIELD.changedDate] as string) : undefined}
      onRefresh={reload}
      iterations={iterations}
      hasAcceptance={fields[FIELD.acceptance] !== undefined}
      fieldRefs={maps.info[type]?.fieldRefs}
      me={me}
      comments={comments}
      history={history}
      relations={relations}
      linked={linked}
      typeColors={maps.colors}
      tab={tab}
      canEdit={api.can(TOOL.workItemWrite)}
      busy={write.busy}
      error={write.error}
      saved={saved}
      onSave={onSave}
      onAddComment={api.can(TOOL.commentWrite) ? onAddComment : undefined}
      onBack={onBack}
      onOpenRelated={(rid) => api.openLink(workItemUrl(api.config.org, api.config.project, rid))}
      onOpenWeb={(page) =>
        api.openLink(
          page === "releases"
            ? webUrl(api, "{base}/_release")
            : page === "learn"
              ? "https://learn.microsoft.com/azure/devops/boards/queries/deployment-status"
              : page === "repos"
                ? webUrl(api, "{base}/_git")
                : workItemUrl(api.config.org, api.config.project, id)
        )
      }
      onLink={(url) => api.openLink(url)}
    />
  );
}

// ---- lists (query results, my work items, batches) -----------------------------------------------

/** What opened a list: the tool result (ids are read from it) or, for "my work items", a fresh read. */
export function ListScreen({ heading, result, loadMine }: { heading: string; result?: unknown; loadMine?: boolean }): ReactElement {
  const api = useApi();
  const [openId, setOpenId] = useState<number | undefined>();

  const { state } = useLoad(
    async () => {
      const source = loadMine ? await api.myWorkItems() : result;
      const ids = extractWorkItemIds(source);
      const items = ids.length > 0 ? await api.batch(ids) : [];
      const cards = items.map(toCard);
      const order = new Map(ids.map((n, i) => [n, i]));
      cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      const maps = await loadTypes(api, [...new Set(cards.map((c) => c.type))]);
      return { cards, maps, truncated: ids.length >= 200 };
    },
    `list:${loadMine ? "mine" : JSON.stringify(extractWorkItemIds(result)).slice(0, 200)}`
  );

  if (openId !== undefined) return <WorkItemScreen id={openId} onBack={() => setOpenId(undefined)} />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBar>{state.error}</ErrorBar>;
  return (
    <QueryResults
      heading={heading}
      cards={state.data.cards}
      typeColors={state.data.maps.colors}
      stateColors={state.data.maps.stateColors}
      truncated={state.data.truncated}
      onOpen={(c) => setOpenId(c.id)}
    />
  );
}

/** Routes the `wit_work_item` tool to a detail or a list from the action the model used. */
export function WorkItemEntry({ args, result }: { args: Record<string, unknown>; result?: unknown }): ReactElement {
  const action = typeof args.action === "string" ? args.action : "";
  const id = Number(args.id ?? args.workItemId);
  const tab = action === "list_revisions" ? "history" : undefined;
  if (["get", "list_comments", "list_revisions"].includes(action) && Number.isFinite(id)) return <WorkItemScreen id={id} tab={tab} />;
  if (action === "my") return <ListScreen heading="My work items" loadMine />;
  return <ListScreen heading="Work items" result={parseToolResult(result as never).data} />;
}
