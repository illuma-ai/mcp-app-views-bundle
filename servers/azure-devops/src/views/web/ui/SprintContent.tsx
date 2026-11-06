/** The Boards > Sprints screen: sprint picker, taskboard, sprint backlog and the totals strip. */
import { SURFACE } from "../lib/host-theme";
import { Badge, Button, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Tab, TabList, makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular, ChevronDownRegular, FilterRegular, InfoRegular, MoreHorizontalRegular, SettingsRegular, WrenchRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useState } from "react";
import { buildTaskboard, daysRemaining, groupByState, sprintTotals, type Iteration } from "../lib/boards-logic";
import type { Card } from "../lib/work-items";
import { PageTitle } from "./PageTitle";
import { LinkButton, PersonChip, StateDot, TypeIcon } from "./parts";
import { S } from "./strings";

const useStyles = makeStyles({
  page: { backgroundColor: tokens.colorNeutralBackground2, padding: "8px 12px 12px" },
  bar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" },
  tools: { display: "flex", alignItems: "center", gap: "4px" },
  filters: { display: "flex", gap: "8px", margin: "8px 0" },
  dates: { "textAlign": "right", "fontSize": tokens.fontSizeBase300, "@media (max-width: 480px)": { textAlign: "left" } },
  today: { fontWeight: tokens.fontWeightSemibold },
  totals: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
    padding: "6px 8px",
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, margin: "4px 0 8px" },
  grid: {
    "display": "grid",
    "gridTemplateColumns": "170px repeat(3, minmax(0, 1fr))",
    "gap": "4px 6px",
    "marginTop": "8px",
    "@media (max-width: 480px)": { gridTemplateColumns: "130px repeat(3, 150px)", width: "max-content" },
  },
  scroll: { overflowX: "auto", maxWidth: "100%" },
  hideNarrow: { "@media (max-width: 480px)": { display: "none" } },
  colHead: { padding: "4px 6px", fontWeight: tokens.fontWeightSemibold, borderBottom: `2px solid ${tokens.colorNeutralStroke1}` },
  issueCell: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow2, padding: "6px 8px", display: "flex", flexDirection: "column", gap: "4px", fontSize: tokens.fontSizeBase200 },
  lane: { backgroundColor: SURFACE.inset, padding: "4px", minHeight: "48px", display: "flex", flexDirection: "column", gap: "4px" },
  task: {
    "backgroundColor": tokens.colorNeutralBackground1,
    "boxShadow": tokens.shadow2,
    "borderLeft": "4px solid",
    "padding": "4px 6px",
    "display": "flex",
    "flexDirection": "column",
    "gap": "2px",
    "fontSize": tokens.fontSizeBase200,
    ":hover": { boxShadow: tokens.shadow8 },
  },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "40px 16px", gap: "10px" },
  emptyTitle: { fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold, margin: 0 },
  list: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4, marginTop: "8px" },
  row: {
    "display": "grid",
    "gridTemplateColumns": "minmax(0,1fr) 96px 80px 52px",
    "@media (max-width: 480px)": { gridTemplateColumns: "minmax(0,1fr) 72px 40px" },
    "gap": "8px",
    "alignItems": "center",
    "padding": "4px 8px",
    "borderBottom": `1px solid ${tokens.colorNeutralStroke3}`,
    "fontSize": tokens.fontSizeBase300,
  },
});

export type SprintTab = "taskboard" | "backlog";

export interface SprintContentProps {
  team: string;
  iterations: Iteration[];
  iteration?: Iteration;
  items: Card[];
  tab: SprintTab;
  typeColors?: Record<string, string>;
  stateColors?: Record<string, string>;
  taskType: string;
  taskStates: { name: string; category?: string }[];
  /** Types shown as rows of the taskboard (the requirement level, e.g. Issue). */
  parentTypes: ReadonlySet<string>;
  now?: Date;
  canCreate: boolean;
  onIteration?: (id: string) => void;
  onTab?: (tab: SprintTab) => void;
  onNewWorkItem?: () => void;
  onOpenCard?: (card: Card) => void;
  /** Tabs and links that exist only in the web UI open it through the host. */
  onOpenWeb?: (what: "capacity" | "analytics" | "dates" | "schedule") => void;
  /** Starts the update of the sprint dates (path, start, finish as YYYY-MM-DD); present when the server allows it. */
  onSetDates?: (iterationPath: string, start: string, finish: string) => void;
  busy?: boolean;
  error?: string | null;
}

function dateRange(it: Iteration | undefined): string {
  if (!it?.start || !it.finish) return "";
  const fmt = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(it.start)} - ${fmt(it.finish)}`;
}

export function SprintContent(props: SprintContentProps): ReactElement {
  const s = useStyles();
  const [person, setPerson] = useState<string | null>(null);
  const [editingDates, setEditingDates] = useState(false);
  const [start, setStart] = useState("");
  const [finish, setFinish] = useState("");
  const now = props.now ?? new Date();
  const items = person ? props.items.filter((c) => c.assignee?.name === person) : props.items;
  const people = [...new Set(props.items.map((c) => c.assignee?.name).filter((n): n is string => Boolean(n)))];
  const doneStates = new Set(props.taskStates.filter((st) => st.category === "Completed" || st.name === S.board.done).map((st) => st.name));
  const totals = sprintTotals(props.items, props.taskType, doneStates);
  const left = daysRemaining(props.iteration?.finish, now);
  const rows = buildTaskboard(items, props.taskStates, props.parentTypes, props.taskType);
  const laneNames = props.taskStates.length ? props.taskStates.map((st) => st.name) : [S.board.toDo, S.board.doing, S.board.done];

  return (
    <div className={s.page}>
      <div className={s.bar}>
        <PageTitle name={props.team} kind="sprint" />
        <div className={s.tools}>
          {props.canCreate && (
            <Button appearance="primary" icon={<AddRegular />} onClick={props.onNewWorkItem}>
              {S.sprint.newWorkItem}
            </Button>
          )}
          <Button appearance="secondary" icon={<WrenchRegular />}>
            {S.sprint.columnOptions}
          </Button>
        </div>
      </div>
      <div className={s.bar}>
        <TabList selectedValue={props.tab} size="small" onTabSelect={(_, d) => d.value !== "capacity" && d.value !== "analytics" && props.onTab?.(d.value as SprintTab)}>
          <Tab value="taskboard">{S.sprint.taskboard}</Tab>
          <Tab value="backlog">{S.sprint.backlog}</Tab>
          <Tab value="capacity" onClick={() => props.onOpenWeb?.("capacity")}>
            {S.sprint.capacity}
          </Tab>
          <Tab value="analytics" onClick={() => props.onOpenWeb?.("analytics")}>
            {S.sprint.analytics}
          </Tab>
        </TabList>
        <div className={s.tools}>
          <Button appearance="subtle" icon={<FilterRegular />} aria-label="Filter" />
          <Button appearance="subtle" icon={<SettingsRegular />} aria-label="Settings" />
          <Button appearance="subtle" icon={<MoreHorizontalRegular />} aria-label="More actions" />
        </div>
      </div>

      <div className={s.bar}>
        <div className={s.filters}>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="secondary" iconPosition="after" icon={<ChevronDownRegular />} style={{ fontWeight: 600 }}>
                {props.iteration?.name ?? ""}
                {props.iteration?.timeFrame === "current" && (
                  <Badge appearance="tint" color="brand" size="small" style={{ marginLeft: 6 }}>
                    Current
                  </Badge>
                )}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {props.iterations.map((it) => (
                  <MenuItem key={it.id} onClick={() => props.onIteration?.(it.id)}>
                    {it.timeFrame === "current" ? `${it.name} (current)` : it.name}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="secondary" iconPosition="after" icon={<ChevronDownRegular />} style={{ fontWeight: 600 }}>
                {person ? `Person: ${person}` : S.sprint.person}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem onClick={() => setPerson(null)}>All</MenuItem>
                {people.map((n) => (
                  <MenuItem key={n} onClick={() => setPerson(n)}>
                    {n}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
        <div className={s.dates}>
          {props.iteration?.start && props.iteration.finish ? (
            <>
              <div className={s.today}>{dateRange(props.iteration)}</div>
              <div>{left === undefined ? "" : `${left} ${left === 1 ? "day" : "days"} remaining`}</div>
            </>
          ) : (
            <>
              <div>
                {S.sprint.noDates} <InfoRegular style={{ verticalAlign: "middle" }} />
              </div>
              {editingDates && props.onSetDates && props.iteration ? (
                <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <Input type="date" size="small" aria-label="Start date" value={start} onChange={(_, d) => setStart(d.value)} />
                  <Input type="date" size="small" aria-label="Finish date" value={finish} onChange={(_, d) => setFinish(d.value)} />
                  <Button appearance="primary" size="small" disabled={props.busy || !start || !finish || finish < start} onClick={() => props.onSetDates?.(props.iteration?.path ?? "", start, finish)}>
                    {S.form.save}
                  </Button>
                </span>
              ) : (
                <LinkButton onClick={() => (props.onSetDates ? setEditingDates(true) : props.onOpenWeb?.("dates"))}>{S.sprint.setDates}</LinkButton>
              )}
              {props.error && <div style={{ color: tokens.colorPaletteRedForeground1 }}>{props.error}</div>}
            </>
          )}
        </div>
      </div>

      {props.items.length === 0 ? (
        <div className={s.empty}>
          <h2 className={s.emptyTitle}>{S.sprint.emptyTitle}</h2>
          <div>
            <LinkButton onClick={() => props.onOpenWeb?.("schedule")}>{S.sprint.scheduleWork}</LinkButton>
            {S.sprint.emptyAfterLink}
          </div>
          {props.canCreate && (
            <Button appearance="primary" icon={<AddRegular />} onClick={props.onNewWorkItem}>
              {S.sprint.newWorkItem}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className={s.totals} aria-label="Sprint totals">
            <span>{`Tasks done: ${totals.done}/${totals.tasks}`}</span>
            <span>{`Work remaining: ${totals.remainingWork} h`}</span>
            <span>{`Effort: ${totals.effort}`}</span>
          </div>
          <div className={s.note}>Burndown by day needs work item history, so the sprint shows totals.</div>
          {props.tab === "taskboard" ? (
            <div className={s.scroll} data-intended-scroll="true">
              <div className={s.grid} role="grid" aria-label="Taskboard">
                <div />
                {laneNames.map((n) => (
                  <div key={n} className={s.colHead}>
                    {n}
                  </div>
                ))}
                {rows.map((row, i) => (
                  <TaskRow key={row.issue?.id ?? `none-${i}`} row={row} props={props} />
                ))}
              </div>
            </div>
          ) : (
            <div className={s.list} role="list">
              {items
                .slice()
                .sort((a, b) => a.rank - b.rank)
                .map((c) => (
                  <div key={c.id} className={s.row} role="listitem">
                    <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                      <TypeIcon type={c.type} color={props.typeColors?.[c.type]} />
                      <Button
                        appearance="transparent"
                        size="small"
                        style={{ padding: 0, minWidth: 0, height: "auto", fontWeight: 400, justifyContent: "flex-start" }}
                        onClick={() => props.onOpenCard?.(c)}>
                        {c.title}
                      </Button>
                    </span>
                    <span className={s.hideNarrow}>
                      <PersonChip person={c.assignee} size={16} />
                    </span>
                    <StateDot state={c.state} colors={props.stateColors} />
                    <span>{c.type === props.taskType ? (c.remaining ?? "") : (c.effort ?? "")}</span>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TaskRow({ row, props }: { row: ReturnType<typeof buildTaskboard>[number]; props: SprintContentProps }): ReactElement {
  const s = useStyles();
  const cols = row.columns.length ? row.columns : groupByState([], props.taskStates);
  return (
    <>
      <div className={s.issueCell}>
        {row.issue ? (
          <>
            <span style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <TypeIcon type={row.issue.type} color={props.typeColors?.[row.issue.type]} />
              <Button
                appearance="transparent"
                size="small"
                style={{ padding: 0, minWidth: 0, height: "auto", fontWeight: 400, justifyContent: "flex-start", textAlign: "left" }}
                onClick={() => props.onOpenCard?.(row.issue as Card)}>
                {row.issue.title}
              </Button>
            </span>
            <StateDot state={row.issue.state} colors={props.stateColors} />
            {row.issue.effort !== undefined && <span>{`Effort ${row.issue.effort}`}</span>}
          </>
        ) : (
          <span>Unparented</span>
        )}
      </div>
      {cols.map((col) => (
        <div key={col.name} className={s.lane}>
          {col.cards.map((t) => (
            <div key={t.id} className={s.task} style={{ borderLeftColor: props.typeColors?.[t.type] ?? "#F2CB1D" }}>
              <Button
                appearance="transparent"
                size="small"
                style={{ padding: 0, minWidth: 0, height: "auto", fontWeight: 400, justifyContent: "flex-start", textAlign: "left" }}
                onClick={() => props.onOpenCard?.(t)}>
                {t.title}
              </Button>
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <PersonChip person={t.assignee} size={16} />
                {t.remaining !== undefined && <span>{`${t.remaining} h`}</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
