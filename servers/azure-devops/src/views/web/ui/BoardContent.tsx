/** The Boards > Boards screen: columns per state, cards, filter bar, inline "New item", level picker, drag to move. */
import { Button, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Select, Tab, TabList, makeStyles, tokens } from "@fluentui/react-components";
import {
  AddRegular,
  ArrowCircleRightRegular,
  CheckboxCheckedFilled,
  ChevronDownRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  DismissRegular,
  FilterRegular,
  FullScreenMaximizeRegular,
  MoreHorizontalRegular,
  SearchRegular,
  SettingsRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { DEFAULT_WIP_LIMIT, type Column } from "../lib/boards-logic";
import { NO_FILTER, filterOptions, isFiltering, matchesFilters, type FilterState } from "../lib/filters";
import { FALLBACK_TYPE_COLORS, type Card } from "../lib/work-items";
import { type LaneRect, useCardDrag } from "./drag";
import { SURFACE } from "../lib/host-theme";
import { PageTitle } from "./PageTitle";
import { PersonChip, StateDot, TagChips, TypeIcon } from "./parts";
import { S } from "./strings";

const useStyles = makeStyles({
  page: { backgroundColor: SURFACE.board, padding: "8px 12px 12px" },
  bar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" },
  tools: { display: "flex", alignItems: "center", gap: "2px" },
  levelButton: { fontWeight: tokens.fontWeightSemibold },
  filterBar: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", padding: "6px 0" },
  lanes: { "display": "flex", "gap": "8px", "marginTop": "8px", "alignItems": "stretch", "@media (max-width: 480px)": { overflowX: "auto", paddingBottom: "6px" } },
  lane: { "flex": "1 1 0", "minWidth": 0, "display": "flex", "flexDirection": "column", "@media (max-width: 480px)": { flex: "0 0 240px" } },
  collapsed: { flex: "0 0 36px", minWidth: "36px" },
  laneHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 8px 4px",
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightRegular,
    color: tokens.colorNeutralForeground1,
    position: "sticky",
    top: 0,
    zIndex: 1,
    backgroundColor: SURFACE.board,
  },
  wipOk: { color: tokens.colorStatusSuccessForeground1, fontSize: tokens.fontSizeBase400 },
  wipOver: { color: tokens.colorStatusDangerForeground1, fontSize: tokens.fontSizeBase400 },
  laneBody: {
    flex: 1,
    minHeight: "160px",
    backgroundColor: SURFACE.inset,
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  collapsedBody: { flex: 1, minHeight: "160px", backgroundColor: SURFACE.inset, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "10px", gap: "6px" },
  vertical: { writingMode: "vertical-rl", fontSize: tokens.fontSizeBase300, whiteSpace: "nowrap" },
  dropOver: { outline: `2px dashed ${tokens.colorBrandStroke1}`, outlineOffset: "-2px" },
  newRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" },
  card: {
    "position": "relative",
    "backgroundColor": tokens.colorNeutralBackground1,
    "borderLeft": "4px solid",
    "borderRadius": "0 4px 4px 0",
    "boxShadow": tokens.shadow4,
    "padding": "13px 12px",
    "maxWidth": "330px",
    "display": "flex",
    "flexDirection": "column",
    "gap": "7px",
    "cursor": "grab",
    "touchAction": "pan-y",
    "userSelect": "none",
    "fontSize": tokens.fontSizeBase200,
    "lineHeight": "16px",
    ":hover": { boxShadow: tokens.shadow8 },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}` },
  },
  ghost: { position: "fixed", zIndex: 1000, pointerEvents: "none", boxShadow: tokens.shadow28, transform: "rotate(2deg)", opacity: 0.95 },
  placeholder: { border: `2px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, borderRadius: "0 4px 4px 0", flexShrink: 0, maxWidth: "330px" },
  lifted: { opacity: 0.4 },
  pending: { opacity: 0.55 },
  // One text run as on the web board: icon, bold id and title flow together across the card width.
  line1: { display: "block", minWidth: 0, overflowWrap: "anywhere" },
  inlineIcon: { display: "inline-flex", verticalAlign: "middle", marginRight: "6px" },
  id: { fontWeight: tokens.fontWeightSemibold },
  titleBtn: {
    padding: 0,
    minWidth: 0,
    height: "auto",
    fontWeight: tokens.fontWeightRegular,
    color: tokens.colorNeutralForeground1,
    justifyContent: "flex-start",
    textAlign: "left",
    fontSize: tokens.fontSizeBase200,
    lineHeight: "16px",
    whiteSpace: "normal",
  },
  line2: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", paddingLeft: "0" },
  progress: { display: "flex", alignItems: "center", gap: "6px" },
  menu: { position: "absolute", top: "4px", right: "4px" },
  srOnly: { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0,0,0,0)" },
});

export interface BoardContentProps {
  /** Header of the points row on a card: "Story Points" for Agile stories, "Effort" otherwise. */
  pointsLabel?: string;
  team: string;
  levelName: string;
  levelNames: string[];
  columns: Column[];
  typeColors?: Record<string, string>;
  stateColors?: Record<string, string>;
  /** Done and total child tasks per card id (the progress line). */
  progress?: ReadonlyMap<number, { done: number; total: number }>;
  /** Titles of the parents the cards point at (the Parent filter). */
  parentTitles?: ReadonlyMap<number, string>;
  /** Moves in flight: the card shows (dimmed) in its target column until the host answers. */
  pendingMoves?: ReadonlyMap<number, string>;
  wipLimit?: number;
  canCreate: boolean;
  canMove: boolean;
  onLevel?: (name: string) => void;
  onViewBacklog?: () => void;
  onAnalytics?: () => void;
  /** Called with the typed title when the user presses Enter in the inline box (starts a host-approved create). */
  onCreateInline?: (title: string) => void;
  /** Called to move a card to a state (menu item, drop or keyboard); starts a host-approved update. */
  onMoveCard?: (card: Card, state: string) => void;
  onOpenCard?: (card: Card) => void;
}

/** The card, as Azure DevOps draws it: type icon, bold id and title on one line, the state, then task progress. */
function CardFace({
  card,
  color,
  taskColor,
  stateColors,
  progress,
  pointsLabel,
}: {
  card: Card;
  color: string;
  taskColor: string;
  stateColors?: Record<string, string>;
  progress?: { done: number; total: number };
  /** "Story Points" or "Effort": the card shows that row when the item has the value. */
  pointsLabel?: string;
}): ReactElement {
  const s = useStyles();
  return (
    <>
      <div className={s.line1}>
        <span className={s.inlineIcon}>
          <TypeIcon type={card.type} color={color} />
        </span>
        <span className={s.id}>{card.id}</span> <span>{card.title}</span>
      </div>
      <div className={s.line2}>
        <StateDot state={card.state} colors={stateColors} />
      </div>
      {card.assignee && (
        <div className={s.line2}>
          <PersonChip person={card.assignee} size={16} />
        </div>
      )}
      {pointsLabel && card.effort !== undefined && (
        <div className={s.line2} style={{ justifyContent: "flex-start", gap: 12 }}>
          <span style={{ color: tokens.colorNeutralForeground3 }}>{pointsLabel}</span>
          <span>{card.effort}</span>
        </div>
      )}
      {progress && progress.total > 0 && (
        <div className={s.progress} aria-label={`${progress.done} of ${progress.total} tasks done`}>
          <CheckboxCheckedFilled color={taskColor} />
          <span>{`${progress.done}/${progress.total}`}</span>
        </div>
      )}
      <TagChips tags={card.tags} />
    </>
  );
}

/** The columns as displayed: cards with a move in flight already sit in their target column. */
function withPendingMoves(columns: Column[], moves?: ReadonlyMap<number, string>): Column[] {
  if (!moves || moves.size === 0) return columns;
  const moving = new Map<number, Card>();
  for (const col of columns) for (const c of col.cards) if (moves.has(c.id)) moving.set(c.id, c);
  return columns.map((col) => ({
    ...col,
    cards: [...col.cards.filter((c) => !moving.has(c.id)), ...[...moving.values()].filter((c) => moves.get(c.id) === col.name)],
  }));
}

export function BoardContent(props: BoardContentProps): ReactElement {
  const s = useStyles();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<FilterState>(NO_FILTER);
  const [showFilters, setShowFilters] = useState(false);
  const [searching, setSearching] = useState(false);
  // Keyboard move: the picked-up card and the column it would be dropped in.
  const [picked, setPicked] = useState<{ id: number; lane: number } | null>(null);
  const laneEls = useRef(new Map<string, HTMLElement>());
  const moved = withPendingMoves(props.columns, props.pendingMoves);
  const everyCard = moved.flatMap((c) => c.cards);
  const columns = moved.map((col) => ({ ...col, cards: col.cards.filter((c) => matchesFilters(c, filters)) }));
  const states = columns.map((c) => c.name);
  const limit = props.wipLimit ?? DEFAULT_WIP_LIMIT;
  const allCards = columns.flatMap((c) => c.cards);
  const options = filterOptions(everyCard, props.parentTitles ?? new Map());
  const taskColor = props.typeColors?.Task ?? FALLBACK_TYPE_COLORS.Task;
  const set = (key: keyof FilterState, value: string): void => setFilters((f) => ({ ...f, [key]: value }));
  const toggle = (name: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const measure = (draggedId: number): LaneRect[] =>
    columns.flatMap((col) => {
      const el = laneEls.current.get(col.name);
      if (!el) return [];
      const r = el.getBoundingClientRect();
      const cards = [...el.querySelectorAll<HTMLElement>("[data-card-id]")]
        .filter((c) => Number(c.dataset.cardId) !== draggedId)
        .map((c) => {
          const cr = c.getBoundingClientRect();
          return { top: cr.top, bottom: cr.bottom };
        });
      return [{ name: col.name, left: r.left, right: r.right, top: r.top, bottom: r.bottom, cards }];
    });

  const moveTo = (id: number, lane: string): void => {
    const card = allCards.find((c) => c.id === id);
    if (card && card.state !== lane && !props.pendingMoves?.has(id)) props.onMoveCard?.(card, lane);
  };
  const { drag, begin, justDragged } = useCardDrag({ enabled: props.canMove, measure, onDrop: moveTo });
  const draggedCard = drag ? allCards.find((c) => c.id === drag.id) : undefined;
  const pickedCard = picked ? allCards.find((c) => c.id === picked.id) : undefined;
  const target = drag?.lane ?? (picked ? columns[picked.lane]?.name : null) ?? null;
  const targetIndex = drag?.lane ? drag.index : 0;
  const activeId = drag?.id ?? picked?.id;
  const placeholderHeight = drag?.height ?? 64;
  const colorOf = (card: Card): string => props.typeColors?.[card.type] ?? FALLBACK_TYPE_COLORS[card.type] ?? "#666666";

  const onCardKeyDown = (e: React.KeyboardEvent<HTMLElement>, card: Card): void => {
    if (!props.canMove || e.target !== e.currentTarget) return;
    const here = states.indexOf(card.state);
    if (!picked) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setPicked({ id: card.id, lane: here });
      }
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setPicked({ id: picked.id, lane: Math.max(0, Math.min(states.length - 1, picked.lane + (e.key === "ArrowRight" ? 1 : -1))) });
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const lane = states[picked.lane];
      setPicked(null);
      if (lane && lane !== card.state) props.onMoveCard?.(card, lane);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setPicked(null);
    }
  };

  const select = (key: "assignee" | "tag" | "iteration" | "area", label: string): ReactElement => (
    <Select size="small" aria-label={label} value={filters[key]} onChange={(_, d) => set(key, d.value)} style={{ minWidth: 110 }}>
      <option value="">{label}</option>
      {options[key].map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </Select>
  );

  return (
    <div className={s.page}>
      <div className={s.bar}>
        <PageTitle name={props.team} kind="board" />
        <Button appearance="secondary" icon={<ArrowCircleRightRegular />} onClick={props.onViewBacklog}>
          {S.board.viewAsBacklog}
        </Button>
      </div>
      <div className={s.bar}>
        <TabList selectedValue="board" size="small">
          <Tab value="board">{S.board.tabBoard}</Tab>
          <Tab value="analytics" onClick={props.onAnalytics}>
            {S.board.tabAnalytics}
          </Tab>
        </TabList>
        <div className={s.tools}>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="transparent" className={s.levelButton} iconPosition="after" icon={<ChevronDownRegular />}>
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
          <Button appearance="subtle" icon={<FilterRegular />} aria-label="Filter" aria-pressed={showFilters || isFiltering(filters)} onClick={() => setShowFilters((v) => !v)} />
          <Button appearance="subtle" icon={<SettingsRegular />} aria-label="Settings" />
          <Button appearance="subtle" icon={<FullScreenMaximizeRegular />} aria-label="Full screen" />
        </div>
      </div>

      {showFilters && (
        <div className={s.filterBar} role="search" aria-label="Filter the board">
          <Input size="small" aria-label="Filter by keyword" placeholder="Filter by keyword" contentBefore={<SearchRegular />} value={filters.keyword} onChange={(_, d) => set("keyword", d.value)} />
          {select("assignee", "Assigned to")}
          {select("tag", "Tags")}
          {select("iteration", "Iteration")}
          {select("area", "Area")}
          <Select size="small" aria-label="Parent" value={filters.parent} onChange={(_, d) => set("parent", d.value)} style={{ minWidth: 110 }}>
            <option value="">Parent</option>
            {options.parent.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          <Button appearance="subtle" size="small" icon={<DismissRegular />} disabled={!isFiltering(filters)} onClick={() => setFilters(NO_FILTER)}>
            Clear
          </Button>
        </div>
      )}

      <div className={s.srOnly} role="status" aria-live="assertive">
        {pickedCard ? `Moving ${pickedCard.title} to ${columns[picked?.lane ?? 0]?.name}. Use the left and right arrow keys to choose a column, Enter to drop, Escape to cancel.` : ""}
      </div>

      <div className={s.lanes} data-intended-scroll="true">
        {columns.map((col, index) => {
          const isFirst = index === 0;
          const inProgress = col.category === "InProgress" || col.category === "Resolved" || (col.category === undefined && col.name === S.board.doing);
          const isCollapsed = collapsed.has(col.name);
          const isTarget = target === col.name && draggedCard?.state !== col.name && (pickedCard ? pickedCard.state !== col.name : true);
          if (isCollapsed) {
            return (
              <div key={col.name} className={`${s.lane} ${s.collapsed}`}>
                <div className={s.laneHead} style={{ justifyContent: "center", padding: "6px 0 4px" }}>
                  <Button appearance="transparent" size="small" icon={<ChevronRightRegular />} aria-label={`Expand ${col.name}`} onClick={() => toggle(col.name)} />
                </div>
                <div className={s.collapsedBody}>
                  <span className={s.vertical}>{col.name}</span>
                  <span className={s.vertical}>{`(${col.cards.length})`}</span>
                </div>
              </div>
            );
          }
          return (
            <div key={col.name} className={s.lane}>
              <div className={s.laneHead}>
                <span>{col.name}</span>
                {inProgress ? (
                  <span className={col.cards.length > limit ? s.wipOver : s.wipOk} aria-label="Work in progress limit">
                    {col.cards.length}
                    <span style={{ fontSize: tokens.fontSizeBase200 }}>{`/${limit}`}</span>
                  </span>
                ) : (
                  <Button appearance="transparent" size="small" icon={<ChevronLeftRegular />} aria-label={`Collapse ${col.name}`} onClick={() => toggle(col.name)} />
                )}
              </div>
              <div
                className={`${s.laneBody}${isTarget ? ` ${s.dropOver}` : ""}`}
                data-lane={col.name}
                ref={(el) => {
                  if (el) laneEls.current.set(col.name, el);
                  else laneEls.current.delete(col.name);
                }}>
                {isFirst && (props.canCreate || true) && (
                  <div className={s.newRow}>
                    {adding && props.canCreate ? (
                      <Input
                        autoFocus
                        size="small"
                        style={{ flex: 1 }}
                        value={draft}
                        placeholder="Enter a title"
                        onChange={(_, d) => setDraft(d.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && draft.trim()) {
                            props.onCreateInline?.(draft.trim());
                            setDraft("");
                            setAdding(false);
                          } else if (e.key === "Escape") {
                            setDraft("");
                            setAdding(false);
                          }
                        }}
                      />
                    ) : searching ? (
                      <Input
                        autoFocus
                        size="small"
                        style={{ flex: 1 }}
                        aria-label="Filter by keyword"
                        placeholder="Filter by keyword"
                        value={filters.keyword}
                        onChange={(_, d) => set("keyword", d.value)}
                        onBlur={() => !filters.keyword && setSearching(false)}
                      />
                    ) : (
                      props.canCreate && (
                        <Button appearance="subtle" icon={<AddRegular />} style={{ height: 28 }} onClick={() => setAdding(true)}>
                          {S.board.newItem}
                        </Button>
                      )
                    )}
                    <Button appearance="subtle" size="small" icon={<SearchRegular />} aria-label="Search" aria-pressed={searching} onClick={() => setSearching((v) => !v)} />
                  </div>
                )}
                {col.cards.map((card, i) => {
                  const color = colorOf(card);
                  const movingNow = props.pendingMoves?.has(card.id) ?? false;
                  return (
                    <div key={card.id} style={{ display: "contents" }}>
                      {isTarget && drag?.lane === col.name && targetIndex === i && <div className={s.placeholder} style={{ height: placeholderHeight }} data-testid="drop-placeholder" />}
                      <BoardCard
                        card={card}
                        color={color}
                        taskColor={taskColor}
                        stateColors={props.stateColors}
                        progress={props.progress?.get(card.id)}
                        pointsLabel={props.pointsLabel}
                        states={states}
                        canMove={props.canMove}
                        moving={movingNow}
                        lifted={activeId === card.id}
                        onPointerDown={(e) => !movingNow && begin(e, card.id)}
                        suppressClick={justDragged}
                        onKeyDown={(e) => onCardKeyDown(e, card)}
                        onMoveCard={props.onMoveCard}
                        onOpenCard={props.onOpenCard}
                      />
                    </div>
                  );
                })}
                {isTarget && (drag ? drag.lane === col.name && targetIndex >= col.cards.length : true) && (
                  <div className={s.placeholder} style={{ height: placeholderHeight }} data-testid="drop-placeholder" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {drag && draggedCard && (
        <div
          className={`${s.card} ${s.ghost}`}
          style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width, borderLeftColor: colorOf(draggedCard) }}
          aria-hidden="true"
          data-testid="drag-ghost">
          <CardFace
            card={draggedCard}
            color={colorOf(draggedCard)}
            taskColor={taskColor}
            stateColors={props.stateColors}
            progress={props.progress?.get(draggedCard.id)}
            pointsLabel={props.pointsLabel}
          />
        </div>
      )}
    </div>
  );
}

function BoardCard(props: {
  card: Card;
  color: string;
  taskColor: string;
  stateColors?: Record<string, string>;
  progress?: { done: number; total: number };
  pointsLabel?: string;
  states: string[];
  canMove: boolean;
  moving: boolean;
  lifted: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  suppressClick: () => boolean;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onMoveCard?: (card: Card, state: string) => void;
  onOpenCard?: (card: Card) => void;
}): ReactElement {
  const s = useStyles();
  const [hover, setHover] = useState(false);
  const { card } = props;
  return (
    <div
      className={`${s.card}${props.moving ? ` ${s.pending}` : ""}${props.lifted ? ` ${s.lifted}` : ""}`}
      style={{ borderLeftColor: props.color }}
      data-testid={`card-${card.id}`}
      data-card-id={card.id}
      tabIndex={props.canMove ? 0 : undefined}
      aria-roledescription={props.canMove ? "Draggable card" : undefined}
      aria-label={`${card.type} ${card.id}: ${card.title}, ${card.state}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={props.onPointerDown}
      onClickCapture={(e) => {
        if (props.suppressClick()) {
          e.stopPropagation();
          e.preventDefault();
        } else if (!(e.target as HTMLElement).closest("[data-nodrag]")) {
          props.onOpenCard?.(card);
        }
      }}
      onKeyDown={props.onKeyDown}>
      <CardFace card={card} color={props.color} taskColor={props.taskColor} stateColors={props.stateColors} progress={props.progress} pointsLabel={props.pointsLabel} />
      {props.canMove && (
        <div className={s.menu} data-nodrag="" style={{ opacity: hover ? 1 : 0 }}>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" size="small" icon={<MoreHorizontalRegular />} aria-label={`Actions for ${card.title}`} onFocus={() => setHover(true)} />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {props.states
                  .filter((st) => st !== card.state)
                  .map((st) => (
                    <MenuItem key={st} onClick={() => props.onMoveCard?.(card, st)}>
                      {`Move to ${st}`}
                    </MenuItem>
                  ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
      )}
    </div>
  );
}
