# Interactive views (MCP Apps)

Some tools open a view in the chat instead of only returning text. The views follow the Azure DevOps web UI (layout, density, wording, loading and empty states) and are drawn with Fluent UI React v9 (`@fluentui/react-components` 9.75.1) through `@modelcontextprotocol/ext-apps` 1.7.5.

Tool output is unchanged: a view is linked to a tool only through its definition (`_meta.ui.resourceUri`), and a client that does not render apps receives byte-identical results (tested).

## Phases

| Phase | Views                                                                                                                                                                                                                                                                                                                   | Opened by                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1     | Board (columns per state, inline "New item", move a card), Backlog (hierarchy, planning pane), Sprint (taskboard, sprint backlog, totals, set dates), New work item form (review before create)                                                                                                                         | `wit_board`, `wit_backlog`, `work_sprint`, `work`, `wit_work_item_form`                                 |
| 2     | Work item detail (fields, discussion, history, links, attachments, edits), query results and work item lists                                                                                                                                                                                                            | `wit_work_item`, `wit_query`                                                                            |
| 3     | Test plans (plans, suite tree, test cases, steps, new plan / suite / test case with review), test results of a build                                                                                                                                                                                                    | `testplan`, `testplan_test_case_form`, `testplan_show_test_results_from_build_id`                       |
| 4     | Pull requests (list with status, reviewers and votes; one pull request with Overview, Files, Updates and Commits tabs, merge banner, editable description, activity feed, Approve and Complete menus with the completion options, reviewers (required and optional), tags and work items; new pull request review form) | `repo_pull_request`, `repo_pull_request_org`, `repo_pull_request_thread`, `repo_pull_request_form`      |
| 5     | Pipelines (recent, all and runs lists; one pipeline's runs with Runs, Stages, Branches and Analytics; one run with the summary, errors, stages, jobs and log; run pipeline review form)                                                                                                                                 | `pipelines_definition`, `pipelines_build`, `pipelines_run`, `pipelines_build_log`, `pipelines_run_form` |

Tool descriptions say plainly what they open (for example `wit_backlog`: "Board and backlog of a team (opens the board view)"), and two entry tools, `wit_board` and `work_sprint`, answer with a text summary (columns with counts, sprint totals) so the chat answer is useful even when the client does not render the view.

## How a view works

- The server registers one `ui://ado/<view>.html` resource per view. Each document is self-contained: one inlined script (SDK, React, Fluent), a strict content security policy (no network, frames, remote images or web fonts), and a small JSON block with the organization, project, team and the tool names this server exposes.
- The view renders in a 640px inline frame. Colours come from the Fluent theme (light, dark or high contrast, chosen from the host theme); only the outer frame border and background use the host's style variables.
- The view loads its own data with app-initiated tool calls (reads: no prompt). The tool result that opened it is only a trigger, so the view shows the whole screen whatever action the model used.
- Every result carries a spotlight boundary added by the server; the views strip it before parsing.

## Board interaction

- **Drag a card** with the mouse (pointer events, so it works in the host's sandboxed frame): press, move past a few pixels, a ghost follows the pointer and a placeholder shows in the target column; drop asks the host to approve the state change (`wit_work_item_write` update). On approval the card moves; on rejection it snaps back. Escape cancels a drag.
- **Keyboard:** focus a card, Space or Enter to pick it up, Left and Right to choose a column, Enter to drop, Escape to cancel. The card's "..." menu ("Move to ...") does the same.
- **Filters:** the filter icon opens the filter bar (keyword, Assigned to, Tags, Iteration, Area, Parent, Clear) and the cards filter as you type; the search icon in the first column gives the inline keyword box. The level picker switches Epics and Issues; a column's chevron collapses it to a vertical label.
- **Card:** type icon, bold id and title on one line, the state with its colour dot, and the done/total of the child tasks (one query for the tasks and one batch for their state).

## Layout

Every view lays out at frame widths of 360, 640 and 900px: below 480px the board columns scroll horizontally, tables drop their non-key columns, the backlog planning pane moves under the list and forms go single-column. `npm run measure:views` checks that no view is wider than its frame at those widths and drives the board with real mouse events (drag, approve, reject, filter, collapse).

## Reads and writes

Writes are only reachable from explicit controls and always show the host's approval card with the full arguments:

- Moving a card: the "Move to ..." menu item on a card, or dropping the card on another column. The call is guarded by the revision the view read, so a stale move fails instead of overwriting.
- Creating: Enter in the inline "New item" box (title only), or Save in the new work item form (title, description, assignee, area, iteration, tags, priority, effort and the parent link in one call). The form is the review step: nothing is sent until Save, and the assistant can pre-fill it through `wit_work_item_form`.
- Setting sprint dates: Save next to the date fields.

See `docs/TRANSFER.md` for the full tool policy and the per-view read/write table.

## Build, preview, measure

```bash
npm run generate:views     # bundle the browser code into src/generated/views-bundle.ts (git-ignored; build and test run it)
npm run typecheck:views    # type check src/views/web
npm run preview:views      # http://127.0.0.1:6281 with fixtures, light and dark, writes wait for Approve
npm run measure:views -- --shots <dir>   # computed metrics against the reference captures, plus screenshots
```

The preview fixtures mirror the seeded project (Basic process: 2 epics, 8 issues, 12 tasks across Sprint 1 and Sprint 2); every screen also has an empty scenario (`&scenario=empty`) and a slow one (`&slow=1500`) to see the loading state.

## Test Plans needs the Azure Test Plans licence

In the `gaavi` organization Test Plans is behind the Basic licence: the web UI shows "Unlock the full power of Azure Test Plans". The Test Plans views (plans, suites, cases, steps, results) are therefore verified only against the preview fixtures, not live, until the owner enables the trial. The test results view needs no licence beyond the build's own results.

## Work item fields by process

The forms ask the work item type which fields it has (the type's field list, read with `wit_work_item` get_type) and show only those, so a field the type lacks is never sent. Only the Basic Issue and Task forms were compared with real captures; the Agile, Scrum and Bug rows come from the process templates and are not compared pixel for pixel. "Rendered" means a control in the new item form and the work item view; "not rendered" fields still keep their value (the view just does not show or edit them).

| Process, type               | Fields of the real form (beyond title, state, reason, area, iteration, assigned to, tags)                                              | Rendered                                                                                                             | Not rendered                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Basic: Epic                 | Description, Priority, Effort, Start Date, Target Date                                                                                 | Description, Priority, Effort                                                                                        | Start Date, Target Date                               |
| Basic: Issue                | Description, Priority, Effort                                                                                                          | Description, Priority, Effort                                                                                        | none                                                  |
| Basic: Task                 | Description, Priority, Activity, Remaining Work                                                                                        | Description, Priority, Remaining Work                                                                                | Activity                                              |
| Agile: Epic, Feature        | Description, Priority, Risk, Effort, Business Value, Time Criticality, Value area, Start Date, Target Date                             | Description, Priority, Risk, Effort, Business Value, Value area                                                      | Time Criticality, Start Date, Target Date             |
| Agile: User Story           | Description, Acceptance Criteria, Priority, Risk, Story Points, Value area                                                             | all of them                                                                                                          | none                                                  |
| Agile: Bug                  | Repro Steps, System Info, Acceptance Criteria, Priority, Severity, Story Points, Risk, Value area, Found in build, Integrated in build | Repro Steps (as the main text), System Info, Acceptance Criteria, Priority, Severity, Story Points, Risk, Value area | Found in build, Integrated in build                   |
| Agile: Task                 | Description, Priority, Activity, Original Estimate, Remaining Work, Completed Work                                                     | Description, Priority, Remaining Work                                                                                | Activity, Original Estimate, Completed Work           |
| Scrum: Epic, Feature        | Description, Effort, Business Value, Time Criticality, Value area, Start Date, Target Date                                             | Description, Effort, Business Value, Value area                                                                      | Time Criticality, Start Date, Target Date             |
| Scrum: Product Backlog Item | Description, Acceptance Criteria, Effort, Business Value, Backlog Priority, Value area                                                 | Description, Acceptance Criteria, Effort, Business Value, Value area                                                 | Backlog Priority                                      |
| Scrum: Bug                  | Repro Steps, System Info, Acceptance Criteria, Severity, Effort, Backlog Priority, Found in build, Integrated in build                 | Repro Steps, System Info, Acceptance Criteria, Severity, Effort                                                      | Backlog Priority, Found in build, Integrated in build |
| Scrum: Task                 | Description, Activity, Original Estimate, Remaining Work, Backlog Priority                                                             | Description, Remaining Work                                                                                          | Activity, Original Estimate, Backlog Priority         |

Also on every form: Deployment, Development and Related Work (parent and children) are drawn; Attachments and Links are tabs of the work item view. Risk, Value area and Severity use the process's standard choices (Risk: 1 - High, 2 - Medium, 3 - Low; Value area: Business, Architectural; Severity: 1 - Critical to 4 - Low); a process with customised choices shows the stored value but offers the standard list. When the type's field list cannot be read the forms fall back to the Basic fields (and Story Points for story-like types).

## Wording gaps: Repos and Pipelines

The reference captures in `m365-setup/reference/azure-devops/` cover Boards, work items, the Test Plans licence wall, and pull requests (11, 12; wording in words.md). The pull request list and detail follow them (Mine tab, filter row, "New pull request", "<author> request !1 into main", the "proposes to merge" header line, merge banner, Description card, "Show everything (n)", "Add a comment...", Reviewers/Tags/Work items rail). The Pipelines views follow captures 13 to 15 (list with "Recently run pipelines", the runs table, the run summary with "Individual CI by", Repository and version, Related, Errors and Stages | Jobs). Not reproduced: the Code Coverage tab, the Stages, Branches and Analytics tabs of a pipeline beyond a simple table or summary, favourites and the More actions menus. Stage and job results come from `pipelines_build` get_timeline, an action added to the upstream tool.

Pull requests: the changed files list shows the path and the kind of change (add, edit, delete, rename); there is no inline diff, so file-level comments show their path and line only. Complete and Abandon, description edits, reviewers, tags and work item links are writes that the host asks the user to approve; Complete additionally carries a review token like Create. The vote button always offers Approve (the tools do not say which reviewer the signed-in user is), with the other votes and "Reset feedback" in the menu.

## Known limits

- The work-in-progress limit on the Doing column is the process default (5); no tool returns the team's setting.
- Capacity and Analytics tabs open the Azure DevOps page through the host.
- Burndown by day needs work item history; the sprint shows totals (tasks done, remaining work, effort).
- Dragging to reorder a backlog is not drawn yet; `wit_backlog_write` exists for it.

## Playbook for the next area

`.claude/skills/mcp-app-views/` (SKILL.md and references/) is the playbook for adding views to another area or another server: reference capture, measured spec, shared Fluent kit, review-before-write, tool policy register, host approval flag, live verification and the gate. Start there.

## Brand neutrality check

`npm run check-names` (also run by jest in `test/src/repo-names.test.ts`) fails when the chat host product name appears anywhere in the repo outside node_modules, dist, coverage and .git, and reports hits for retired names and the local checkout folder name. Say "the chat host" and "the host's MCP config" instead. The `coverage/` folder is git-ignored because it holds absolute local paths.

## Parity matrix and the form kit

`docs/parity-matrix.md` lists every view and state compared with a real capture: the measured items, the real value, ours, the delta, and the states that still have no capture. It is generated from `bin/parity-spec.mjs` by `npm run parity:write`; `npm run parity` (also the jest test `parity.test.ts` where Chrome is installed) fails on a difference that is neither within the tolerance nor justified in the spec. The overflow check renders every view at 360, 640 and 900px and fails on any element past the frame edge or any scroll container (other than a log) wider than itself, not only on a document scroll.

The work item detail view and the new work item form are one page in the web UI and share one kit (`ui/RealForm.tsx`, `ui/formStyles.ts`): header fields with a 60px label column and 31px rows, values as plain text until clicked and then a 29px editor (a dropdown shows a check on the current value), a 33px title with a 17px font, 16px/600 section titles with a divider, and the description as an inline rich text editor (toolbar, "switch to Markdown editor"). `wit_work_item_form` accepts every field a type can have (priority, effort, story points, remaining work, activity, severity, risk, value area, repro steps, system info, start and target date, tags, assignee, acceptance criteria); the form shows and sends only the fields the chosen type has. The signed-in user's avatar comes from `core_get_current_user`.

## Project scope

The server default project stays the one in `ADO_MCP_PROJECT`. A view works in the project its opening tool call named: `project` (and `team`, otherwise "<project> Team") in the call's arguments become the scope of every call the view makes, including the review form calls and the links it opens. Without one the server default applies. Only plain project names are accepted. The form entry tools (`wit_work_item_form`, `testplan_test_case_form`, `repo_pull_request_form`, `pipelines_run_form`) take `project` and `team` for this. Type information is process specific (Basic, Agile), so the view drops what it learned about a type when the scope changes. Agile fields (Story Points, Risk, Value area, Acceptance Criteria, Business Value, Time Criticality, Effort, Start and Target Date; Bug: Repro Steps, System Info, Severity) appear when the work item type has them.

## Agile process (project DevAgile)

Compared with `agile-01` to `agile-06` in the parity matrix. The form layout follows the type, not one list: User Story (Planning: Story Points, Priority, Risk; Classification: Value area, default "Business"), Feature and Epic (Planning: Priority, Risk, Effort, Business Value, Time Criticality, Start Date, Target Date; Classification), Bug (Repro Steps and System Info sections; Planning: Resolved Reason with a lock, Story Points, Priority, Severity "3 - Medium", Activity; Effort (Hours): Original Estimate, Remaining, Completed; Build after Related Work: Found in Build, Integrated in Build), Task with hour estimates (Planning, Effort (Hours)). Fields a type has that no layout names follow in Planning, so none is lost. A new item shows the comment box with the user's avatar, Reason "New" (or "Added to backlog" when the first state is To Do), and starts at the team's current iteration, or at the project root when none is current. Repro Steps and System Info are HTML-only fields: the editor says "We support markdown, you can convert this field." The backlog shows Order, Work Item Type, Title, State and Story Points (Effort for Basic types) and a Planning pane with the next three sprints, planned effort and item counts by type; the board shows the limit (0/5) on Active and Resolved. Types named in the form call that no backlog level lists (Bug) still get their form. Still to compare: agile-07 and the states listed under "No capture yet".

## Dark theme and contrast gate

Colours in the views come from the Fluent theme tokens, never a fixed grey: field labels, hints, placeholders and empty-field text use `colorNeutralForeground3`, values and headings `colorNeutralForeground1`, surfaces `colorNeutralBackground1` and `2` (inset surfaces such as board lanes and info boxes are Background3 in light and Background2 in dark, through the `--kInset` role in `lib/host-theme.ts`), strokes `colorNeutralStroke1`/`2`. `bin/contrast-gate.mjs` (run by `npm run contrast` and by `npm run parity`) renders every view in both themes and fails on a text node or placeholder below 4.5:1 (3:1 for 24px text or 18.66px bold) and, in the dark theme, on any background darker than #1f1f1f (no near-black surfaces; #141414 is the floor for scroll gutters only). The per-surface tokens are listed in `docs/parity-matrix.md`. Hard-coded colours remain only for type and state markers and status icons (data colours), which are not text.
