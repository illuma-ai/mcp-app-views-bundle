/** Pull request shapes and helpers for the Repos views. Pure: no DOM, no host calls. */
import { toPerson, type Person } from "./work-items";

/** The vote a reviewer can cast, with the number Azure DevOps stores and the label its web UI uses. */
export const VOTES = [
  { name: "Approved", value: 10, label: "Approve" },
  { name: "ApprovedWithSuggestions", value: 5, label: "Approve with suggestions" },
  { name: "WaitingForAuthor", value: -5, label: "Wait for author" },
  { name: "Rejected", value: -10, label: "Reject" },
  { name: "NoVote", value: 0, label: "Reset feedback" },
] as const;

export type VoteName = (typeof VOTES)[number]["name"];

/** The label of a stored vote ("No vote" for 0). */
export function voteLabel(value: number | undefined): string {
  if (value === undefined || value === 0) return "No vote";
  return VOTES.find((v) => v.value === value)?.label ?? `Vote ${value}`;
}

export type PullStatus = "Active" | "Completed" | "Abandoned" | "Draft";

export interface Reviewer {
  id?: string;
  person: Person;
  vote: number;
  isRequired: boolean;
}

export interface PullSummary {
  id: number;
  title: string;
  repository?: string;
  repositoryId?: string;
  projectId?: string;
  project?: string;
  status: PullStatus;
  author?: Person;
  created?: string;
  source: string;
  target: string;
  reviewers: Reviewer[];
  /** Human comments across the threads (read for the list). */
  commentCount?: number;
}

/** "refs/heads/feature/x" as "feature/x". */
export function branchName(ref: string | undefined): string {
  return (ref ?? "").replace(/^refs\/heads\//, "");
}

function statusOf(raw: Record<string, unknown>): PullStatus {
  if (raw.isDraft === true && (raw.statusName === "Active" || raw.status === "active" || raw.status === 1)) return "Draft";
  const name = typeof raw.statusName === "string" ? raw.statusName : typeof raw.status === "string" ? raw.status : raw.status === 3 ? "completed" : raw.status === 2 ? "abandoned" : "active";
  const lower = name.toLowerCase();
  return lower === "completed" ? "Completed" : lower === "abandoned" ? "Abandoned" : "Active";
}

export function toReviewers(raw: unknown): Reviewer[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[]).map((r) => ({
    id: typeof r.id === "string" ? r.id : undefined,
    person: toPerson({ displayName: r.displayName, uniqueName: r.uniqueName }) ?? { name: "Unknown" },
    vote: typeof r.vote === "number" ? r.vote : 0,
    isRequired: r.isRequired === true,
  }));
}

/** One pull request from the list result (trimmed) or from a full get. */
export function toPullSummary(raw: Record<string, unknown>): PullSummary {
  const repo = raw.repository as { name?: string; id?: string; project?: { name?: string; id?: string } } | string | undefined;
  return {
    id: Number(raw.pullRequestId),
    title: String(raw.title ?? ""),
    repository: typeof repo === "string" ? repo : repo?.name,
    repositoryId: typeof repo === "object" ? repo?.id : typeof raw.repositoryId === "string" ? raw.repositoryId : undefined,
    projectId: typeof repo === "object" ? repo?.project?.id : undefined,
    project: typeof raw.project === "string" ? raw.project : typeof repo === "object" ? repo?.project?.name : undefined,
    status: statusOf(raw),
    author: toPerson(raw.createdBy),
    created: typeof raw.creationDate === "string" ? raw.creationDate : undefined,
    source: branchName(raw.sourceRefName as string | undefined),
    target: branchName(raw.targetRefName as string | undefined),
    reviewers: toReviewers(raw.reviewers),
  };
}

export function toPullSummaries(raw: unknown): PullSummary[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[]).filter((p) => p && p.pullRequestId !== undefined).map(toPullSummary);
}

export interface ChangedFile {
  path: string;
  change: "add" | "edit" | "delete" | "rename" | "other";
}

const CHANGE_BY_NUMBER: Record<number, ChangedFile["change"]> = { 1: "add", 2: "edit", 8: "rename", 16: "delete" };

/** Changed files from a get with includeChangedFiles. */
export function toChangedFiles(raw: Record<string, unknown>): ChangedFile[] {
  const entries = ((raw.changedFilesSummary as { changeEntries?: unknown[] } | undefined)?.changeEntries ?? []) as { changeType?: unknown; item?: { path?: string } }[];
  return entries
    .filter((e) => e?.item?.path)
    .map((e) => {
      const t = e.changeType;
      const change =
        typeof t === "number"
          ? (CHANGE_BY_NUMBER[t] ?? "other")
          : typeof t === "string"
            ? ((["add", "edit", "delete", "rename"].find((k) => t.toLowerCase().includes(k)) as ChangedFile["change"] | undefined) ?? "other")
            : "other";
      return { path: e.item?.path as string, change };
    });
}

export interface PullDetail extends PullSummary {
  description: string;
  mergeStatus?: string;
  labels: string[];
  files: ChangedFile[];
  workItemIds: number[];
}

/** A pull request from `get` (full response, optionally with labels and changed files). */
export function toPullDetail(raw: Record<string, unknown>): PullDetail {
  return {
    ...toPullSummary(raw),
    description: typeof raw.description === "string" ? raw.description : "",
    mergeStatus: typeof raw.mergeStatus === "string" ? raw.mergeStatus : undefined,
    labels: ((raw.labelSummary as { labels?: string[] } | undefined)?.labels ?? []).filter(Boolean),
    files: toChangedFiles(raw),
    workItemIds: ((raw.workItemRefs as { id?: string | number }[] | undefined) ?? []).map((w) => Number(w.id)).filter((n) => Number.isFinite(n)),
  };
}

export interface ThreadComment {
  id: number;
  author?: Person;
  content: string;
  date?: string;
}

export interface Thread {
  id: number;
  status: string;
  comments: ThreadComment[];
  filePath?: string;
  line?: number;
}

/** Comment threads from the thread list result; threads without a human comment (system events) are dropped. */
export function toThreads(raw: unknown): Thread[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[])
    .map((t) => {
      const ctx = t.threadContext as { filePath?: string; rightFileStart?: { line?: number } } | undefined;
      return {
        id: Number(t.id),
        status: typeof t.status === "string" ? t.status : t.status === 1 ? "Active" : t.status === 2 ? "Fixed" : "Active",
        filePath: ctx?.filePath,
        line: ctx?.rightFileStart?.line,
        comments: ((t.comments as Record<string, unknown>[] | undefined) ?? [])
          .filter((c) => typeof c.content === "string" && c.content !== "")
          .map((c) => ({ id: Number(c.id), author: toPerson(c.author), content: c.content as string, date: typeof c.publishedDate === "string" ? c.publishedDate : undefined })),
      };
    })
    .filter((t) => t.comments.length > 0);
}

export interface Repo {
  id: string;
  name: string;
}

export function toRepos(raw: unknown): Repo[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[])
    .filter((r) => typeof r.id === "string" && typeof r.name === "string" && r.isDisabled !== true)
    .map((r) => ({ id: r.id as string, name: r.name as string }));
}

/** Branch names from the branch list result (already without "refs/heads/"). */
export function toBranches(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : []).filter((b): b is string => typeof b === "string");
}

/** Whether a thread is still open for discussion (Active or Pending). */
export function isOpenThread(status: string): boolean {
  return status === "Active" || status === "Pending";
}

/** Counts for the list header: how many reviewers approved / rejected / still to vote. */
export function voteSummary(reviewers: Reviewer[]): { approved: number; rejected: number; waiting: number; none: number } {
  return {
    approved: reviewers.filter((r) => r.vote >= 5).length,
    rejected: reviewers.filter((r) => r.vote === -10).length,
    waiting: reviewers.filter((r) => r.vote === -5).length,
    none: reviewers.filter((r) => r.vote === 0).length,
  };
}

// ---- merge, updates, commits, completion --------------------------------------------------------

export interface MergeBanner {
  tone: "ok" | "conflict" | "checking";
  title: string;
}

/** The merge banner under the tabs: no conflicts, conflicts, or still checking. */
export function mergeBanner(status: string | undefined): MergeBanner {
  const s = (status ?? "").toLowerCase();
  if (s === "succeeded") return { tone: "ok", title: "No merge conflicts" };
  if (s === "conflicts") return { tone: "conflict", title: "Merge conflicts" };
  if (s === "rejectedbypolicy") return { tone: "conflict", title: "Merge rejected by policy" };
  if (s === "failure") return { tone: "conflict", title: "Merge failed" };
  return { tone: "checking", title: "Checking for merge conflicts" };
}

export interface PullUpdate {
  id: number;
  description: string;
  date?: string;
  author?: Person;
  commit?: string;
}

/** The updates (iterations) of a pull request, newest first. */
export function toUpdates(raw: unknown): PullUpdate[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[])
    .map((i) => ({
      id: Number(i.id),
      description: typeof i.description === "string" ? i.description : "",
      date: typeof i.createdDate === "string" ? i.createdDate : undefined,
      author: toPerson(i.author),
      commit: typeof i.sourceCommit === "string" ? i.sourceCommit : undefined,
    }))
    .sort((a, b) => b.id - a.id);
}

export interface PullCommit {
  id: string;
  message: string;
  author?: Person;
  date?: string;
}

export function toCommits(raw: unknown): PullCommit[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[])
    .filter((c) => typeof c.commitId === "string")
    .map((c) => {
      const a = c.author as { name?: string; email?: string; date?: string } | undefined;
      return { id: c.commitId as string, message: String(c.comment ?? "").split("\n")[0], author: a?.name ? { name: a.name, email: a.email } : undefined, date: a?.date };
    });
}

/** The merge types of the completion dialog, with the names the tool takes. */
export const MERGE_TYPES = [
  { value: "NoFastForward", label: "Merge (no fast-forward)" },
  { value: "Squash", label: "Squash commit" },
  { value: "Rebase", label: "Rebase and fast-forward" },
  { value: "RebaseMerge", label: "Semi-linear merge" },
] as const;

export type MergeType = (typeof MERGE_TYPES)[number]["value"];

export interface CompletionOptions {
  mergeStrategy: MergeType;
  deleteSourceBranch: boolean;
  transitionWorkItems: boolean;
  mergeCommitMessage: string;
}

/** The default text of the merge commit: "Merged PR 1: title" and the description, as the web dialog suggests. */
export function defaultMergeMessage(id: number, title: string, description: string): string {
  return `Merged PR ${id}: ${title}${description.trim() ? `\n\n${description.trim()}` : ""}`;
}

export interface FeedItem {
  key: string;
  kind: "created" | "thread";
  author?: Person;
  date?: string;
  thread?: Thread;
}

/** The activity feed: the creation event, then the comment threads in the order they were started. */
export function buildFeed(pull: { id: number; author?: Person; created?: string }, threads: Thread[]): FeedItem[] {
  const items: FeedItem[] = [{ key: "created", kind: "created", author: pull.author, date: pull.created }];
  for (const t of threads) items.push({ key: `t${t.id}`, kind: "thread", author: t.comments[0]?.author, date: t.comments[0]?.date, thread: t });
  return items;
}
