# Transfer manifest: Azure DevOps server with HTTP sign-in and views

What to copy to move this work into another checkout, what to configure, and the tool policy the chat host needs before any tool is enabled. Kept up to date with each phase.

## Files added (all additive; upstream files are touched only where listed below)

| Path                                                                            | Purpose                                                                                                                          |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/http/*.ts`                                                                 | Streamable HTTP transport, Entra sign-in proxy (authorize, token, register), per-request user context. See `docs/http-oauth.md`. |
| `src/views/server.ts`                                                           | Server side of the views: `ui://` resources, tool linking, the two support tools, the backlog read/write split.                  |
| `src/views/web/**`                                                              | Browser code of the views (React, Fluent UI v9). Not part of the Node build; bundled by `bin/generate-views.mjs`.                |
| `bin/generate-views.mjs`, `bin/measure-views.mjs`                               | Bundle generator (writes the git-ignored `src/generated/views-bundle.ts`) and the parity measure script.                         |
| `preview/*`                                                                     | Local preview host on 127.0.0.1:6281 with fixtures (`npm run preview:views`). Not in the runtime path.                           |
| `test/src/http/*`, `test/src/views/*`, `test/src/tools/fork-extensions.test.ts` | Tests.                                                                                                                           |
| `docs/http-oauth.md`, `docs/interactive-views.md`, `docs/TRANSFER.md`           | Docs.                                                                                                                            |

Upstream files with small edits: `src/index.ts` (`--http`, `ADO_MCP_ORG`), `src/shared/elicitations.ts` (a switch that turns elicitation off in HTTP mode), `src/tools/work.ts` (`work_iteration_write` action `update`: set dates or rename an iteration), `src/tools/work-items.ts` (`wit_work_item_write` create accepts `parentId`, so type, fields, iteration, area and the parent link go in one call), `eslint.config.mjs` (no Microsoft header on our directories), `tsconfig.json` (excludes `src/views/web`), `jest.config.cjs` (tsx), `package.json` (scripts, view dependencies), `.gitignore`.

## Environment

See `docs/http-oauth.md` for the full table. Required: `ADO_MCP_CLIENT_ID`, `ADO_MCP_TENANT_ID`. Optional: `ADO_MCP_CLIENT_SECRET`, `ADO_MCP_ORG`, `ADO_MCP_ALLOWED_REDIRECT_URIS`, `ADO_MCP_PROJECT` (default `Dev`), `ADO_MCP_TEAM` (default `Dev Team`), `ADO_MCP_PUBLIC_URL`, `ADO_MCP_CORS_ORIGIN`. The project and team also pre-select the views and are passed to every tool call the views make.

## Chat config block

```yaml
mcpServers:
  ado:
    type: streamable-http
    url: http://localhost:3001/mcp
    requiresOAuth: true
```

Start: `node dist/index.js gaavi --http 127.0.0.1:3001 -d core work work-items repositories pipelines test-plans`

## Tool policy

Classes: **read** (no data change), **write** (create, update, move, delete, send; approval card required), **deny** (not exposed). The policy column is the recommendation for `endpoints.agents.toolApproval` (key form `<tool>_mcp_ado`). Upstream groups operations behind an `action` parameter; the host gates per tool, so every write operation lives on a separate `_write` tool. No tool mixes read and write actions (the one that did, `wit_backlog`, is split: see the notes).

The 45 tools exposed with the suggested domain filter (37 upstream plus eight added for the views: `core_get_current_user`, `wit_backlog_write`, `wit_work_item_form`, `wit_board`, `work_sprint`, `testplan_test_case_form`, `repo_pull_request_form`, `pipelines_run_form`):

### core (read)

| Tool                            | Class | Policy | What it changes                                        |
| ------------------------------- | ----- | ------ | ------------------------------------------------------ |
| `core_list_projects`            | read  | allow  | nothing                                                |
| `core_list_project_teams`       | read  | allow  | nothing                                                |
| `core_get_identity_ids`         | read  | allow  | nothing                                                |
| `core_get_current_user` (added) | read  | allow  | nothing. The signed-in user, for avatars in the views. |

### work (iterations, capacity)

| Tool                   | Class | Policy  | What it changes                                                                                                                                                |
| ---------------------- | ----- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work`                 | read  | allow   | nothing. Actions: `list_iterations`, `list_team_iterations`, `get_team_settings`, `get_team_capacity`, `get_iteration_capacities`. Opens the Sprint view.      |
| `work_sprint` (added)  | read  | allow   | nothing. Sprint of a team: opens the sprint view and answers with a text summary (dates, totals, tasks per issue). Defaults to the current sprint.             |
| `work_iteration_write` | write | **ask** | Actions `create` (new iteration), `assign` (assign an iteration to a team), `update` (dates or name of an existing iteration; used by the view's "Set dates"). |
| `work_capacity_write`  | write | **ask** | Action `update`: a team member's capacity for an iteration.                                                                                                    |

### work items

| Tool                              | Class | Policy  | What it changes                                                                                                                                                                       |
| --------------------------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wit_work_item`                   | read  | allow   | nothing. Actions: `get`, `get_batch`, `list_comments`, `my`, `list_revisions`, `list_for_iteration`, `get_type`.                                                                      |
| `wit_query`                       | read  | allow   | nothing. Actions: `get`, `get_results`, `wiql`.                                                                                                                                       |
| `wit_backlog`                     | read  | allow   | nothing. Actions: `list`, `list_work_items`. Action `reorder` is refused on this tool (it answers "use wit_backlog_write"). Opens the Board view.                                     |
| `wit_board` (added)               | read  | allow   | nothing. Board or backlog of a team: opens the board view and answers with a text summary (columns with counts and cards).                                                            |
| `wit_board` (added)               | read  | allow   | nothing. Board or backlog of a team: opens the board view and answers with a text summary (columns with counts and cards).                                                            |
| `wit_backlog_write` (added)       | write | **ask** | Action `reorder`: moves work items to a new position in the backlog or an iteration.                                                                                                  |
| `wit_work_item_form` (added)      | read  | allow   | nothing. Opens the new work item form pre-filled; creates nothing. The create happens only when the user presses Save, as `wit_work_item_write` create, which is approved separately. |
| `wit_work_item_write`             | write | **ask** | Actions `create` (new work item, optionally under a parent), `update` (fields, state, links via patch), `update_batch`, `add_child`.                                                  |
| `wit_work_item_comment_write`     | write | **ask** | Actions `add`, `update`: comments on a work item.                                                                                                                                     |
| `wit_work_item_link_write`        | write | **ask** | Actions `link`, `unlink`, `link_to_pull_request`, `add_artifact_link`: relations between items, pull requests, commits, builds.                                                       |
| `wit_work_item_attachment`        | read  | allow   | nothing in Azure DevOps. Over HTTP `savePath` is refused (server-local file writes are not reachable from the network); the content comes back inline.                                |
| `wit_work_item_attachment_upload` | write | **ask** | Uploads a new attachment (not yet linked).                                                                                                                                            |
| `wit_work_item_attachment_link`   | write | **ask** | Links an uploaded attachment to a work item.                                                                                                                                          |

### test plans

| Tool                                       | Class | Policy  | What it changes                                                                                                                                                                       |
| ------------------------------------------ | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testplan`                                 | read  | allow   | nothing. Actions: `list_plans`, `list_suites`, `list_cases`.                                                                                                                          |
| `testplan_show_test_results_from_build_id` | read  | allow   | nothing.                                                                                                                                                                              |
| `testplan_test_case_form` (added)          | read  | allow   | nothing. Opens the new test case form pre-filled (title, steps, priority, area, iteration, suite); creates nothing. Create is `testplan_test_case_write` create, approved separately. |
| `testplan_test_plan_write`                 | write | **ask** | Action `create`: a test plan.                                                                                                                                                         |
| `testplan_test_suite_write`                | write | **ask** | Actions `create` (suite), `add_test_cases` (adds existing cases to a suite).                                                                                                          |
| `testplan_test_case_write`                 | write | **ask** | Actions `create` (test case work item), `update_steps` (steps of an existing case).                                                                                                   |

### repositories

| Tool                             | Class | Policy  | What it changes                                                                                                                                                                                                                                                                          |
| -------------------------------- | ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repo_repository`                | read  | allow   | nothing. Actions: `get`, `list`.                                                                                                                                                                                                                                                         |
| `repo_pull_request`              | read  | allow   | nothing. Actions: `get`, `list`, `list_by_commits`, `list_iterations` (Updates tab), `list_commits` (Commits tab).                                                                                                                                                                       |
| `repo_pull_request_org`          | read  | allow   | nothing. Your active pull requests across the organization.                                                                                                                                                                                                                              |
| `repo_pull_request_thread`       | read  | allow   | nothing. Actions: `list`, `list_comments`.                                                                                                                                                                                                                                               |
| `repo_branch`                    | read  | allow   | nothing. Actions: `get`, `list`, `list_mine`.                                                                                                                                                                                                                                            |
| `repo_file`                      | read  | allow   | nothing. Actions: `get_content`, `list_directory`.                                                                                                                                                                                                                                       |
| `repo_search_commits`            | read  | allow   | nothing.                                                                                                                                                                                                                                                                                 |
| `repo_pull_request_form` (added) | read  | allow   | nothing. Opens the new pull request form pre-filled (repository, branches, title, description, draft, work items); creates nothing. Create is `repo_pull_request_write` create, approved separately.                                                                                     |
| `repo_pull_request_write`        | write | **ask** | Actions `create` and `complete` (both need a review token from the view: the Complete dialog with merge type, delete source branch and complete work items is the review), `update` (title, description, abandon, labels; autocomplete), `update_reviewers` (with `isRequired`), `vote`. |
| `repo_pull_request_thread_write` | write | **ask** | Actions `create`, `reply`, `update`, `update_status`: pull request comments.                                                                                                                                                                                                             |
| `repo_create_branch`             | write | **ask** | Creates a branch.                                                                                                                                                                                                                                                                        |
| `repo_file_write`                | write | **ask** | Actions `create`, `update`: commits a text file to a branch.                                                                                                                                                                                                                             |

### pipelines

| Tool                         | Class | Policy  | What it changes                                                                                                                                                                                                                                   |
| ---------------------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipelines_build`            | read  | allow   | nothing. Actions: `list`, `get_status`, `get_changes`, `get_timeline` (stages, jobs, issues and log ids).                                                                                                                                         |
| `pipelines_build_log`        | read  | allow   | nothing. Actions: `list`, `get_content`.                                                                                                                                                                                                          |
| `pipelines_definition`       | read  | allow   | nothing. Actions: `list`, `list_revisions`.                                                                                                                                                                                                       |
| `pipelines_run`              | read  | allow   | nothing. Actions: `get`, `list` only (it has no action that starts a run; starting one is `pipelines_write` `run_pipeline`, listed below). Put `pipelines_run_mcp_ado` in the host's allow list.                                                  |
| `pipelines_artifact`         | read  | allow   | nothing in Azure DevOps. Actions: `list`, `download`. Upstream annotates it as destructive because `download` can save a file on the server; over HTTP `destinationPath` is refused and the content comes back inline. Read class with this note. |
| `pipelines_run_form` (added) | read  | allow   | nothing. Opens the run pipeline form pre-filled (pipeline, branch, variables); starts nothing. Starting is `pipelines_write` run_pipeline, approved in the host, and needs the form's review token.                                               |
| `pipelines_write`            | write | **ask** | Actions `run_pipeline` (queues a run; needs the review token from the form, so a model cannot start one directly), `create_pipeline`, `rename_pipeline`, `update_build_stage` (cancel, retry or run a stage).                                     |

### Recommended rules

```yaml
allow:
  [
    core_*_mcp_ado,
    work_mcp_ado,
    wit_work_item_mcp_ado,
    wit_query_mcp_ado,
    wit_backlog_mcp_ado,
    wit_work_item_form_mcp_ado,
    wit_work_item_attachment_mcp_ado,
    testplan_mcp_ado,
    testplan_show_test_results_from_build_id_mcp_ado,
    repo_repository_mcp_ado,
    repo_pull_request_mcp_ado,
    repo_pull_request_org_mcp_ado,
    repo_pull_request_thread_mcp_ado,
    repo_branch_mcp_ado,
    repo_file_mcp_ado,
    repo_search_commits_mcp_ado,
    pipelines_build_mcp_ado,
    pipelines_build_log_mcp_ado,
    pipelines_definition_mcp_ado,
    pipelines_run_mcp_ado,
    pipelines_artifact_mcp_ado,
  ]
ask:
  [
    work_iteration_write_mcp_ado,
    work_capacity_write_mcp_ado,
    wit_backlog_write_mcp_ado,
    wit_work_item_write_mcp_ado,
    wit_work_item_comment_write_mcp_ado,
    wit_work_item_link_write_mcp_ado,
    wit_work_item_attachment_upload_mcp_ado,
    wit_work_item_attachment_link_mcp_ado,
    testplan_test_plan_write_mcp_ado,
    testplan_test_suite_write_mcp_ado,
    testplan_test_case_write_mcp_ado,
    repo_pull_request_write_mcp_ado,
    repo_pull_request_thread_write_mcp_ado,
    repo_create_branch_mcp_ado,
    repo_file_write_mcp_ado,
    pipelines_write_mcp_ado,
  ]
```

### Review before create or save (enforced over HTTP)

A model cannot create or change work directly. Over `--http`, these calls refuse to run unless they carry a **review token** (`reviewToken`, 16 hex characters) that only a view's own button can make:

- **Bound to the change:** the token is an HMAC over the tool name and the canonical JSON of the arguments that matter (listed per tool in `src/views/web/lib/review.ts`). A token for one change is rejected for another.
- **Bound to the user and one view document:** the per-view key is derived on the server from a secret, the signed-in user and a per-document nonce, and is put into that view document only. The model never sees the document, and the refusal never names the token.
- **Expires:** `ADO_MCP_REVIEW_TTL_MINUTES` after the document was read (default 30). An expired view must be opened again.
- **Single use:** once a write with a token succeeded the same token is refused (a failed write can be retried). The spent list is per process; with several replicas a token can be replayed once per replica until it expires.
- **Key:** `ADO_MCP_CONFIRM_SECRET` (the same on every replica) or a random per-process key, with a one-line warning at start. The Entra client secret is never used for this.

The host's approval card still applies on top.

| Tool, actions                                                          | Without the view's token                                                                                                  | Where the user does it                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `wit_work_item_write`: `create`, `update`, `update_batch`, `add_child` | "Nothing was changed ... call wit_work_item_form with the proposed fields ... or open it with wit_work_item (action get)" | `wit_work_item_form` (pre-filled review form, Save creates), the work item view (Save), the board (Move to / drop, inline New item) |
| `work_iteration_write`: `create`, `update`                             | "Nothing was changed ... open the sprint view with work_sprint ..."                                                       | Sprint view: Set dates; Backlog Planning pane: New Sprint                                                                           |

`wit_work_item_form` accepts the proposal (type, title, description as HTML or Markdown, acceptanceCriteria, parentId, iterationPath, areaPath, assignedTo, tags, priority, effort) and opens the form pre-filled: the description is shown rendered and editable, the user edits, and Create sends the one write call with the edited fields and the token. Other write tools (comments, links, reorder, `testplan_test_suite_write` add_test_cases, pipelines, repos) are gated by the host card only; pull request and pipeline writes join this table with their phases.

## What the views call

Reads run without a prompt. Writes are made only from explicit controls and are app-initiated calls, so the host's approval card applies. A test (`test/src/views/views-write-gating.test.ts`) enumerates the view sources and fails if a write tool is named outside the API layer or a write method is called anywhere but inside a handler named `on...` that runs through `useWrite().run` (never in an effect or a loader).

| View               | Reads (tool, action)                                                                                                                       | Writes (tool, action) and the control that starts it                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board / Backlog    | `wit_backlog` list; `wit_query` wiql; `wit_work_item` get_batch, get_type; `work` list_team_iterations; `wit_work_item` list_for_iteration | `wit_work_item_write` update: the "Move to ..." menu item or dropping a card on a column. `wit_work_item_write` create: Enter in the inline "New item" box, or Save in the new work item form. |
| Sprint             | same as above                                                                                                                              | `work_iteration_write` update: Save next to the date fields after "Set dates". `wit_work_item_write` create: "New Work Item" opens the form; Save creates.                                     |
| New work item form | `wit_backlog` list, `wit_work_item` get_type, `work` list_team_iterations, `wit_query` wiql (parent choices)                               | `wit_work_item_write` create (fields, iteration, area, parent in one call): the Save button only. Opened by `wit_work_item_form`, which creates nothing.                                       |

Pipelines: reads `pipelines_definition` list (with latest builds), `pipelines_build` list, get_changes, get_timeline, `pipelines_build_log` get_content, `repo_repository`, `repo_branch` (run form). Write: `pipelines_write` run_pipeline from the Run button of the form only (opened by `pipelines_run_form`, or by "Run pipeline" / "Run new" in the view); "Edit", "New pipeline", "Rerun failed jobs", "Parameters" and the changes and documentation links open the web UI.

Not yet wired to a view (later phases will add rows here): `wit_backlog_write` reorder, links.

### No elicitation over HTTP

The chat host's app bridge cannot answer elicitation requests, so in `--http` mode elicitation is switched off for the whole process. A tool call without a project or team uses `ADO_MCP_PROJECT` / `ADO_MCP_TEAM` (the team defaults to `<project> Team`), then the only project or the project's `<project> Team`, and otherwise answers with a plain error naming the choices. A test fails if any path calls the client. Every view call also names the project and team from the server defaults, never from the model's arguments.
