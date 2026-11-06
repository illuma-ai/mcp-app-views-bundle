/**
 * Presentational parts of the Repos views: the pull request list, a pull request (overview with
 * reviewers, votes and discussion; changed files) and the new pull request review form. Containers in
 * PullScreens.tsx load the data; every write is started from a button handler there.
 */
import { SURFACE } from "../lib/host-theme";
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Select,
  Tab,
  TabList,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowLeftRegular,
  BranchForkRegular,
  BranchRequestFilled,
  BranchRequestRegular,
  CheckmarkCircleFilled,
  ChevronDownRegular,
  CommentMultipleRegular,
  DismissCircleFilled,
  DismissRegular,
  DocumentAddRegular,
  DocumentDismissRegular,
  DocumentEditRegular,
  EditRegular,
  ErrorCircleFilled,
  FilterRegular,
  SearchRegular,
  SubtractCircleRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useState } from "react";
import { agoLabel } from "../lib/detail";
import { descriptionToHtml, withDefaults } from "../lib/form";
import {
  type ChangedFile,
  type CompletionOptions,
  MERGE_TYPES,
  type MergeType,
  type PullCommit,
  type PullDetail,
  type PullStatus,
  type PullSummary,
  type PullUpdate,
  type Repo,
  type Reviewer,
  type Thread,
  VOTES,
  type VoteName,
  buildFeed,
  defaultMergeMessage,
  isOpenThread,
  mergeBanner,
  voteLabel,
} from "../lib/pulls";
import { LinkButton, PersonChip, StateDot, TypeIcon, initialsOf } from "./parts";
import { RichHtml } from "./RichHtml";

const NARROW = "@media (max-width: 480px)";

const useStyles = makeStyles({
  action: { height: "30px", minHeight: "30px" },
  page: { backgroundColor: tokens.colorNeutralBackground2, padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: "8px" },
  bar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" },
  heading: { fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500, fontWeight: tokens.fontWeightSemibold, margin: 0, overflowWrap: "anywhere" },
  panel: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4 },
  row: {
    "display": "grid",
    "gridTemplateColumns": "40px minmax(0,1fr) 60px 140px",
    "gap": "8px",
    "alignItems": "center",
    "padding": "17px 12px",
    "borderBottom": `1px solid ${tokens.colorNeutralStroke3}`,
    "fontSize": tokens.fontSizeBase300,
    "minWidth": 0,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    [NARROW]: { gridTemplateColumns: "40px minmax(0,1fr)" },
  },
  hideNarrow: { display: "inline-flex", alignItems: "center", gap: "4px", [NARROW]: { display: "none" } },
  titleLine: {
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    justifyContent: "flex-start",
    textAlign: "left",
    minWidth: 0,
    fontWeight: tokens.fontWeightSemibold,
  },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  filterRow: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4, padding: "10px 12px" },
  created: { fontSize: tokens.fontSizeBase300, whiteSpace: "nowrap", [NARROW]: { display: "none" } },
  metaLine: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: tokens.fontSizeBase300 },
  branchLink: { color: tokens.colorBrandForegroundLink, textDecoration: "underline", fontWeight: tokens.fontWeightSemibold },
  banner: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4, padding: "13px 20px", display: "flex", alignItems: "center", gap: "16px" },
  bannerTitle: { fontSize: tokens.fontSizeBase300 },
  cardTitle: { fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500 },
  commentBox: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4, padding: "12px", display: "flex", alignItems: "center", gap: "12px" },
  feed: { display: "flex", flexDirection: "column", gap: "10px", padding: "0 0 8px 0" },
  feedRow: { display: "flex", alignItems: "center", gap: "12px", fontSize: tokens.fontSizeBase300 },
  railSection: { display: "flex", flexDirection: "column", gap: "8px" },
  railTitle: { fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500 },
  railGroup: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  railEmpty: { backgroundColor: SURFACE.inset, textAlign: "center", padding: "10px", fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground2 },
  workItem: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "6px", minWidth: 0, fontSize: tokens.fontSizeBase300 },
  empty: { padding: "28px 16px", textAlign: "center", color: tokens.colorNeutralForeground3 },
  card: { backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4, padding: "12px", display: "flex", flexDirection: "column", gap: "6px" },
  cols: { display: "grid", gridTemplateColumns: "minmax(0, 2.2fr) minmax(0, 1fr)", gap: "8px", [NARROW]: { gridTemplateColumns: "minmax(0, 1fr)" } },
  sectionTitle: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, paddingBottom: "2px" },
  help: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  reviewer: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", fontSize: tokens.fontSizeBase300 },
  thread: { display: "flex", flexDirection: "column", gap: "4px", padding: "8px", border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: "4px" },
  comment: { display: "flex", flexDirection: "column", gap: "2px" },
  commentHead: { display: "flex", gap: "8px", alignItems: "center", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  branches: { display: "inline-flex", alignItems: "center", gap: "4px", flexWrap: "wrap", fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  form: { display: "flex", flexDirection: "column", gap: "8px", padding: "12px", backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", [NARROW]: { gridTemplateColumns: "minmax(0, 1fr)" } },
  file: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", borderBottom: `1px solid ${tokens.colorNeutralStroke3}`, fontSize: tokens.fontSizeBase300, minWidth: 0 },
  filePath: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left" },
});

const STATUS_COLOR: Record<PullStatus, string> = { Active: "#107c10", Completed: "#5c2e91", Abandoned: "#8a8886", Draft: "#8a8886" };

export function StatusIcon({ status }: { status: PullStatus }): ReactElement {
  return (
    <span role="img" aria-label={status} title={status} style={{ display: "inline-flex", fontSize: 18, color: STATUS_COLOR[status] }}>
      <BranchRequestFilled />
    </span>
  );
}

/** The icon beside a reviewer: approved, approved with suggestions, waiting, rejected, no vote. */
export function VoteIcon({ vote }: { vote: number }): ReactElement {
  const label = voteLabel(vote);
  const icon =
    vote >= 10 ? (
      <CheckmarkCircleFilled color="#107c10" />
    ) : vote >= 5 ? (
      <CheckmarkCircleFilled color="#4f9f2f" />
    ) : vote === -5 ? (
      <ErrorCircleFilled color="#d83b01" />
    ) : vote <= -10 ? (
      <DismissCircleFilled color="#c50f1f" />
    ) : (
      <SubtractCircleRegular color="#8a8886" />
    );
  return (
    <span role="img" aria-label={label} title={label} style={{ display: "inline-flex", fontSize: 16 }}>
      {icon}
    </span>
  );
}

// ---- list ---------------------------------------------------------------------------------------

export type PullTab = "Mine" | "Active" | "Completed" | "Abandoned";

export interface PullListProps {
  pulls: PullSummary[];
  tab: PullTab;
  loading?: boolean;
  canCreate: boolean;
  now?: Date;
  onTab?: (tab: PullTab) => void;
  onNew?: () => void;
  onOpen?: (pull: PullSummary) => void;
}

export function PullList(props: PullListProps): ReactElement {
  const s = useStyles();
  const [showFilters, setShowFilters] = useState(true);
  const [text, setText] = useState("");
  const [creator, setCreator] = useState("");
  const [assignee, setAssignee] = useState("");
  const authors = [...new Set(props.pulls.map((p) => p.author?.name).filter((n): n is string => Boolean(n)))].sort();
  const reviewers = [...new Set(props.pulls.flatMap((p) => p.reviewers.map((r) => r.person.name)))].sort();
  const needle = text.trim().toLowerCase().replace(/^!/, "");
  const pulls = props.pulls.filter(
    (p) =>
      (needle === "" || p.title.toLowerCase().includes(needle) || String(p.id) === needle) &&
      (creator === "" || p.author?.name === creator) &&
      (assignee === "" || p.reviewers.some((r) => r.person.name === assignee))
  );
  const filtering = text !== "" || creator !== "" || assignee !== "";
  return (
    <div className={s.page}>
      <div className={s.bar}>
        <h1 className={s.heading}>Pull requests</h1>
        {props.canCreate && (
          <Button appearance="primary" className={s.action} onClick={props.onNew}>
            New pull request
          </Button>
        )}
      </div>
      <div className={s.bar}>
        <TabList selectedValue={props.tab} size="small" onTabSelect={(_, d) => props.onTab?.(d.value as PullTab)}>
          <Tab value="Mine">Mine</Tab>
          <Tab value="Active">Active</Tab>
          <Tab value="Completed">Completed</Tab>
          <Tab value="Abandoned">Abandoned</Tab>
        </TabList>
        <Button appearance="subtle" icon={<FilterRegular />} aria-label="Filter" aria-pressed={showFilters} onClick={() => setShowFilters((v) => !v)} />
      </div>
      {showFilters && (
        <div className={s.filterRow} role="search" aria-label="Filter pull requests">
          <Input
            appearance="underline"
            aria-label="Pull Request ID or title"
            placeholder="Pull Request ID or title"
            value={text}
            onChange={(_, d) => setText(d.value)}
            style={{ flex: 2, minWidth: 120 }}
          />
          <Select appearance="underline" aria-label="Created by" value={creator} onChange={(_, d) => setCreator(d.value)} style={{ flex: 1, minWidth: 100 }}>
            <option value="">Created by</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Select appearance="underline" aria-label="Assigned to" value={assignee} onChange={(_, d) => setAssignee(d.value)} style={{ flex: 1, minWidth: 100 }}>
            <option value="">Assigned to</option>
            {reviewers.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Button
            appearance="subtle"
            size="small"
            icon={<DismissRegular />}
            aria-label="Clear filters"
            disabled={!filtering}
            onClick={() => {
              setText("");
              setCreator("");
              setAssignee("");
            }}
          />
        </div>
      )}
      <div className={s.panel} role="list" aria-label="Pull requests">
        {!props.loading && pulls.length === 0 && (
          <div className={s.empty}>{props.tab === "Mine" ? "No pull requests are assigned to you or created by you" : `No ${props.tab.toLowerCase()} pull requests`}</div>
        )}
        {pulls.map((p) => (
          <div key={p.id} className={s.row} role="listitem" data-testid={`pr-${p.id}`}>
            <Avatar name={p.author?.name ?? "?"} initials={initialsOf(p.author?.name ?? "?")} size={32} color="colorful" />
            <div style={{ minWidth: 0 }}>
              <LinkButton className={s.titleLine} onClick={() => props.onOpen?.(p)}>
                {p.title}
              </LinkButton>
              <div className={s.sub}>
                {`${p.author?.name ?? ""} request !${p.id} into `}
                <BranchForkRegular style={{ verticalAlign: "middle", fontSize: 12 }} />
                <span style={{ fontFamily: tokens.fontFamilyMonospace }}> {p.target}</span>
              </div>
            </div>
            <span className={`${s.hideNarrow} ${s.help}`} aria-label={`${p.commentCount ?? 0} comments`}>
              <CommentMultipleRegular />
              {p.commentCount ?? 0}
            </span>
            <span className={s.created}>{`Created ${p.created ? agoLabel(p.created, props.now) : ""}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- detail -------------------------------------------------------------------------------------

const FILE_ICON: Record<ChangedFile["change"], ReactElement> = {
  add: <DocumentAddRegular color="#107c10" />,
  edit: <DocumentEditRegular color="#0f6cbd" />,
  delete: <DocumentDismissRegular color="#c50f1f" />,
  rename: <DocumentEditRegular color="#8a8886" />,
  other: <DocumentEditRegular color="#8a8886" />,
};

const CHANGE_LABEL: Record<ChangedFile["change"], string> = { add: "Add", edit: "Edit", delete: "Delete", rename: "Rename", other: "Change" };

export type PullDetailTab = "overview" | "files" | "updates" | "commits";

export interface LinkedWorkItem {
  id: number;
  type: string;
  title: string;
  state: string;
  changed?: string;
}

export interface PullDetailProps {
  pull: PullDetail;
  threads: Thread[];
  updates: PullUpdate[];
  commits: PullCommit[];
  workItems: LinkedWorkItem[];
  tab?: PullDetailTab;
  canVote: boolean;
  canComment: boolean;
  /** Edit, complete, abandon, reviewers, tags and work item links (the write tools are available). */
  canEdit: boolean;
  busy?: boolean;
  error?: string | null;
  saved?: string | null;
  now?: Date;
  /** When the merge status was read: "Last checked ...". */
  checkedAt?: Date;
  onTab?: (tab: PullDetailTab) => void;
  onBack?: () => void;
  /** Starts a vote (a button or menu item); the host asks the user to approve. */
  onVote?: (vote: VoteName) => void;
  /** Starts a new comment thread or a reply (Comment / Reply buttons); the host asks the user to approve. */
  onComment?: (text: string, threadId?: number) => void;
  /** Starts resolving or reopening a thread (a button); the host asks the user to approve. */
  onThreadStatus?: (threadId: number, status: "Fixed" | "Active") => void;
  /** Starts saving an edited description (the pencil's Save button). */
  onEditDescription?: (text: string) => void;
  /** Starts the merge with the options of the completion dialog (Complete merge button). */
  onComplete?: (options: CompletionOptions) => void;
  /** Starts abandoning the pull request (menu item). */
  onAbandon?: () => void;
  /** Reads people for the reviewer picker. */
  onFindPeople?: (filter: string) => Promise<{ id?: string; displayName?: string; uniqueName?: string }[]>;
  /** Starts adding or removing a reviewer, replacing the tags, or linking or unlinking a work item (buttons). */
  onAddReviewer?: (id: string, required: boolean) => void;
  onRemoveReviewer?: (id: string) => void;
  onSetLabels?: (labels: string[]) => void;
  onAddWorkItem?: (id: number) => void;
  onRemoveWorkItem?: (id: number) => void;
  onOpenWeb?: () => void;
  onLink?: (url: string) => void;
}

function ReviewerRow({ r, canEdit, onRemove }: { r: Reviewer; canEdit: boolean; onRemove?: (id: string) => void }): ReactElement {
  const s = useStyles();
  return (
    <div className={s.reviewer}>
      <PersonChip person={r.person} size={24} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <VoteIcon vote={r.vote} />
        <span className={s.help}>{voteLabel(r.vote)}</span>
        {canEdit && r.id && <Button appearance="subtle" size="small" icon={<DismissRegular />} aria-label={`Remove ${r.person.name}`} onClick={() => onRemove?.(r.id as string)} />}
      </span>
    </div>
  );
}

export function PullDetailView(props: PullDetailProps): ReactElement {
  const s = useStyles();
  const [tab, setTab] = useState<PullDetailTab>(props.tab ?? "overview");
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [feedFilter, setFeedFilter] = useState<"all" | "comments">("all");
  const [editing, setEditing] = useState(false);
  const [descText, setDescText] = useState("");
  const [completing, setCompleting] = useState(false);
  const [merge, setMerge] = useState<CompletionOptions>({ mergeStrategy: "NoFastForward", deleteSourceBranch: false, transitionWorkItems: true, mergeCommitMessage: "" });
  const [addingReviewer, setAddingReviewer] = useState<"required" | "optional" | null>(null);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<{ id?: string; displayName?: string; uniqueName?: string }[]>([]);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [itemDraft, setItemDraft] = useState("");
  const { pull } = props;
  const locked = Boolean(props.busy);
  const open = pull.status === "Active" || pull.status === "Draft";
  const feed = buildFeed(pull, props.threads);
  const shown = feed.filter((f) => feedFilter === "all" || f.kind === "thread");
  const banner = mergeBanner(pull.mergeStatus);
  const required = pull.reviewers.filter((r) => r.isRequired);
  const optional = pull.reviewers.filter((r) => !r.isRequired);
  const selectTab = (t: PullDetailTab): void => {
    setTab(t);
    props.onTab?.(t);
  };

  const search_ = (): void => {
    void props
      .onFindPeople?.(search.trim())
      .then(setFound)
      .catch(() => setFound([]));
  };

  return (
    <div className={s.page}>
      <div className={s.bar}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {props.onBack && <Button appearance="subtle" size="small" icon={<ArrowLeftRegular />} aria-label="Back to pull requests" onClick={props.onBack} />}
          <h1 className={s.heading}>{pull.title}</h1>
        </span>
        {open && (props.canVote || props.canEdit) && (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            {props.canVote && (
              <span style={{ display: "inline-flex" }}>
                <Button appearance="secondary" className={s.action} disabled={locked} onClick={() => props.onVote?.("Approved")}>
                  Approve
                </Button>
                <Menu positioning="below-end">
                  <MenuTrigger disableButtonEnhancement>
                    <Button appearance="secondary" disabled={locked} icon={<ChevronDownRegular />} aria-label="More votes" />
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      {VOTES.filter((v) => v.name !== "Approved").map((v) => (
                        <MenuItem key={v.name} onClick={() => props.onVote?.(v.name)}>
                          {v.label}
                        </MenuItem>
                      ))}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              </span>
            )}
            {props.canEdit && (
              <span style={{ display: "inline-flex" }}>
                <Button
                  appearance="primary"
                  className={s.action}
                  icon={<BranchRequestRegular />}
                  disabled={locked}
                  onClick={() => {
                    setMerge((m) => ({ ...m, mergeCommitMessage: defaultMergeMessage(pull.id, pull.title, pull.description) }));
                    setCompleting(true);
                  }}>
                  Complete
                </Button>
                <Menu positioning="below-end">
                  <MenuTrigger disableButtonEnhancement>
                    <Button appearance="primary" disabled={locked} icon={<ChevronDownRegular />} aria-label="More completion options" />
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      <MenuItem onClick={() => props.onAbandon?.()}>Abandon</MenuItem>
                    </MenuList>
                  </MenuPopover>
                </Menu>
              </span>
            )}
          </span>
        )}
      </div>
      <div className={s.metaLine}>
        <Badge appearance="filled" color={pull.status === "Active" ? "brand" : pull.status === "Completed" ? "success" : "subtle"} shape="rounded">
          {pull.status}
        </Badge>
        <LinkButton onClick={props.onOpenWeb}>{`!${pull.id}`}</LinkButton>
        <Avatar name={pull.author?.name ?? "?"} initials={initialsOf(pull.author?.name ?? "?")} size={20} color="colorful" />
        <span>{`${pull.author?.name ?? ""} proposes to merge`}</span>
        <span className={s.branchLink}>{pull.source}</span>
        <span>into</span>
        <span className={s.branchLink}>{pull.target}</span>
      </div>
      <TabList selectedValue={tab} size="small" onTabSelect={(_, d) => selectTab(d.value as PullDetailTab)}>
        <Tab value="overview">Overview</Tab>
        <Tab value="files">Files</Tab>
        <Tab value="updates">Updates</Tab>
        <Tab value="commits">Commits</Tab>
      </TabList>

      {completing && props.canEdit && (
        <div className={s.card} role="dialog" aria-label="Complete pull request">
          <div className={s.sectionTitle}>Complete pull request</div>
          <Field label="Merge type">
            <Select value={merge.mergeStrategy} disabled={locked} onChange={(_, d) => setMerge((m) => ({ ...m, mergeStrategy: d.value as MergeType }))}>
              {MERGE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Checkbox
            label={`Delete ${pull.source} after merging`}
            checked={merge.deleteSourceBranch}
            disabled={locked}
            onChange={(_, d) => setMerge((m) => ({ ...m, deleteSourceBranch: Boolean(d.checked) }))}
          />
          <Checkbox
            label="Complete associated work items after merging"
            checked={merge.transitionWorkItems}
            disabled={locked}
            onChange={(_, d) => setMerge((m) => ({ ...m, transitionWorkItems: Boolean(d.checked) }))}
          />
          <Field label="Merge commit message">
            <Textarea rows={3} resize="vertical" value={merge.mergeCommitMessage} disabled={locked} onChange={(_, d) => setMerge((m) => ({ ...m, mergeCommitMessage: d.value }))} />
          </Field>
          <div className={s.bar}>
            <span className={s.help}>The host asks you to approve the merge.</span>
            <span>
              <Button appearance="subtle" onClick={() => setCompleting(false)}>
                Cancel
              </Button>{" "}
              <Button
                appearance="primary"
                disabled={locked}
                onClick={() => {
                  props.onComplete?.(merge);
                  setCompleting(false);
                }}>
                Complete merge
              </Button>
            </span>
          </div>
        </div>
      )}

      {tab === "overview" && (
        <div className={s.cols}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div className={s.banner}>
              {banner.tone === "ok" ? (
                <CheckmarkCircleFilled color="#107c10" fontSize={28} />
              ) : banner.tone === "conflict" ? (
                <DismissCircleFilled color="#c50f1f" fontSize={28} />
              ) : (
                <ErrorCircleFilled color="#8a8886" fontSize={28} />
              )}
              <div>
                <div className={s.bannerTitle}>{banner.title}</div>
                <div className={s.help}>{`Last checked ${agoLabel((props.checkedAt ?? new Date()).toISOString(), props.now)}`}</div>
              </div>
            </div>
            <div className={s.card}>
              <div className={s.bar}>
                <div className={s.cardTitle}>Description</div>
                {props.canEdit && !editing && (
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<EditRegular />}
                    aria-label="Edit description"
                    disabled={locked}
                    onClick={() => {
                      setDescText(pull.description);
                      setEditing(true);
                    }}
                  />
                )}
              </div>
              {editing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Textarea rows={5} resize="vertical" value={descText} disabled={locked} onChange={(_, d) => setDescText(d.value)} />
                  <div>
                    <Button
                      appearance="primary"
                      size="small"
                      disabled={locked}
                      onClick={() => {
                        props.onEditDescription?.(descText);
                        setEditing(false);
                      }}>
                      Save
                    </Button>{" "}
                    <Button appearance="subtle" size="small" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : pull.description ? (
                <RichHtml html={descriptionToHtml(pull.description)} onLink={props.onLink} />
              ) : (
                <div className={s.help}>No description provided.</div>
              )}
            </div>
            <div className={s.bar} style={{ justifyContent: "flex-end" }}>
              <Menu positioning="below-end">
                <MenuTrigger disableButtonEnhancement>
                  <Button appearance="secondary" iconPosition="after" icon={<ChevronDownRegular />}>
                    {feedFilter === "all" ? `Show everything (${feed.length})` : `Show comments (${feed.length - 1})`}
                  </Button>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem onClick={() => setFeedFilter("all")}>{`Show everything (${feed.length})`}</MenuItem>
                    <MenuItem onClick={() => setFeedFilter("comments")}>{`Show comments (${feed.length - 1})`}</MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
            </div>
            {props.canComment && (
              <div className={s.commentBox}>
                <Avatar name={pull.author?.name ?? "You"} initials={initialsOf(pull.author?.name ?? "You")} size={28} color="colorful" />
                <Input style={{ flex: 1 }} placeholder="Add a comment..." aria-label="Add a comment" value={comment} disabled={locked} onChange={(_, d) => setComment(d.value)} />
                <Button
                  appearance="primary"
                  size="small"
                  disabled={locked || comment.trim() === ""}
                  onClick={() => {
                    props.onComment?.(comment.trim());
                    setComment("");
                  }}>
                  Comment
                </Button>
              </div>
            )}
            <div className={s.feed}>
              {shown.map((f) =>
                f.kind === "created" ? (
                  <div key={f.key} className={s.feedRow}>
                    <Avatar name={f.author?.name ?? "?"} initials={initialsOf(f.author?.name ?? "?")} size={28} color="colorful" />
                    <span style={{ flex: 1, minWidth: 0 }}>{`${f.author?.name ?? ""} created the pull request`}</span>
                    <span className={s.help}>{f.date ? agoLabel(f.date, props.now) : ""}</span>
                  </div>
                ) : (
                  f.thread && (
                    <div key={f.key} className={s.thread} data-testid={`thread-${f.thread.id}`}>
                      <div className={s.commentHead}>
                        <Badge appearance="outline" color={isOpenThread(f.thread.status) ? "warning" : "success"} size="small">
                          {isOpenThread(f.thread.status) ? "Active" : f.thread.status === "Fixed" ? "Resolved" : f.thread.status}
                        </Badge>
                        {f.thread.filePath && <span>{`${f.thread.filePath}${f.thread.line ? `:${f.thread.line}` : ""}`}</span>}
                      </div>
                      {f.thread.comments.map((c) => (
                        <div key={c.id} className={s.comment}>
                          <div className={s.commentHead}>
                            <PersonChip person={c.author} size={20} />
                            <span>{c.date ? agoLabel(c.date, props.now) : ""}</span>
                          </div>
                          <RichHtml html={descriptionToHtml(c.content)} onLink={props.onLink} />
                        </div>
                      ))}
                      {props.canComment && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Button size="small" appearance="subtle" disabled={locked} onClick={() => setReplyTo(replyTo === f.thread?.id ? null : (f.thread?.id ?? null))}>
                            Reply
                          </Button>
                          <Button
                            size="small"
                            appearance="subtle"
                            disabled={locked}
                            onClick={() => props.onThreadStatus?.(f.thread?.id ?? 0, isOpenThread(f.thread?.status ?? "") ? "Fixed" : "Active")}>
                            {isOpenThread(f.thread.status) ? "Resolve" : "Reactivate"}
                          </Button>
                        </div>
                      )}
                      {replyTo === f.thread.id && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <Textarea rows={2} placeholder="Reply" value={reply} onChange={(_, d) => setReply(d.value)} />
                          <div>
                            <Button
                              size="small"
                              appearance="primary"
                              disabled={locked || reply.trim() === ""}
                              onClick={() => {
                                props.onComment?.(reply.trim(), f.thread?.id);
                                setReply("");
                                setReplyTo(null);
                              }}>
                              Reply
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <div className={s.railSection}>
              <div className={s.bar}>
                <div className={s.railTitle}>Reviewers</div>
                {props.canEdit && (
                  <Menu positioning="below-end">
                    <MenuTrigger disableButtonEnhancement>
                      <Button appearance="secondary" iconPosition="after" icon={<ChevronDownRegular />} disabled={locked}>
                        Add
                      </Button>
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList>
                        <MenuItem onClick={() => setAddingReviewer("required")}>Add required reviewers</MenuItem>
                        <MenuItem onClick={() => setAddingReviewer("optional")}>Add optional reviewers</MenuItem>
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                )}
              </div>
              {addingReviewer && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Input
                      autoFocus
                      size="small"
                      placeholder="Search users and groups"
                      value={search}
                      onChange={(_, d) => setSearch(d.value)}
                      onKeyDown={(e) => e.key === "Enter" && search_()}
                      style={{ flex: 1 }}
                    />
                    <Button size="small" icon={<SearchRegular />} aria-label="Search" disabled={search.trim() === ""} onClick={search_} />
                  </div>
                  {found.map((p) => (
                    <Button
                      key={p.id ?? p.uniqueName}
                      appearance="subtle"
                      size="small"
                      style={{ justifyContent: "flex-start" }}
                      disabled={!p.id || locked}
                      onClick={() => {
                        if (p.id) props.onAddReviewer?.(p.id, addingReviewer === "required");
                        setAddingReviewer(null);
                        setFound([]);
                        setSearch("");
                      }}>
                      {`${p.displayName ?? p.uniqueName}${p.uniqueName && p.displayName ? ` <${p.uniqueName}>` : ""}`}
                    </Button>
                  ))}
                </div>
              )}
              <div className={s.railGroup}>Required</div>
              {required.length === 0 ? (
                <div className={s.railEmpty}>No required reviewers</div>
              ) : (
                required.map((r) => <ReviewerRow key={r.person.name} r={r} canEdit={props.canEdit} onRemove={props.onRemoveReviewer} />)
              )}
              <div className={s.railGroup}>Optional</div>
              {optional.length === 0 ? (
                <div className={s.railEmpty}>No optional reviewers</div>
              ) : (
                optional.map((r) => <ReviewerRow key={r.person.name} r={r} canEdit={props.canEdit} onRemove={props.onRemoveReviewer} />)
              )}
            </div>

            <div className={s.railSection}>
              <div className={s.bar}>
                <div className={s.railTitle}>Tags</div>
                {props.canEdit && <Button appearance="secondary" icon={<AddRegular />} aria-label="Add tag" disabled={locked} onClick={() => setAddingTag(true)} />}
              </div>
              {addingTag && (
                <Input
                  autoFocus
                  size="small"
                  placeholder="Tag"
                  value={tagDraft}
                  onChange={(_, d) => setTagDraft(d.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagDraft.trim()) {
                      props.onSetLabels?.([...pull.labels, tagDraft.trim()]);
                      setTagDraft("");
                      setAddingTag(false);
                    } else if (e.key === "Escape") setAddingTag(false);
                  }}
                />
              )}
              {pull.labels.length === 0 ? (
                <div className={s.railEmpty}>No tags</div>
              ) : (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {pull.labels.map((l) => (
                    <Badge key={l} appearance="outline" size="large">
                      {l}
                      {props.canEdit && (
                        <Button
                          appearance="transparent"
                          size="small"
                          icon={<DismissRegular />}
                          aria-label={`Remove tag ${l}`}
                          onClick={() => props.onSetLabels?.(pull.labels.filter((x) => x !== l))}
                        />
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className={s.railSection}>
              <div className={s.bar}>
                <div className={s.railTitle}>Work items</div>
                {props.canEdit && <Button appearance="secondary" icon={<AddRegular />} aria-label="Add work item" disabled={locked} onClick={() => setAddingItem(true)} />}
              </div>
              {addingItem && (
                <Input
                  autoFocus
                  size="small"
                  type="number"
                  placeholder="Work item id"
                  value={itemDraft}
                  onChange={(_, d) => setItemDraft(d.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && Number(itemDraft) > 0) {
                      props.onAddWorkItem?.(Number(itemDraft));
                      setItemDraft("");
                      setAddingItem(false);
                    } else if (e.key === "Escape") setAddingItem(false);
                  }}
                />
              )}
              {props.workItems.length === 0 ? (
                <div className={s.railEmpty}>No work items</div>
              ) : (
                props.workItems.map((w) => (
                  <div key={w.id} className={s.workItem}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <LinkButton className={s.titleLine} onClick={() => props.onLink?.(`https://dev.azure.com/_workitems/edit/${w.id}`)}>
                        <TypeIcon type={w.type} /> {`${w.type} ${w.id}: ${w.title}`}
                      </LinkButton>
                      <div className={s.help}>
                        {w.changed ? `Updated ${agoLabel(w.changed, props.now)}, ` : ""}
                        <StateDot state={w.state} />
                      </div>
                    </div>
                    {props.canEdit && (
                      <Button appearance="subtle" size="small" icon={<DismissRegular />} aria-label={`Remove work item ${w.id}`} disabled={locked} onClick={() => props.onRemoveWorkItem?.(w.id)} />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "files" && (
        <div className={s.panel} role="list" aria-label="Changed files">
          {pull.files.length === 0 && <div className={s.empty}>No changed files</div>}
          {pull.files.map((f) => (
            <div key={f.path} className={s.file} role="listitem">
              <span role="img" aria-label={CHANGE_LABEL[f.change]} title={CHANGE_LABEL[f.change]} style={{ display: "inline-flex", fontSize: 18 }}>
                {FILE_ICON[f.change]}
              </span>
              <span className={s.filePath} title={f.path}>
                <bdi>{f.path}</bdi>
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "updates" && (
        <div className={s.panel} role="list" aria-label="Updates">
          {props.updates.length === 0 && <div className={s.empty}>No updates</div>}
          {props.updates.map((u) => (
            <div key={u.id} className={s.file} role="listitem">
              <strong>{`Update ${u.id}`}</strong>
              <span style={{ flex: 1, minWidth: 0 }}>{u.description || "Pushed new commits"}</span>
              <span className={s.help}>{`${u.author?.name ?? ""} ${u.date ? agoLabel(u.date, props.now) : ""}`}</span>
              {u.commit && <code className={s.help}>{u.commit.slice(0, 8)}</code>}
            </div>
          ))}
        </div>
      )}

      {tab === "commits" && (
        <div className={s.panel} role="list" aria-label="Commits">
          {props.commits.length === 0 && <div className={s.empty}>No commits</div>}
          {props.commits.map((c) => (
            <div key={c.id} className={s.file} role="listitem">
              <code className={s.help}>{c.id.slice(0, 8)}</code>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.message}</span>
              <span className={s.help}>{`${c.author?.name ?? ""} ${c.date ? agoLabel(c.date, props.now) : ""}`}</span>
            </div>
          ))}
        </div>
      )}

      {props.error && (
        <MessageBar intent="error">
          <MessageBarBody>{props.error}</MessageBarBody>
        </MessageBar>
      )}
      {props.saved && (
        <MessageBar intent="success">
          <MessageBarBody>{props.saved}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}

// ---- new pull request (review before create) ------------------------------------------------------------

export interface PullFormValues {
  repositoryId: string;
  source: string;
  target: string;
  title: string;
  description: string;
  isDraft: boolean;
  workItems: string;
  /** Tags (labels), separated by commas. */
  labels: string;
}

export interface PullFormProps {
  repos: Repo[];
  branches: string[];
  initial?: Partial<PullFormValues>;
  busy?: boolean;
  error?: string | null;
  onRepo?: (repositoryId: string) => void;
  /** Starts the create (the Create button); the host then asks the user to approve it. */
  onSave?: (values: PullFormValues) => void;
  onCancel?: () => void;
}

export function PullForm(props: PullFormProps): ReactElement {
  const s = useStyles();
  const defaultTarget = props.branches.includes("main") ? "main" : props.branches.includes("master") ? "master" : (props.branches[0] ?? "");
  const [v, setV] = useState<PullFormValues>(
    withDefaults(
      {
        repositoryId: props.repos[0]?.id ?? "",
        source: "",
        target: defaultTarget,
        title: "",
        description: "",
        isDraft: false,
        workItems: "",
        labels: "",
      },
      props.initial
    )
  );
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof PullFormValues>(k: K, value: PullFormValues[K]): void => setV((p) => ({ ...p, [k]: value }));
  const missing = touched && (v.title.trim() === "" || v.source === "" || v.target === "" || v.source === v.target);
  const onSaveClick = (): void => {
    setTouched(true);
    if (v.title.trim() === "" || v.source === "" || v.target === "" || v.source === v.target) return;
    props.onSave?.({ ...v, title: v.title.trim() });
  };
  return (
    <div className={s.form}>
      <div style={{ fontSize: tokens.fontSizeBase200, fontWeight: 600, letterSpacing: "0.04em", display: "flex", gap: 6, alignItems: "center" }}>
        <BranchRequestFilled color={STATUS_COLOR.Active} />
        <span>NEW PULL REQUEST *</span>
      </div>
      <div className={s.grid2}>
        <Field label="Repository">
          <Select
            value={v.repositoryId}
            disabled={props.busy}
            onChange={(_, d) => {
              set("repositoryId", d.value);
              props.onRepo?.(d.value);
            }}>
            {props.repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <span />
        <Field label="Source branch" validationState={touched && v.source === "" ? "error" : "none"} validationMessage={touched && v.source === "" ? "Choose the branch with your changes" : undefined}>
          <Select value={v.source} disabled={props.busy} onChange={(_, d) => set("source", d.value)}>
            <option value="" />
            {props.branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Target branch"
          validationState={touched && v.source !== "" && v.source === v.target ? "error" : "none"}
          validationMessage={touched && v.source !== "" && v.source === v.target ? "Source and target must differ" : undefined}>
          <Select value={v.target} disabled={props.busy} onChange={(_, d) => set("target", d.value)}>
            {props.branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="Title"
        required
        validationState={touched && v.title.trim() === "" ? "error" : "none"}
        validationMessage={touched && v.title.trim() === "" ? "Field 'Title' cannot be empty." : undefined}>
        <Input size="large" value={v.title} disabled={props.busy} onChange={(_, d) => set("title", d.value)} />
      </Field>
      <Field label="Description">
        <Textarea rows={4} resize="vertical" value={v.description} disabled={props.busy} onChange={(_, d) => set("description", d.value)} />
      </Field>
      {v.description.trim() !== "" && (
        <div aria-label="Description preview">
          <div className={s.help}>Preview</div>
          <RichHtml html={descriptionToHtml(v.description)} />
        </div>
      )}
      <div className={s.grid2}>
        <Field label="Work items (ids, separated by spaces)">
          <Input placeholder="Optional" value={v.workItems} disabled={props.busy} onChange={(_, d) => set("workItems", d.value)} />
        </Field>
        <Field label="Tags (separated by commas)">
          <Input placeholder="Optional" value={v.labels} disabled={props.busy} onChange={(_, d) => set("labels", d.value)} />
        </Field>
        <Checkbox label="Create as draft" checked={v.isDraft} disabled={props.busy} onChange={(_, d) => set("isDraft", Boolean(d.checked))} />
      </div>
      <div className={s.help}>Nothing is created until you press Create. The host then asks you to approve it.</div>
      {(props.error || missing) && props.error && (
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
          <Button appearance="primary" disabled={props.busy} onClick={onSaveClick}>
            Create
          </Button>
        </span>
      </div>
    </div>
  );
}
