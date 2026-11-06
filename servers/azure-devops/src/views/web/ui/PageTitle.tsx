/** The page title row shared by boards, backlog and sprints: icon, team name, picker, star, members. */
import { Button, makeStyles, tokens } from "@fluentui/react-components";
import { BoardSplitRegular, ChevronDownRegular, PeopleTeamRegular, StarRegular, TaskListSquareLtrRegular, TextBulletListRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";

const useStyles = makeStyles({
  row: { display: "flex", alignItems: "center", gap: "6px" },
  name: { fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500, fontWeight: tokens.fontWeightSemibold },
});

export type PageKind = "board" | "backlog" | "sprint";

const ICON: Record<PageKind, ReactElement> = {
  board: <BoardSplitRegular />,
  backlog: <TextBulletListRegular />,
  sprint: <TaskListSquareLtrRegular />,
};

export function PageTitle({ name, kind }: { name: string; kind: PageKind }): ReactElement {
  const s = useStyles();
  return (
    <div className={s.row}>
      <span style={{ fontSize: 20, display: "inline-flex" }}>{ICON[kind]}</span>
      <h1 className={s.name} style={{ margin: 0 }}>
        {name}
      </h1>
      <Button appearance="transparent" size="small" icon={<ChevronDownRegular />} aria-label="Switch team" />
      <Button appearance="transparent" size="small" icon={<StarRegular />} aria-label="Favorite" />
      <Button appearance="transparent" size="small" icon={<PeopleTeamRegular />} aria-label="Team members" />
    </div>
  );
}
