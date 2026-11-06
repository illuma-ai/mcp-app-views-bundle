/**
 * The Repos screens: containers that load pull requests, their reviewers, threads and changed files
 * through the host. Reads happen in loaders; every write starts from a handler named `on...` (a vote,
 * Comment, Reply, Resolve or Create button), runs through `useWrite`, and is approved by the user in
 * the host. A test enforces this.
 */
import type { ReactElement } from "react";
import { useState } from "react";
import { TOOL } from "../lib/api";
import { branchName, toBranches, toCommits, toPullDetail, toPullSummaries, toPullSummary, toRepos, toThreads, toUpdates, type CompletionOptions, type PullSummary, type VoteName } from "../lib/pulls";
import { useLoad } from "./hooks";
import { CreatedPanel } from "./NewItemForm";
import { ErrorBar, Loading, useApi, useWrite } from "./parts";
import { PullDetailView, PullForm, PullList, type LinkedWorkItem, type PullFormValues, type PullTab } from "./PullViews";

export interface PullPrefill {
  repository?: string;
  sourceRefName?: string;
  targetRefName?: string;
  title?: string;
  description?: string;
  isDraft?: boolean;
  workItems?: string;
  labels?: string;
}

/** The proposal the model passes to `repo_pull_request_form`. */
export function pullPrefillFrom(args: Record<string, unknown>): PullPrefill {
  const str = (k: string): string | undefined => (typeof args[k] === "string" ? (args[k] as string) : undefined);
  return {
    repository: str("repository"),
    sourceRefName: str("sourceRefName"),
    targetRefName: str("targetRefName"),
    title: str("title"),
    description: str("description"),
    isDraft: args.isDraft === true,
    workItems: str("workItems"),
    labels: Array.isArray(args.labels) ? (args.labels as unknown[]).filter((l): l is string => typeof l === "string").join(", ") : str("labels"),
  };
}

// ---- one pull request ---------------------------------------------------------------------------

export function PullScreen({ repository, id, onBack }: { repository: string; id: number; onBack?: () => void }): ReactElement {
  const api = useApi();
  const write = useWrite();
  const [saved, setSaved] = useState<string | null>(null);
  const { state, reload } = useLoad(async () => {
    const [raw, threads, updates, commits] = await Promise.all([
      api.pullRequest(repository, id),
      api.threads(repository, id).catch(() => []),
      api.pullUpdates(repository, id).catch(() => []),
      api.pullCommits(repository, id).catch(() => []),
    ]);
    const pull = toPullDetail(raw);
    // Linked work items: read their type, title and state for the right rail.
    const items = await api.batch(pull.workItemIds, ["System.WorkItemType", "System.Title", "System.State", "System.ChangedDate"]).catch(() => []);
    const workItems: LinkedWorkItem[] = items.map((w) => ({
      id: w.id,
      type: String(w.fields["System.WorkItemType"] ?? ""),
      title: String(w.fields["System.Title"] ?? ""),
      state: String(w.fields["System.State"] ?? ""),
      changed: typeof w.fields["System.ChangedDate"] === "string" ? w.fields["System.ChangedDate"] : undefined,
    }));
    return { pull, threads: toThreads(threads), updates: toUpdates(updates), commits: toCommits(commits), workItems, checkedAt: new Date() };
  }, `pr:${repository}:${id}`);

  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorBar>{state.error}</ErrorBar>;

  const onVote = (vote: VoteName): void => {
    write.run(async () => {
      await api.votePullRequest(repository, id, vote);
      setSaved(vote === "NoVote" ? "Feedback reset." : "Vote recorded.");
      reload();
    }, "Could not record the vote");
  };
  const onComment = (text: string, threadId?: number): void => {
    write.run(async () => {
      await api.commentOnPullRequest(repository, id, text, threadId);
      setSaved(threadId === undefined ? "Comment added." : "Reply added.");
      reload();
    }, "Could not add the comment");
  };
  const onThreadStatus = (threadId: number, status: "Fixed" | "Active"): void => {
    write.run(async () => {
      await api.setThreadStatus(repository, id, threadId, status);
      reload();
    }, "Could not change the thread");
  };
  const ids = { projectId: state.data.pull.projectId ?? "", repositoryId: state.data.pull.repositoryId ?? repository, pullRequestId: id };
  const onEditDescription = (text: string): void => {
    write.run(async () => {
      await api.updatePullRequest(repository, id, { description: text });
      setSaved("Description saved.");
      reload();
    }, "Could not save the description");
  };
  const onComplete = (o: CompletionOptions): void => {
    write.run(async () => {
      await api.completePullRequest(repository, id, {
        mergeStrategy: o.mergeStrategy,
        deleteSourceBranch: o.deleteSourceBranch,
        transitionWorkItems: o.transitionWorkItems,
        mergeCommitMessage: o.mergeCommitMessage,
      });
      setSaved("Pull request completed.");
      reload();
    }, "Could not complete the pull request");
  };
  const onAbandon = (): void => {
    write.run(async () => {
      await api.updatePullRequest(repository, id, { status: "Abandoned" });
      setSaved("Pull request abandoned.");
      reload();
    }, "Could not abandon the pull request");
  };
  const onAddReviewer = (rid: string, required: boolean): void => {
    write.run(async () => {
      await api.addReviewer(repository, id, rid, required);
      setSaved("Reviewer added.");
      reload();
    }, "Could not add the reviewer");
  };
  const onRemoveReviewer = (rid: string): void => {
    write.run(async () => {
      await api.removeReviewer(repository, id, rid);
      setSaved("Reviewer removed.");
      reload();
    }, "Could not remove the reviewer");
  };
  const onSetLabels = (labels: string[]): void => {
    write.run(async () => {
      await api.setLabels(repository, id, labels);
      setSaved("Tags saved.");
      reload();
    }, "Could not save the tags");
  };
  const onAddWorkItem = (wid: number): void => {
    write.run(async () => {
      await api.linkWorkItem(wid, ids);
      setSaved("Work item linked.");
      reload();
    }, "Could not link the work item");
  };
  const onRemoveWorkItem = (wid: number): void => {
    write.run(async () => {
      await api.unlinkWorkItem(wid, ids);
      setSaved("Work item unlinked.");
      reload();
    }, "Could not unlink the work item");
  };
  const web = `https://dev.azure.com/${encodeURIComponent(api.config.org)}/${encodeURIComponent(api.config.project)}/_git/${encodeURIComponent(repository)}/pullrequest/${id}`;
  return (
    <PullDetailView
      pull={state.data.pull}
      threads={state.data.threads}
      updates={state.data.updates}
      commits={state.data.commits}
      workItems={state.data.workItems}
      checkedAt={state.data.checkedAt}
      canEdit={api.can(TOOL.prWrite)}
      canVote={api.can(TOOL.prWrite)}
      canComment={api.can(TOOL.prThreadWrite)}
      busy={write.busy}
      error={write.error}
      saved={saved}
      onBack={onBack}
      onVote={onVote}
      onComment={onComment}
      onThreadStatus={onThreadStatus}
      onEditDescription={onEditDescription}
      onComplete={onComplete}
      onAbandon={onAbandon}
      onFindPeople={(f) => api.findPeople(f)}
      onAddReviewer={onAddReviewer}
      onRemoveReviewer={onRemoveReviewer}
      onSetLabels={onSetLabels}
      onAddWorkItem={onAddWorkItem}
      onRemoveWorkItem={onRemoveWorkItem}
      onOpenWeb={() => api.openLink(web)}
      onLink={(url) => api.openLink(url)}
    />
  );
}

// ---- new pull request ---------------------------------------------------------------------------

export function PullFormScreen({ prefill, onClose, onCreated }: { prefill?: PullPrefill; onClose?: () => void; onCreated?: () => void }): ReactElement {
  const api = useApi();
  const write = useWrite();
  const [repoId, setRepoId] = useState<string | undefined>();
  const [created, setCreated] = useState<{ id: number; title: string; repository: string } | null>(null);
  const [openRepo, setOpenRepo] = useState<{ repository: string; id: number } | undefined>();

  const reposLoad = useLoad(async () => toRepos(await api.repositories()), "repos");
  const repos = reposLoad.state.status === "ready" ? reposLoad.state.data : [];
  const wanted = prefill?.repository?.toLowerCase();
  const chosen = repoId ?? repos.find((r) => r.id === prefill?.repository || r.name.toLowerCase() === wanted)?.id ?? repos[0]?.id;
  const branchesLoad = useLoad(async () => (chosen ? toBranches(await api.branches(chosen)) : []), `branches:${chosen ?? ""}`);

  if (openRepo) return <PullScreen repository={openRepo.repository} id={openRepo.id} onBack={() => setOpenRepo(undefined)} />;
  if (reposLoad.state.status === "loading" || branchesLoad.state.status === "loading") return <Loading />;
  if (reposLoad.state.status === "error") return <ErrorBar>{reposLoad.state.error}</ErrorBar>;
  if (branchesLoad.state.status === "error") return <ErrorBar>{branchesLoad.state.error}</ErrorBar>;
  if (created) {
    return (
      <CreatedPanel
        type="Pull request"
        id={created.id}
        title={created.title}
        onOpen={() => setOpenRepo({ repository: created.repository, id: created.id })}
        onAnother={() => setCreated(null)}
        onClose={onClose}
      />
    );
  }

  const onSave = (v: PullFormValues): void => {
    write.run(async () => {
      const pr = await api.createPullRequest({
        repositoryId: v.repositoryId,
        source: v.source,
        target: v.target,
        title: v.title,
        description: v.description,
        isDraft: v.isDraft,
        workItems: v.workItems,
        labels: v.labels
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
      });
      setCreated({ id: Number(pr.pullRequestId), title: v.title, repository: v.repositoryId });
      onCreated?.();
    }, "Could not create the pull request");
  };
  return (
    <PullForm
      key={chosen}
      repos={repos}
      branches={branchesLoad.state.data}
      initial={{
        repositoryId: chosen,
        source: branchName(prefill?.sourceRefName),
        target: prefill?.targetRefName ? branchName(prefill.targetRefName) : undefined,
        title: prefill?.title,
        description: prefill?.description,
        isDraft: prefill?.isDraft,
        workItems: prefill?.workItems,
        labels: prefill?.labels,
      }}
      busy={write.busy}
      error={write.error}
      onRepo={setRepoId}
      onSave={onSave}
      onCancel={onClose}
    />
  );
}

// ---- the list -----------------------------------------------------------------------------------

export function PullRequestsScreen({ open }: { open?: { repository: string; id: number } }): ReactElement {
  const api = useApi();
  const [tab, setTab] = useState<PullTab>("Active");
  const [selected, setSelected] = useState<{ repository: string; id: number } | undefined>(open);
  const [creating, setCreating] = useState(false);

  const { state, reload } = useLoad(async () => {
    const pulls = toPullSummaries(tab === "Mine" ? await api.myPullRequests() : await api.pullRequests(tab));
    // The list result has no reviewers: read them for the first few so votes show in the list.
    return Promise.all(
      pulls.slice(0, 20).map(async (p): Promise<PullSummary> => {
        try {
          const [brief, threads] = await Promise.all([api.pullRequestBrief(p.repository ?? "", p.id), api.threads(p.repository ?? "", p.id).catch(() => [])]);
          return { ...p, reviewers: toPullSummary(brief).reviewers, commentCount: toThreads(threads).reduce((n, t) => n + t.comments.length, 0) };
        } catch {
          return p;
        }
      })
    );
  }, `pulls:${tab}`);

  if (selected) return <PullScreen repository={selected.repository} id={selected.id} onBack={() => (open ? setSelected(undefined) : setSelected(undefined))} />;
  if (creating) {
    return (
      <PullFormScreen
        onClose={() => {
          setCreating(false);
          reload();
        }}
        onCreated={reload}
      />
    );
  }
  return state.status === "error" ? (
    <ErrorBar>{state.error}</ErrorBar>
  ) : (
    <PullList
      pulls={state.status === "ready" ? state.data : []}
      tab={tab}
      loading={state.status === "loading"}
      canCreate={api.can(TOOL.prWrite)}
      onTab={setTab}
      onNew={() => setCreating(true)}
      onOpen={(p) => setSelected({ repository: p.repository ?? "", id: p.id })}
    />
  );
}

/** Routes `repo_pull_request` and its siblings: one pull request when the call named it, the list otherwise. */
export function PullEntry({ args }: { args: Record<string, unknown> }): ReactElement {
  const repository = typeof args.repositoryId === "string" ? args.repositoryId : typeof args.repository === "string" ? args.repository : undefined;
  const id = Number(args.pullRequestId);
  return <PullRequestsScreen open={repository && Number.isFinite(id) && id > 0 ? { repository, id } : undefined} />;
}
