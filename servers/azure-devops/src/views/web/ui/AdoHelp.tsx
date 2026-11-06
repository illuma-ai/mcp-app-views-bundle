/** The helper boxes of the Azure DevOps work item form (Deployment and Development), with their links. */
import { SURFACE } from "../lib/host-theme";
import { makeStyles, tokens } from "@fluentui/react-components";
import { BranchForkRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { LinkButton } from "./parts";

const useStyles = makeStyles({
  box: {
    backgroundColor: SURFACE.inset,
    padding: "10px 12px",
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
  },
  icon: { fontSize: "32px", color: tokens.colorPaletteDarkOrangeForeground1, flexShrink: 0 },
  link: { fontSize: tokens.fontSizeBase300, verticalAlign: "baseline", display: "inline", whiteSpace: "normal" },
});

/** "To track releases associated with this work item, go to Releases and turn on ..." */
export function DeploymentHelp({ onLink }: { onLink?: (what: "releases" | "learn") => void }): ReactElement {
  const s = useStyles();
  return (
    <div className={s.box}>
      <span>
        To track releases associated with this work item, go to{" "}
        <LinkButton className={s.link} onClick={() => onLink?.("releases")}>
          Releases
        </LinkButton>{" "}
        and turn on deployment status reporting for Boards in your pipeline&apos;s Options menu.{" "}
        <LinkButton className={s.link} onClick={() => onLink?.("learn")}>
          Learn more about deployment status reporting
        </LinkButton>
      </span>
    </div>
  );
}

/** "Link an Azure Repos commit, pull request or branch to see the status of your development. ..." */
export function DevelopmentHelp({ onLink }: { onLink?: (what: "commit" | "pull-request" | "branch" | "create-branch") => void }): ReactElement {
  const s = useStyles();
  return (
    <div className={s.box}>
      <BranchForkRegular className={s.icon} />
      <span>
        Link an Azure Repos{" "}
        <LinkButton className={s.link} onClick={() => onLink?.("commit")}>
          commit
        </LinkButton>
        ,{" "}
        <LinkButton className={s.link} onClick={() => onLink?.("pull-request")}>
          pull request
        </LinkButton>{" "}
        or{" "}
        <LinkButton className={s.link} onClick={() => onLink?.("branch")}>
          branch
        </LinkButton>{" "}
        to see the status of your development. You can also{" "}
        <LinkButton className={s.link} onClick={() => onLink?.("create-branch")}>
          create a branch
        </LinkButton>{" "}
        to get started.
      </span>
    </div>
  );
}
