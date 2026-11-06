# Tool policy register (MCP servers used by the chat)

Rule (owner, 2026-11-05): no tool is enabled in the chat until it is listed here with its class and policy.
Classes: **read** (no data change; runs without a prompt), **write** (creates, saves, updates, moves,
sends, deletes; the host approval card is required), **deny** (not exposed to the chat at all).
The policy lives in the chat host's config → `endpoints.agents.toolApproval` (`allow` / `ask` / `deny` globs,
key form `<tool>_mcp_<server>`), and app-initiated calls follow it when `mcpSettings.appsHonorToolApproval` is on.
Scheduled agents may put a write tool on Always-approve per agent; that is a per-agent decision, logged here when done.

## m365 (server `m365`, currently enabled set)

| Tool | Class | Policy | Notes |
|---|---|---|---|
| list-mail-folders | read | allow | folder picker |
| list-mail-folder-messages | read | allow | inbox list |
| list-mail-messages | read | allow | thread load, search |
| get-mail-message | read | allow | message/thread body (HTML) |
| list-mail-attachments | read | allow | attachment cards |
| list-relevant-people | read | allow | directory lookup (People.Read) |
| get-current-user | read | allow | signed-in user |
| create-draft-email | write (draft) | allow | creates a draft only; nothing leaves the mailbox |
| create-reply-draft / create-reply-all-draft / create-forward-draft | write (draft) | allow | same |
| update-mail-message | write | allow | saves draft edits, read/flag state; reversible |
| move-mail-message | write | **ask** | archive / move to folder |
| delete-mail-message | write | **ask** | deletes a message or a draft |
| send-mail | write (send) | **ask** | leaves the mailbox |
| send-draft-message | write (send) | **ask** | leaves the mailbox |

Pending classification before enabling (M365 suite phases): calendar (create/update/delete event, respond to invite = ask;
list/get = allow), Teams (send/reply chat or channel message = ask; list/get = allow), OneDrive (upload/move/rename/delete = ask;
list/get/download = allow), contacts (create/update/delete = ask), To Do/Planner (create/update/complete/delete = ask).

## ado (server `ado`, not enabled yet)

To be filled from the developer's tool list before the server is added to the host's MCP config. Expected classes:
reads (`wit_get_*`, `wit_list_*`, `wit_my_work_items`, `work_list_*`, `repo_list_*`, `repo_get_*`, `pipelines_get_*`,
`testplan_list_*`, `testplan_show_*`, `core_list_*`) = allow; creates/updates (`wit_create_work_item`,
`wit_update_work_item`, `wit_add_work_item_comment`, `wit_link_work_items`, `work_*assign*`, `testplan_create_*`,
`testplan_add_*`, `repo_create_pull_request*`, `repo_update_*`, `pipelines_run_pipeline`) = ask; destructive
(`wit_delete_*` if present, project/team admin) = deny.

## Change log
- 2026-11-05: register created; m365 live set classified; `move-mail-message` and `delete-mail-message` moved to ask (they were enabled without a rule).

## ado — classification applied 2026-11-05 (server exposes 37 tools; writes are separate `*_write` tools in 2.11.0)
allow (read): core_list_project_teams, core_list_projects, core_get_identity_ids, work, pipelines_build, pipelines_build_log, pipelines_definition, pipelines_artifact, repo_repository, repo_pull_request, repo_pull_request_org, repo_pull_request_thread, repo_branch, repo_file, repo_search_commits, wit_work_item, wit_query, wit_backlog, wit_work_item_attachment, testplan, testplan_show_test_results_from_build_id
ask (write): every `*_write` (work_iteration_write, work_capacity_write, pipelines_write, repo_file_write, repo_pull_request_write, repo_pull_request_thread_write, wit_work_item_write, wit_work_item_comment_write, wit_work_item_link_write, testplan_test_plan_write, testplan_test_suite_write, testplan_test_case_write), pipelines_run (kept on ask until its actions are confirmed read-only), repo_create_branch, wit_work_item_attachment_upload, wit_work_item_attachment_link
deny: none exposed beyond the six domains (no project/org admin tools)

## m365 — calendar (enabled 2026-11-05 after phase 1 gate; scope Calendars.ReadWrite)
allow (read): list-calendar-events, get-calendar-view, get-calendar-event
ask (write): create-calendar-event (sends invitations), update-calendar-event (notifies attendees), delete-calendar-event, accept-calendar-event, tentatively-accept-calendar-event, decline-calendar-event

## m365 — Teams (phase 2 gated 2026-11-05; chat scopes Chat.ReadBasic ChatMember.Read ChatMessage.Read ChatMessage.Send; channel scopes Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All (admin consent) ChannelMessage.Send)
allow (read): list-chats, list-chat-messages, get-chat-message, list-chat-message-replies, list-joined-teams, list-team-channels, list-channel-messages, get-channel-message, list-channel-message-replies, get-current-user
ask (write/send): send-chat-message, reply-to-chat-message, send-channel-message, reply-to-channel-message

## ado — after Boards phase (c3f710d, 2026-11-05): 39 tools
added read (allow): wit_work_item_form (opens the create form; creates nothing); wit_backlog now refuses reorder (read-only)
added write (ask, covered by `*_write`): wit_backlog_write (reorder); work_iteration_write gained `update` (dates/rename); wit_work_item_write create accepts parentId
note: wit_work_item_attachment is read, but its `savePath` writes to the server disk — to be refused in HTTP mode (requested)

## Host behaviour to know (verified 2026-11-05)
- Approving a tool on the card (or "Approve all") remembers that tool for the rest of the same conversation (`toolApproval.allowAlwaysMaxTools`, packages/api/src/agents/hitl/allow.ts); further calls of the same tool in that chat run without a prompt. A new conversation prompts again. Per-agent modes can widen or narrow this.
- App-initiated calls from views follow the same allow/ask rules when `mcpSettings.appsHonorToolApproval` is on; a write from a view always shows the host card unless the tool was remembered in that conversation.
- Azure DevOps 2.11.0 tools are action-based; the policy is per tool, so reads and writes must be on separate tools (done in the fork: `*_write`).

## ado — after detail phase (d1a5b8c, 2026-11-05): 41 tools
added read (allow): wit_board (opens the board/backlog view, text summary of columns), work_sprint (opens the sprint view); elicitation disabled in HTTP mode; savePath/destinationPath refused over HTTP (f7b9f69)

## Review-before-write enforcement (ado 1afd5dd, verified live 2026-11-05)
In HTTP mode `wit_work_item_write` (create/update/update_batch/add_child) and `work_iteration_write` (create/update) refuse calls without a confirmation token that only the views send (HMAC of the signed-in user; `ADO_MCP_CONFIRM_SECRET` must be shared across replicas). A direct model create is refused with "open the review form" → `wit_work_item_form` opens pre-filled → Create sends the write with the token → host card → created. Live: issue #23 created this way after an edit in the form; drag-and-drop state change (#4 → Doing) confirmed on the real board.

## m365 — OneDrive, contacts, To Do, Teams compose (2fe61bd/a1e602e gated 2026-11-05; scopes Files.ReadWrite Contacts.Read Tasks.ReadWrite)
allow (read): get-chat, compose-chat-message (opens the composer prefilled; sends nothing), list-folder-files, get-drive-item, search-onedrive-files, list-outlook-contacts, list-contact-folder-contacts, get-outlook-contact, list-todo-task-lists, list-todo-tasks
ask (write): create-onedrive-folder, move-rename-onedrive-item, delete-onedrive-file, update-todo-task (check-off/edit), create-todo-task
review-before-send (server-side, views on): send-mail, send-draft-message, reply/forward sends, send-chat-message, reply-to-chat-message, channel sends and create-calendar-event require confirm from the view; a direct model call returns review_required naming the review tool.
not exposed to views: upload/share tools (no view reaches them; share = deny for views)
ado — Test Plans (fc97efc): added read (allow) testplan_test_case_form (opens the pre-filled test case form); testplan_*_write create/update_steps require the view token; add_test_cases stays host-card only

## m365 — compose-calendar-event (90d4e78, gated 2026-11-05)
read (allow): compose-calendar-event — opens the event form pre-filled, creates nothing. A direct `create-calendar-event` without confirm now creates nothing and returns review_required naming it; the only write is create-calendar-event with confirm from the form's Save (ask). Same pattern as compose-chat-message and the Azure DevOps wit_work_item_form.

## Host behaviour seen live 2026-11-05 (owner to know)
- An approved write tool is remembered for the rest of that conversation: after approving `create-calendar-event` once, the view's Save ran with no second prompt. New chat = prompt again. If per-write prompting is wanted, that is a host setting (`toolApproval.allowAlwaysMaxTools`/agent modes), not a server change.
- At most 3 views stay open per chat (`mcpSettings.maxActiveViews`); opening a 4th does nothing until one is closed — the host should evict the oldest instead (host follow-up, not done).
ado — Pull requests (dee5c6c, gated 2026-11-05: eslint . 0 errors, 40 suites, 1577 tests): added read (allow) repo_pull_request_form (pre-filled new-PR form; creates nothing); repo_pull_request_write create requires the view token; vote/comment/reply/resolve stay ask via *_write
m365 — read-mail-text (d74a949): read (allow); list tools default to light fields + bodyPreview, maxTop 25, 60k-char result cap with paging cue; tool definitions compacted (86ac5f3)
ado — Pipelines (e130edb, gated: eslint . 0 errors, 41 suites, 1595 tests; Chrome parity 62 items / overflow 22 views green in the developer's run): added read (allow) pipelines_run_form (pre-filled run form), core_get_current_user; pipelines_build gained get_timeline (read); pipelines_run requires the view token. 45 tools.
ado — finding 2026-11-05 (e130edb live): pipelines_run mixes read actions (list/get) with the run action, so a read asked for approval; split into pipelines_run (read, allow) + pipelines_run_write (ask) requested; until then pipelines_run stays on ask
ado — pipelines_run confirmed read-only (list/get; cd95171 docs) → moved to allow 2026-11-05
- 2026-11-05 13:30: test servers appcheck and sp500 removed from the host config (owner go); allow 59 / ask 27
- 2026-11-05: Teams send tests — the Teams "self-chat" (Kanwarjeet Singh Hora (You), id 48:notes) is not exposed by Microsoft Graph `/me/chats`, so the server cannot address it; the model could only guess among oneOnOne chats. Rule kept: no send unless the target is certain. Recommended test target: a dedicated group chat containing only the test user (and optionally a bot the org owns), named "Chat view tests" — owner to create.
