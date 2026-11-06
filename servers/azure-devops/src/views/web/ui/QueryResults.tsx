/** A flat list of work items as the Azure DevOps query results table shows them. */
import { Button, makeStyles, tokens } from "@fluentui/react-components";
import type { ReactElement } from "react";
import type { Card } from "../lib/work-items";
import { PersonChip, StateDot, TagChips, TypeIcon } from "./parts";

const useStyles = makeStyles({
  page: { backgroundColor: tokens.colorNeutralBackground2, padding: "8px 12px 12px" },
  title: { display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "6px" },
  heading: { fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500, fontWeight: tokens.fontWeightSemibold, margin: 0 },
  count: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  table: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4 },
  head: {
    "display": "grid",
    "gridTemplateColumns": "44px minmax(0,1fr) 112px 78px",
    "@media (max-width: 480px)": { gridTemplateColumns: "36px minmax(0,1fr) 72px" },
    "gap": "8px",
    "padding": "6px 8px",
    "fontSize": tokens.fontSizeBase200,
    "color": tokens.colorNeutralForeground3,
    "borderBottom": `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: {
    "display": "grid",
    "gridTemplateColumns": "44px minmax(0,1fr) 112px 78px",
    "@media (max-width: 480px)": { gridTemplateColumns: "36px minmax(0,1fr) 72px" },
    "gap": "8px",
    "alignItems": "center",
    "padding": "4px 8px",
    "borderBottom": `1px solid ${tokens.colorNeutralStroke3}`,
    "fontSize": tokens.fontSizeBase300,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  titleCell: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  hideNarrow: { "@media (max-width: 480px)": { display: "none" } },
  empty: { padding: "32px 16px", textAlign: "center", color: tokens.colorNeutralForeground3 },
});

export interface QueryResultsProps {
  heading: string;
  cards: Card[];
  typeColors?: Record<string, string>;
  stateColors?: Record<string, string>;
  /** Set when the list was cut at the limit. */
  truncated?: boolean;
  onOpen?: (card: Card) => void;
}

export function QueryResults(props: QueryResultsProps): ReactElement {
  const s = useStyles();
  return (
    <div className={s.page}>
      <div className={s.title}>
        <h1 className={s.heading}>{props.heading}</h1>
        <span className={s.count}>{`${props.cards.length}${props.truncated ? "+" : ""} ${props.cards.length === 1 ? "result" : "results"}`}</span>
      </div>
      <div className={s.table} role="table" aria-label={props.heading}>
        <div className={s.head} role="row">
          <span>ID</span>
          <span>Title</span>
          <span className={s.hideNarrow}>Assigned To</span>
          <span>State</span>
        </div>
        {props.cards.length === 0 && <div className={s.empty}>No results</div>}
        {props.cards.map((c) => (
          <div key={c.id} className={s.row} role="row" data-testid={`result-${c.id}`}>
            <span>{c.id}</span>
            <div className={s.titleCell}>
              <TypeIcon type={c.type} color={props.typeColors?.[c.type]} />
              <Button
                appearance="transparent"
                size="small"
                className={s.ellipsis}
                style={{ padding: 0, minWidth: 0, height: "auto", fontWeight: 400, justifyContent: "flex-start" }}
                onClick={() => props.onOpen?.(c)}>
                {c.title}
              </Button>
              <TagChips tags={c.tags} />
            </div>
            <span className={s.hideNarrow}>
              <PersonChip person={c.assignee} size={16} />
            </span>
            <StateDot state={c.state} colors={props.stateColors} />
          </div>
        ))}
      </div>
    </div>
  );
}
