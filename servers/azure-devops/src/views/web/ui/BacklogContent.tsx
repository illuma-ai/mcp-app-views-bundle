/** The Boards > Backlogs screen: hierarchy list with expand/collapse and the Planning pane. */
import { Button, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Tab, TabList, makeStyles, tokens } from "@fluentui/react-components";
import {
  AddRegular,
  ArrowCircleRightRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DismissRegular,
  FilterRegular,
  FullScreenMaximizeRegular,
  MoreHorizontalRegular,
  SettingsRegular,
  WrenchRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useState } from "react";
import { buildTree, flattenTree } from "../lib/boards-logic";
import type { Card } from "../lib/work-items";
import { PageTitle } from "./PageTitle";
import { LinkButton, StateDot, TagChips, TypeIcon } from "./parts";
import { S } from "./strings";

const useStyles = makeStyles({
  page: { backgroundColor: tokens.colorNeutralBackground2, padding: "8px 12px 12px" },
  bar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" },
  tools: { display: "flex", alignItems: "center", gap: "4px" },
  body: { "display": "flex", "gap": "12px", "marginTop": "8px", "alignItems": "flex-start", "@media (max-width: 480px)": { flexDirection: "column", alignItems: "stretch" } },
  list: {
    flex: 1,
    minWidth: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    minHeight: "220px",
  },
  head: {
    "display": "grid",
    "gridTemplateColumns": "44px 110px minmax(0,1fr) 84px 96px",
    "@media (max-width: 480px)": { gridTemplateColumns: "minmax(0,1fr) 72px" },
    "gap": "8px",
    "padding": "6px 8px",
    "fontSize": tokens.fontSizeBase200,
    "color": tokens.colorNeutralForeground3,
    "borderBottom": `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: {
    "display": "grid",
    "gridTemplateColumns": "44px 110px minmax(0,1fr) 84px 96px",
    "@media (max-width: 480px)": { gridTemplateColumns: "minmax(0,1fr) 72px" },
    "gap": "8px",
    "alignItems": "center",
    "padding": "4px 8px",
    "borderBottom": `1px solid ${tokens.colorNeutralStroke3}`,
    "fontSize": tokens.fontSizeBase300,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  titleCell: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
  titleText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "40px 16px", gap: "8px" },
  emptyTitle: { fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold, margin: 0 },
  pane: {
    "width": "170px",
    "flexShrink": 0,
    "borderLeft": `1px solid ${tokens.colorNeutralStroke2}`,
    "paddingLeft": "12px",
    "@media (max-width: 480px)": { width: "auto", borderLeft: "none", paddingLeft: 0, borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: "8px" },
  },
  hideNarrow: { "@media (max-width: 480px)": { display: "none" } },
  paneHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  paneCard: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow2, padding: "10px 12px", margin: "8px 0", fontSize: tokens.fontSizeBase300 },
  sprintForm: { display: "flex", flexDirection: "column", gap: "4px" },
  paneHelp: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300 },
});

export interface PlanningSprint {
  name: string;
  count: number;
  effort: number;
  byType: { type: string; count: number }[];
}

export interface BacklogContentProps {
  team: string;
  levelName: string;
  levelNames: string[];
  /** Header of the points column: "Story Points" for Agile stories, "Effort" otherwise. */
  pointsLabel?: string;
  cards: Card[];
  typeColors?: Record<string, string>;
  stateColors?: Record<string, string>;
  /** The sprints the Planning pane lists, with planned effort and the item counts by type. */
  sprints?: PlanningSprint[];
  canCreate: boolean;
  onLevel?: (name: string) => void;
  onViewBoard?: () => void;
  onAnalytics?: () => void;
  onNewWorkItem?: () => void;
  onOpenCard?: (card: Card) => void;
  onOpenSprint?: () => void;
  /** Starts creating a sprint (New Sprint form, Create button); the host asks the user to approve each call. */
  onCreateSprint?: (name: string, start: string, finish: string) => void;
  busy?: boolean;
}

export function BacklogContent(props: BacklogContentProps): ReactElement {
  const s = useStyles();
  const tree = buildTree(props.cards);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set(tree.filter((n) => n.children.length > 0).map((n) => n.card.id)));
  const [pane, setPane] = useState(true);
  const [addingSprint, setAddingSprint] = useState(false);
  const [sprintName, setSprintName] = useState("");
  const [sprintStart, setSprintStart] = useState("");
  const [sprintFinish, setSprintFinish] = useState("");
  const rows = flattenTree(tree, expanded);
  const toggle = (id: number): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={s.page}>
      <div className={s.bar}>
        <PageTitle name={props.team} kind="backlog" />
        <div className={s.tools}>
          {props.canCreate && (
            <Button appearance="primary" icon={<AddRegular />} onClick={props.onNewWorkItem}>
              {S.backlog.newWorkItem}
            </Button>
          )}
          <Button appearance="secondary" icon={<ArrowCircleRightRegular />} onClick={props.onViewBoard}>
            {S.backlog.viewAsBoard}
          </Button>
          <Button appearance="secondary" icon={<WrenchRegular />}>
            {S.backlog.columnOptions}
          </Button>
          <Button appearance="subtle" icon={<MoreHorizontalRegular />} aria-label="More actions" />
        </div>
      </div>
      <div className={s.bar}>
        <TabList selectedValue="backlog" size="small">
          <Tab value="backlog">{S.backlog.tabBacklog}</Tab>
          <Tab value="analytics" onClick={props.onAnalytics}>
            {S.board.tabAnalytics}
          </Tab>
        </TabList>
        <div className={s.tools}>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="transparent" iconPosition="after" icon={<ChevronDownRegular />} style={{ fontWeight: 600 }}>
                {props.levelName}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {props.levelNames.map((n) => (
                  <MenuItem key={n} onClick={() => props.onLevel?.(n)}>
                    {n}
                  </MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Button appearance="subtle" icon={<FilterRegular />} aria-label="Filter" />
          <Button appearance="subtle" icon={<SettingsRegular />} aria-label="Settings" />
          <Button appearance="subtle" icon={<FullScreenMaximizeRegular />} aria-label="Full screen" />
        </div>
      </div>

      <div className={s.body}>
        <div className={s.list}>
          {props.cards.length === 0 ? (
            <div className={s.empty}>
              <h2 className={s.emptyTitle}>{S.backlog.emptyTitle}</h2>
              <div>{S.backlog.emptyText}</div>
              {props.canCreate && (
                <Button appearance="primary" onClick={props.onNewWorkItem}>
                  {S.backlog.newWorkItem}
                </Button>
              )}
              <LinkButton>{S.backlog.learnMore}</LinkButton>
            </div>
          ) : (
            <div role="treegrid" aria-label={props.levelName}>
              <div className={s.head}>
                <span className={s.hideNarrow}>Order</span>
                <span className={s.hideNarrow}>Work Item Type</span>
                <span>Title</span>
                <span>State</span>
                <span className={s.hideNarrow}>{props.pointsLabel ?? "Effort"}</span>
              </div>
              {rows.map(({ node, depth }, rowIndex) => {
                const c = node.card;
                const open = expanded.has(c.id);
                return (
                  <div key={c.id} role="row" className={s.row} data-testid={`row-${c.id}`}>
                    <span className={s.hideNarrow}>{rowIndex + 1}</span>
                    <span className={s.hideNarrow}>{c.type}</span>
                    <div className={s.titleCell} style={{ paddingLeft: depth * 18 }}>
                      {node.children.length > 0 ? (
                        <Button
                          appearance="transparent"
                          size="small"
                          icon={open ? <ChevronDownRegular /> : <ChevronRightRegular />}
                          aria-label={`${open ? "Collapse" : "Expand"} ${c.title}`}
                          aria-expanded={open}
                          onClick={() => toggle(c.id)}
                        />
                      ) : (
                        <span style={{ width: 24, flexShrink: 0 }} />
                      )}
                      <TypeIcon type={c.type} color={props.typeColors?.[c.type]} />
                      <Button
                        appearance="transparent"
                        size="small"
                        className={s.titleText}
                        style={{ padding: 0, minWidth: 0, height: "auto", fontWeight: 400, justifyContent: "flex-start" }}
                        onClick={() => props.onOpenCard?.(c)}>
                        {c.title}
                      </Button>
                      <TagChips tags={c.tags} />
                    </div>
                    <StateDot state={c.state} colors={props.stateColors} />
                    <span className={s.hideNarrow}>{c.effort ?? ""}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {pane && (
          <aside className={s.pane} aria-label={S.backlog.planning}>
            <div className={s.paneHead}>
              <strong style={{ fontSize: tokens.fontSizeBase400 }}>{S.backlog.planning}</strong>
              <Button appearance="transparent" size="small" icon={<DismissRegular />} aria-label="Close planning" onClick={() => setPane(false)} />
            </div>
            <div className={s.paneHelp}>{S.backlog.planningHelp}</div>
            <div className={s.paneCard}>{`${props.team} backlog`}</div>
            {(props.sprints && props.sprints.length > 0 ? props.sprints : [{ name: "Sprint 1", count: 0, effort: 0, byType: [] }]).map((sp) => (
              <div key={sp.name} className={s.paneCard}>
                <LinkButton onClick={props.onOpenSprint}>{sp.name}</LinkButton>
                {sp.count > 0 ? (
                  <>
                    <div className={s.paneHelp}>{`Planned Effort: ${sp.effort}`}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {sp.byType.map((t) => (
                        <span key={t.type} style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title={`${t.count} ${t.type}`}>
                          <TypeIcon type={t.type} color={props.typeColors?.[t.type]} />
                          {t.count}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={s.paneHelp}>{S.backlog.noWork}</div>
                )}
              </div>
            ))}
            {addingSprint && props.onCreateSprint ? (
              <div className={s.sprintForm}>
                <Input size="small" aria-label="Sprint name" placeholder="Sprint name" value={sprintName} onChange={(_, d) => setSprintName(d.value)} />
                <Input size="small" type="date" aria-label="Start date" value={sprintStart} onChange={(_, d) => setSprintStart(d.value)} />
                <Input size="small" type="date" aria-label="Finish date" value={sprintFinish} onChange={(_, d) => setSprintFinish(d.value)} />
                <Button
                  appearance="primary"
                  size="small"
                  disabled={props.busy || !sprintName.trim() || !sprintStart || !sprintFinish || sprintFinish < sprintStart}
                  onClick={() => props.onCreateSprint?.(sprintName.trim(), sprintStart, sprintFinish)}>
                  Create
                </Button>
              </div>
            ) : (
              <Button appearance="secondary" icon={<AddRegular />} onClick={() => setAddingSprint(true)}>
                {S.backlog.newSprint}
              </Button>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
