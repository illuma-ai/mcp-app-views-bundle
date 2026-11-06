# Interactive Outlook views (MCP Apps)

Hosts that render MCP Apps can show an interactive view next to the result of selected Outlook
tools, so a person can review mail before anything is sent. The views use the stable MCP Apps
protocol (`@modelcontextprotocol/ext-apps`, pinned): tools carry `_meta.ui.resourceUri`, and the
`ui://` resources are served with mime type `text/html;profile=mcp-app`.

**Tool results never change.** A view is linked only through the tool definition's `_meta.ui`.
`tools/call` returns the same bytes with or without views, so clients that do not render apps (a
workflow engine calling `tools/call` over HTTP) are unaffected.

## Tool to view map

| View               | Resource                       | Linked tools                                                                                 |
| ------------------ | ------------------------------ | -------------------------------------------------------------------------------------------- |
| Mail list          | `ui://mail/inbox.html`         | `list-mail-messages`, `list-mail-folder-messages`                                            |
| Message            | `ui://mail/message.html`       | `get-mail-message`                                                                           |
| Draft review       | `ui://mail/draft.html`         | `create-draft-email`, `create-reply-draft`, `create-reply-all-draft`, `create-forward-draft` |
| Calendar           | `ui://calendar/view.html`      | `list-calendar-events`, `get-calendar-view`                                                  |
| Event              | `ui://calendar/event.html`     | `get-calendar-event`, `create-calendar-event`, `update-calendar-event`                       |
| Teams chats        | `ui://teams/chats.html`        | `list-chats`, `list-joined-teams`                                                            |
| Teams conversation | `ui://teams/conversation.html` | `list-chat-messages`, `get-chat-message`, `list-channel-messages`                            |
| Files explorer     | `ui://files/explorer.html`     | `list-folder-files`                                                                          |
| File details       | `ui://files/file.html`         | `get-drive-item`                                                                             |
| Contacts           | `ui://contacts/list.html`      | `list-outlook-contacts`, `list-contact-folder-contacts`                                      |
| Contact card       | `ui://contacts/card.html`      | `get-outlook-contact`                                                                        |
| To Do              | `ui://tasks/list.html`         | `list-todo-task-lists`, `list-todo-tasks`                                                    |

The map lives in `src/endpoints.json` (`appView`). A view may call other tools back (paging,
folders, read state, flag, reply drafts, save, send, delete); those roles are declared with
`appViewAction` and passed to the view only when the tool is enabled, so a view never offers an
action whose tool is hidden (read-only mode, `--enabled-tools`, `--allowed-scopes`). Every
App-initiated call is confirmed by the host with its full arguments. The Send button is the only
code path that calls the send tool.

| `appViewAction`                | Tool                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `list`                         | `list-mail-messages` (paging, conversation load by `conversationId`) |
| `listFolder`                   | `list-mail-folder-messages` (folder tabs, paging)                    |
| `folders`                      | `list-mail-folders` (folder menu, folder names on messages)          |
| `get`                          | `get-mail-message` (open a row, lazy body, attachment list)          |
| `update`                       | `update-mail-message` (read state, flag, save draft)                 |
| `reply`, `replyAll`, `forward` | the three draft-creating reply tools                                 |
| `send`                         | `send-draft-message`                                                 |
| `discard`                      | `delete-mail-message` (discard a draft, delete a message)            |
| `compose`                      | `create-draft-email` (New mail)                                      |

## Tool classification (per area)

No tool should be enabled in a chat until it is classified. **read** runs without a prompt;
**write** changes data and needs the host approval card; **deny** is not exposed. Writes are only
reachable from an explicit button in a view (Send, Save, Create, Accept, Decline, Move, Delete) as
an App-initiated call, so the host card applies. Nothing is implicit: there is no auto-save and the
views do not mark a message read on open (the reference client does; allowing that would be a
documented exception). A test (`test/view-write-gate.test.tsx`) fails if a view calls a write tool
without a click.

### Mail (Outlook)

`--enabled-tools` set: `--preset outlook` (the mail, calendar-free subset); scopes `Mail.ReadWrite Mail.Send`.

| Tool                                                                                 | Class         | Recommended policy | What it changes                                          |
| ------------------------------------------------------------------------------------ | ------------- | ------------------ | -------------------------------------------------------- |
| list-mail-messages, list-mail-folder-messages, list-mail-folders, get-mail-message   | read          | allow              | nothing                                                  |
| create-draft-email, create-reply-draft, create-reply-all-draft, create-forward-draft | write (draft) | allow              | creates a draft only                                     |
| update-mail-message                                                                  | write         | allow              | draft edits, read state, flag (reversible)               |
| move-mail-message                                                                    | write         | ask                | moves a message (Archive, Move to, Report junk)          |
| delete-mail-message                                                                  | write         | ask                | deletes a message or discards a draft (to Deleted Items) |
| send-draft-message                                                                   | write (send)  | ask                | sends the draft: leaves the mailbox                      |

### Calendar

Views: `ui://calendar/view.html` (day, work week, week, month and agenda grids with Today and
previous/next; command-bar words as in the reference client) and `ui://calendar/event.html`
(organizer, attendees with responses, location, join link, body, edit form).

`--enabled-tools` set (Outlook plus calendar): `--preset outlook,calendar`; scopes `Calendars.ReadWrite`
(read-only use needs `Calendars.Read`). All tools below are enabled under
`--allowed-scopes "User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite"` (tested).

| Tool                                                                                | Class           | Recommended policy | What it changes                                          |
| ----------------------------------------------------------------------------------- | --------------- | ------------------ | -------------------------------------------------------- |
| list-calendar-events, get-calendar-view, get-calendar-event, compose-calendar-event | read            | allow              | nothing                                                  |
| create-calendar-event                                                               | write (create)  | ask                | creates the event and **sends invitations** to attendees |
| update-calendar-event                                                               | write (update)  | ask                | changes the event and notifies attendees                 |
| delete-calendar-event                                                               | write (delete)  | ask                | deletes the event (cancels it for the organizer)         |
| accept-calendar-event, tentatively-accept-calendar-event, decline-calendar-event    | write (respond) | ask                | sends your response to the organizer                     |

Callbacks: navigation calls `get-calendar-view` (range, `timezone`, `select`, `top`); opening an event calls
`get-calendar-event` (`bodyFormat: html`). Limits: the "New event" form creates the event on Save (Graph has no
draft event), so the host card is the review step; recurring-event series edits, categories, reminders,
attachments, the mini month and booking page are not offered; Split view, Share and Print are shown disabled.

### Teams (chats first, channels second)

Views: `ui://teams/chats.html` (Chat header, filter pills Unread / Channels / Chats, a Chats section and,
behind Channels, Teams and channels) and `ui://teams/conversation.html` (header with the chat name and
the Chat tab, others' messages left in grey bubbles under "Name time", mine right-aligned under the
time, reactions, attachment chips, Load earlier messages, channel threads with Replies, the "Type a
message" composer with a Send arrow). Quick views, Favorites and the Shared tab have no data behind them
here and are not shown; the composer's format, emoji, attach, Loop and more icons are shown disabled.

`--enabled-tools` set: `--preset outlook,calendar,teams` with `--org-mode` (the Teams tools need work
scopes). `teams` now also contains `get-current-user` (User.Read) so the conversation can right-align
your own messages. **Chats work alone:** with only the chat scopes below the chat views register and every
channel tool is dropped; the Channels pill is then disabled.

Scopes. Chats (user-consentable): `Chat.ReadBasic ChatMember.Read ChatMessage.Read ChatMessage.Send`.
Channels (**`ChannelMessage.Read.All` needs admin consent**): `Team.ReadBasic.All Channel.ReadBasic.All
ChannelMessage.Read.All ChannelMessage.Send`.

| Tool                                                                                                                          | Class        | Recommended policy | What it changes                                        |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------ | ------------------------------------------------------ |
| list-chats, get-chat, compose-chat-message, list-chat-messages, get-chat-message, list-chat-message-replies, get-current-user | read         | allow              | nothing                                                |
| list-joined-teams, list-team-channels, list-channel-messages, get-channel-message, list-channel-message-replies               | read         | allow              | nothing (channel tools need the admin-consented scope) |
| send-chat-message                                                                                                             | write (send) | ask                | posts a message in the chat as you                     |
| reply-to-chat-message                                                                                                         | write (send) | ask                | posts a reply in a chat thread                         |
| send-channel-message                                                                                                          | write (send) | ask                | posts a message to a channel                           |
| reply-to-channel-message                                                                                                      | write (send) | ask                | posts a reply in a channel thread                      |

Callbacks: opening a chat or channel reads the messages (30 at a time, older pages via the next link);
Send posts plain text (`body.body.content`). Send is the Send button or Ctrl+Enter (an explicit
keystroke); a plain Enter inserts a new line. Limits: unread state and chat names need the list call to
include `$expand=members,lastMessagePreview` (the model's own call decides; without it chats show the
topic or "Chat" and nothing is marked unread); no reactions, edits, deletes, pins, mentions picker or
file upload; HTML bodies are sanitised and hosted images are not loaded.

### Files (OneDrive)

Views: `ui://files/explorer.html` (command bar New / Upload / Download / Rename / Move to / Delete,
search, list and grid toggle, a "My files" breadcrumb, Name / Modified / File size columns, folders
first, "N items" for folders, "This folder is empty", Load more) and `ui://files/file.html` (icon, size,
modified by, Open, Download, Rename, Delete). Wording is the standard OneDrive web wording and is marked
unverified in `words.md` until a capture exists. Upload is shown disabled: a view cannot pick a local
file, and `upload-file-content` / `create-upload-session` are not linked to any view.

`--enabled-tools` set: `--preset onedrive` (add it to the other presets in the combined list). Scope:
`Files.ReadWrite` (reads need only `Files.Read`; without `Files.ReadWrite` every write tool is dropped and the
buttons are disabled).

| Tool                                                                                                                                                                          | Class                | Recommended policy | What it changes                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------ | ------------------------------------------------------ |
| list-drives, get-drive-root-item, list-folder-files, get-drive-item, search-onedrive-files, list-drive-item-thumbnails, list-drive-item-versions, list-drive-item-permissions | read                 | allow              | nothing                                                |
| create-onedrive-folder                                                                                                                                                        | write (create)       | ask                | adds a folder (name conflicts are renamed)             |
| move-rename-onedrive-item                                                                                                                                                     | write (update, move) | ask                | renames or moves one item                              |
| delete-onedrive-file                                                                                                                                                          | write (delete)       | ask                | sends one item to the recycle bin                      |
| upload-file-content, create-upload-session, copy-drive-item                                                                                                                   | write (create)       | ask                | not reachable from a view                              |
| share-drive-item, create-drive-item-share-link, delete-drive-item-permission                                                                                                  | write (share)        | deny for views     | changes who can open a file; not reachable from a view |

Callbacks: opening a folder calls the list tool with the folder id (50 at a time); search calls the
search tool; Download and Open use the links Graph returns, opened through the host, so no tool call.
Every write is one explicit button that makes an App-initiated call with `confirm: true`, so the host
asks first; selecting, browsing and switching list or grid never write.

### Contacts

Views: `ui://contacts/list.html` (Contacts header, Search, alphabet group headers, avatar rows with
"job title, company", "No contacts", "No results found", Load more) and `ui://contacts/card.html` (avatar,
name, role, Send email and Call, labelled fields Email / Mobile / Work phone / Home phone / Work address /
Home address). Read only: creating, editing and deleting contacts are not reachable from a view. Wording is
the standard People wording, marked unverified in `words.md`.

`--enabled-tools` set: `--preset contacts`. Scope: `Contacts.Read` (writes would need `Contacts.ReadWrite`,
which the views never use).

| Tool                                                                                                                              | Class          | Recommended policy | What it changes                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------ | ------------------------------------------------------ |
| list-outlook-contacts, get-outlook-contact, list-contact-folders, list-contact-folder-contacts, list-contact-folder-child-folders | read           | allow              | nothing                                                |
| create-outlook-contact, create-contact-in-folder, create-contact-folder, create-contact-child-folder                              | write (create) | ask                | adds a contact or folder; not reachable from a view    |
| update-outlook-contact, update-contact-folder                                                                                     | write (update) | ask                | edits a contact or folder; not reachable from a view   |
| delete-outlook-contact, delete-contact-folder                                                                                     | write (delete) | ask                | removes a contact or folder; not reachable from a view |

Card links (`mailto:`, `tel:`) open through the host; no tool call is made.

### To Do (tasks)

View: `ui://tasks/list.html` (list names across the top with the default list first, the list name as the
heading, "Add a task" with an Add button, circular check controls, "Due Tue, Nov 4" lines with overdue in
the danger colour, a filled star for high importance, a collapsed "Completed n" section, "No tasks").
Wording is the standard To Do wording, marked unverified in `words.md`. My Day, Planned, Assigned to me,
steps, notes and reminders have no data behind them here and are not shown. Planner tools exist
(`list-planner-tasks`, `list-plan-tasks`, ...) but have no view: Planner plans, buckets and assignments
need a board layout that is out of scope; they stay available to the model as plain tools.

`--enabled-tools` set: `--preset tasks`. Scope: `Tasks.ReadWrite` (reads need only `Tasks.Read`; without
`Tasks.ReadWrite` the check and Add controls are disabled).

| Tool                                                                                                        | Class          | Recommended policy | What it changes                                                        |
| ----------------------------------------------------------------------------------------------------------- | -------------- | ------------------ | ---------------------------------------------------------------------- |
| list-todo-task-lists, list-todo-tasks, get-todo-task, list-todo-checklist-items, list-todo-linked-resources | read           | allow              | nothing                                                                |
| update-todo-task                                                                                            | write (update) | ask                | sets one task completed or not completed, or its importance (the star) |
| create-todo-task                                                                                            | write (create) | ask                | adds one task to the open list                                         |
| delete-todo-task, create/update/delete-todo-task-list, checklist and linked-resource writes                 | write          | ask or deny        | not reachable from a view                                              |
| Planner tools (create/update plan, bucket, task, details)                                                   | write          | ask                | not reachable from a view                                              |

Check-off sends `{status: "completed"}` (or `"notStarted"` to undo) as an App-initiated call with
`confirm: true`, so the host asks first; the view updates only after the call succeeds. Opening a list,
switching lists and expanding Completed never write.

### Combined `--enabled-tools` for every view

`--enabled-tools` cannot be combined with `--preset`. This one pattern enables exactly the tools the views
need across mail, calendar, Teams chats and channels, files, contacts and To Do (51 tools, plus the
`ui://` resources they link). Drop the channel tools to work with chats alone, and use `--org-mode`:

```
--org-mode --enabled-tools '^(list-mail-messages|list-mail-folder-messages|list-mail-folders|get-mail-message|create-draft-email|create-reply-draft|create-reply-all-draft|create-forward-draft|update-mail-message|send-draft-message|delete-mail-message|move-mail-message|list-calendar-events|get-calendar-view|get-calendar-event|create-calendar-event|update-calendar-event|delete-calendar-event|accept-calendar-event|tentatively-accept-calendar-event|decline-calendar-event|list-chats|list-chat-messages|get-chat|compose-chat-message|compose-calendar-event|read-mail-text|get-chat-message|send-chat-message|reply-to-chat-message|list-chat-message-replies|get-current-user|list-joined-teams|list-team-channels|list-channel-messages|list-channel-message-replies|send-channel-message|reply-to-channel-message|list-folder-files|get-drive-item|search-onedrive-files|move-rename-onedrive-item|delete-onedrive-file|create-onedrive-folder|list-outlook-contacts|list-contact-folder-contacts|get-outlook-contact|list-todo-task-lists|list-todo-tasks|update-todo-task|create-todo-task)$'
```

`list-relevant-people` is not included: no view calls it. A test connects with this exact pattern and
checks every view registers and every callback tool is present.

## Review before send

With the views on, every tool that sends or invites on the user's behalf requires `confirm: true`, and
only the review view's Send or Save button sends it (field `reviewVia` in `endpoints.json`). A direct
model call without it sends nothing and returns `{"error": "review_required", "reviewTool": ..., "sent": false}`
naming the tool that opens the review view. Views off: nothing changes.

| Tool                                                             | Without confirm         | Review view opened by                                            | Sent by                       |
| ---------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------- | ----------------------------- | ---------------------- |
| send-mail, send-draft-message                                    | refused, names the tool | create-draft-email                                               | Send in the draft view        |
| reply-mail-message, reply-all-mail-message, forward-mail-message | refused, names the tool | create-reply-draft, create-reply-all-draft, create-forward-draft | Send in the draft view        |
| send-chat-message, reply-to-chat-message                         | refused, names the tool | compose-chat-message                                             | Send in the conversation view |
| send-channel-message, reply-to-channel-message                   | refused, names the tool | compose-chat-message                                             | Send in the conversation view |
| create-calendar-event (sends invitations)                        | refused, names the tool | compose-calendar-event                                           | Save in the event view        | Save in the event view |

`compose-chat-message` is a read-only entry tool (class read, policy allow, changes nothing): given
`text` and a `chatId`, or `teamId` with `channelId`, or `recipients` (names or addresses of
the people in an existing chat), it opens the conversation composer with the proposed text in the box.
Nothing is sent until the user presses Send, and Send sends exactly the text in the box.

**A message to yourself cannot be addressed.** Graph does not return the Teams self-chat (your own notes
space): `/me/chats` does not list it and it has no chat id. `compose-chat-message` with `recipients` that is only the
signed-in user ("me", "myself", or your own name or address) returns `self_chat_not_addressable` with that
explanation, and the composer view says the same instead of reporting that no chat was found. Send to a
channel or to a chat with another person. It exists only
while the views are on and belongs to the `teams`, `teams-write` and `work` presets.

`compose-calendar-event` is the same kind of tool for events (class read, policy allow, changes nothing): given
`subject`, `start` and `end` (local date-times, with an optional `timeZone`) and optionally `attendees`
(addresses), `location` and `body`, it opens the event form with those values filled in. Nothing is
created and no invitation goes out until the user presses Save, which makes the only write
(`create-calendar-event` with `confirm: true`, so the host asks once, at Save). It belongs to the `calendar`,
`outlook`, `personal` and `work` presets. A direct `create-calendar-event` without `confirm` creates nothing and
returns `review_required` naming `compose-calendar-event`.

Limit: the tool cannot tell the view's call from a model that passes `confirm: true` itself; the host
approval card shows the full arguments of every app-initiated call, and a host that approves model calls
the same way shows it for those too.

### Review-first guidance in tool descriptions

With the views on, each reviewed write tool's description starts with "Review first: to create or send this
from a conversation, call <review tool> first ... This tool is only for that form's Save or Send and needs
confirm: true", and the review tools (`create-draft-email`, the reply and forward drafts,
`compose-chat-message`, `compose-calendar-event`) say they are the first choice when asked to send or
create. The model therefore reaches the read-only review step first and the host asks once, at the form's
Save or Send, instead of at a direct call that can only be refused. With the views off the descriptions are
unchanged. A test checks both.

## Turning views off

`--no-app-views` or `MS365_MCP_DISABLE_APP_VIEWS=true`. Views are also off under `--toon` (the
views read JSON) and in `--discovery` mode (tools are not registered individually there).

## Safety

Message HTML is parsed into an inert document and rebuilt from an allowlist (no scripts, forms,
frames or remote images; links limited to http(s), mailto and tel; sender colours and fonts are
dropped). Each view document also carries a strict content security policy with no network access.

## Design

The views are built on Fluent UI React v9 (`@fluentui/react-components`, MIT) with the light, dark
and high-contrast web themes, chosen from the host theme and the `forced-colors` media query.
The Teams views (chat list, conversation, channel, composer) use the Fluent Teams themes (purple brand, `src/views/ui/dark-theme.ts`); Outlook, OneDrive, People and To Do use the web themes (blue). The compose box is a 1px neutral border with a 6px radius, unchanged on hover, with a 2px brand line inside the bottom on focus. Chat titles follow Teams: topic, other members, the bot application's name, else "<name> (You)" for the self-chat; never a bare "Chat".
Icons come from `@fluentui/react-icons`. Our code is layout and mail logic only: grouping, threads,
lazy bodies, sanitising and tool calls, with styling limited to Griffel `makeStyles` over Fluent
tokens (a test fails on hex colours or font-family literals in the UI sources). Only the outer frame
takes its border and background from the host's style variables so the view blends into the chat.

| Folder             | Contents                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `src/views/ui`     | React components: `InboxView`, `ReadingView`, `Composer`, `MessageBody`, `Frame`, `shared` |
| `src/views/mail`   | Mail logic with no UI: API wrapper, conversation grouping, date groups, recipients, types  |
| `src/views/lib`    | Sanitiser, quoted-history splitter, formatting, host theme helpers                         |
| `src/views/client` | Entry point that wires the SDK `App` to React                                              |

The browser code is bundled with the SDK, React and Fluent into `src/generated/views-bundle.ts` by
`npm run generate:views` (also run before `npm test`). Each view document is one self-contained
HTML file of about 1.1 MB (about 300 KB gzipped); the host limit is 4 MiB.

## Local preview and parity check

`npm run preview:views`, then open <http://127.0.0.1:6280>. A small MCP Apps host (built on the SDK's
`AppBridge`) renders each view with fixture data in light and dark, with the style variables the
chat host sends. View tool calls wait for **Approve**, like the real host. Add `&compare=outlook` to
show a cropped reference capture beside the view (captures are read from
`../m365-setup/reference/outlook`, or `PREVIEW_REFERENCE_DIR`, and are never part of the repository).
Fixtures live in `preview/` and never reach the server's runtime path.

`npm run measure:views` launches the preview in the system Chrome (no download and no extra
dependency; it speaks the DevTools protocol over the built-in WebSocket) and prints computed metrics
beside the measured reference values (row height, avatar, group header, buttons, fonts, colours).
`-- --shots DIR` also saves 640px light and dark screenshots.

### Responsive layout

Views are laid out for the frame width the host gives them, checked at 360, 640 and 900px:

| Width        | What changes                                                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| below 560px  | Calendar shows the agenda (the Day / Work week / Week / Month buttons are hidden); the file list keeps Name, Modified and File size; inbox rows wrap sender, subject and date; message headers put the date and actions under the sender; command bars wrap |
| 560px and up | The file list adds Modified By and Sharing; the calendar time grid is available                                                                                                                                                                             |
| 900px and up | The file list adds Activity                                                                                                                                                                                                                                 |

Teams stacks: the chat list is replaced by the conversation (Back returns), never shown side by side.
`npm run measure:views -- --responsive [--widths 360,640,900] [--themes light,dark] [--shots DIR]` saves
a screenshot of every view at each width and exits non-zero when any view scrolls sideways;
`test/parity-matrix.test.ts` runs it at 360px (skipped with a warning when no Chrome is installed).

### One stable frame

The host resizes a view's iframe to the height the view reports, so a screen that unmounts and mounts
nearly empty (chat list to conversation) would collapse the frame and grow it again, jumping the host
page. Every view is wrapped in `StableFrame` (`src/views/ui/StableFrame.tsx`): it holds the tallest
height shown so far as a minimum, so navigating never reports a smaller size while the next screen
loads, and it caps the frame at 720px (scrolling inside it) so list, conversation and reading pane keep
one bounded height. `npm run measure:views -- --frame` opens list, detail and back in the Teams, inbox
and People views and fails if the size the view reports (as the host receives it) ever drops below its
height before the click or exceeds the cap; `test/parity-matrix.test.ts` runs it.

Headers stay fixed and only the body scrolls, like the real pages: a header, toolbar or filter bar marked `data-sticky="top"` (and a conversation composer marked `data-sticky="bottom"`) sticks to the edge of the one scroller, stacked after the ones before it (`applyStickies` in `StableFrame`, which also lets the views' rounded outer boxes clip without becoming scroll containers). The same `--frame` run squeezes every view to 150px, scrolls it to the bottom and fails if its first header is not at the top (or a composer is not at the bottom), or if a view has no marked header.

### Teams chat list: titles and avatars

Titles follow Teams (topic, other members, the application's name, "<name> (You)" for the self-chat). A
bot chat and the self-chat both list only the signed-in user, so a one-member chat is settled from its
recent messages: only an application sender names it, a user sender never does. The lookups run after
the first paint, three at a time (the host rate-limits app tool calls), with a back-off retry, and the
row shows a placeholder until its name arrives; the signed-in user's name is never used as a title.
Avatars are 20px with an 8px gap: a person (and the self-chat) a circle with initials; a bot or app chat
a 2px-radius brand-indigo square (no letters); a meeting chat a circle on light lavender with the
calendar glyph; a group chat a grey circle with the people glyph. The presence badge needs a presence
tool and is not shown (a justified delta in the parity matrix).

### Contrast and dark surfaces

`npm run measure:views -- --contrast` renders every view and state (24, including the empty, bot,
month, new-event and HTML-message states) in light and dark and fails when

- any visible text (text nodes, input values, placeholders; disabled controls are exempt) is under 4.5:1
  against its effective background, every translucent layer composited from the outside in (3:1 for
  large text: 24px, or 18.66px and bold), listing the view, text, both colours and the ratio; or
- in dark mode, any painted surface larger than a few px is at or below #141414, the floor of the Fluent
  web dark palette (a floor for scroll gutters only, never a surface). Dark views sit on dark greys (`colorNeutralBackground1` #292929, `2` #1f1f1f, `3` #141414
  only as the floor), never on black. `src/views/ui/dark-theme.ts` lifts the third layer to the second
  layer's value (group headers, day bands, message cards and disabled controls, one step below the rows
  as the real light page layers them). It also renders dark inside a host whose own surface is
  pure black, and the frame ignores a host background at or below #141414.

The views take their theme from the host context (`theme`); when the host sends none they follow the
page's `data-theme` or `prefers-color-scheme`, so a dark host never shows light-theme text on its
dark surface. The check runs with the browser's `prefers-color-scheme` set to match. Fix a failure at
the token level (a Fluent foreground or background token); never a literal colour. The chosen token
per surface is recorded in the "Dark theme surfaces" table of `docs/parity-matrix.md` (no real dark
capture exists yet, so the palette is the spec). `test/parity-matrix.test.ts` runs it.

### Playbook for the next area

`.claude/skills/mcp-app-views/` (SKILL.md and references) is the playbook for adding views for another
area: capture the real product, write the measured spec and words, build on the shared Fluent kit,
review before write, register the tool policy, verify live, and run the security checklist. Follow it
for the next area, and keep this document's per-area sections and tables in step with what it produces.

The repository is brand-neutral: `test/brand-neutral.test.ts` fails the gate if the chat host's product
name, or either retired product name, appears in any file or file name. Write "the chat host" or "the
host's MCP config" instead.

### Parity matrix

`docs/parity-matrix.md` has one row per view state: what real capture it is compared with, the measured
items (font size and weight, heights, paddings, colours, wording), our value and the delta. States with no
real capture say exactly what to capture next. The table lives in `bin/parity-spec.mjs`; a difference that
is kept on purpose must be listed there with its reason.

- `npm run measure:views -- --assert` measures every row in Chrome and exits non-zero on any difference
  that is not justified; `test/parity-matrix.test.ts` runs it, so the gate fails on one.
- `npm run measure:views -- --matrix` rewrites `docs/parity-matrix.md` from the measured values.
- `npm run measure:views -- --eval "view=draft&scenario=new" "<js>"` prints what a snippet returns in one
  scene, for finding a selector or a size.

The compose and create forms are compared the same way: the Outlook send bar, To/Cc rows and subject (from
the real compose capture), the Teams composer, the To Do add row and footer, the People and OneDrive
command bars. The event form has no real capture yet, so its field sizes are listed without a spec.
