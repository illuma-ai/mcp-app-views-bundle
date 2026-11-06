---
name: mcp-app-views
description: Build and verify pixel-parity MCP App views (ext-apps) for any MCP server so a SaaS product (mail, calendar, boards, pull requests, …) looks and clicks like the real product inside the chat host — reference capture, measured spec, reusable Fluent kit, review-before-write, tool policy register, host approval flag, live verification with the Chrome extension, security checklist, gate and docs. Use when asked to add interactive views to an MCP server, make a tool's output "look like the real app", add a review screen before a write, classify tools for approval, or verify such views end to end.
---

# MCP App views — build and verify like the real product

The pattern turns an MCP server into a product surface inside the chat host: reads open a view with no prompt,
writes go through a review screen and the host's approval card, and the same server stays a plain HTTP MCP
server for non-UI clients (workflow nodes, other hosts). Everything below was proven on two servers
(a Microsoft 365 server and an Azure DevOps server) and is written to be reused on the next one.

Brand rule: the server, its views, comments, tests and docs never name the chat host product. Say "the chat host",
"the host", "the host's MCP config". Infra identifiers that are real external names are allowed.

## 0. Before building — three decisions with the owner
1. **Which areas first** (one product area end to end before the next: list → detail → write).
2. **Which tools are enabled** in the chat. Each tool definition costs ~2k tokens; small models overflow at ~45 tools.
   Use the server's enable filter (regex/preset) and keep the list in the progress doc.
3. **Writes policy**: reads silent, writes approved. Fill the policy register (section 5) *before* enabling a tool.

## 1. Reference capture (drive the real product with the Chrome extension)
- Open the real product in the owner's Chrome (extension tools: `tabs_create_mcp`, `navigate`, `screenshot save_to_disk`,
  `javascript_tool`). Capture each state: list, empty state, loading, detail, create/edit form, dialogs, error.
- Save to `reference/<area>/NN-<state>.jpg` and write `reference/<area>/words.md`: exact labels, menu items, column
  headers, placeholders, empty-state sentences, button names, tab names, badges — in the product's order.
- Measure, don't eyeball: run `tools/measure-<area>.js` (pattern in `references/parity.md`) in the real page to dump
  computed styles (font size/weight, colors, row heights, paddings, radii) into `reference/<area>/spec.md`.
- Only verified captures count. If a state has no capture, say so in the docs ("matched to the measured spec, not a capture").

## 2. The view kit (reuse, never restyle)
- One shared UI kit per server: `src/views/ui/*` built on the product's own design system package
  (Microsoft products → Fluent UI React v9 with `webLightTheme`/`webDarkTheme`; theme follows the host context).
  No hand-written CSS that re-invents the product's styles; tokens come from the design system.
- Views are plain React components fed by `{ args, result, error, received }` and an `api` with `can(role)` /
  `call(role, args)`. Roles map to tool names through the server's endpoint/tool metadata (`appView`, `appViewAction`),
  so the view module names no tools.
- **Read host tool-input on every render.** The host starts the view, then sends tool input, then the result.
  Never capture `args` in a `useState` initializer — it stays `undefined` forever (real bug: disabled "Add a task").
- **No success state before the call resolves.** A Save/Send/Create button shows "created/sent" only when the server
  returns the created object; rejection keeps the form and shows the error (real bug: "Event created" with no event).
- Views strip any untrusted-content markers the server adds to tool results (spotlighting) before rendering.
- Sanitise HTML (allow-list DOM rebuild; http/https/mailto/tel links only; no remote images). Host `openLink` blocks
  undeclared domains, so link buttons must be declared or omitted.
- Responsive at 360 / 640 / 900 px: tables drop non-key columns, boards scroll horizontally, forms go single-column.
  `measure:views --responsive` fails on horizontal overflow; keep screenshots per width and theme.
- Keep `--no-app-views` (or equivalent): with views off the server's tool schemas, descriptions and result bytes are
  identical to upstream — non-UI clients must not change. (Spotlighting changes result bytes; make it opt-out.)

## 3. Review-before-write (the only way a write happens from a conversation)
- Split reads and writes into separate tools (policy is per tool). Action-style tools get `*_write` twins.
- A **review tool** (read-only, allow) opens the form pre-filled with the model's proposal and creates nothing:
  `compose-chat-message`, `compose-calendar-event`, `wit_work_item_form`, `repo_pull_request_form`, …
- The **write tool** refuses a direct call: over HTTP it requires a confirmation only the view can supply —
  `confirm: true` plus, where replay matters, a review token bound to the tool + canonical args, with expiry and single
  use (HMAC with a server secret shared across replicas; never derived from the OAuth client secret). The refusal text
  names the review tool and never the token.
- Write tool descriptions start with "Review first: call <review tool> …" when views are on, so the model picks the
  review tool and the user sees one approval (at Save) instead of two.
- Writes from a view are *explicit controls only*: Save, Send, Create, drag-drop, star, vote. One control, one call.

## 4. Host side (flag-gated, ext-overlay only)
- `mcpSettings.apps: true`; sandbox on a **different origin** than the chat (`mcpAppSandbox.url` + frame-ancestors env);
  `maxPersistedAppBytes` large enough for the bundle; `appsHonorToolApproval: true` so app-initiated calls follow the
  allow/ask/deny policy (host change kept in ext files with marker seams; ledger entry; transfer manifest).
- Known host behaviours to document for owners: an approved tool is remembered for the rest of that conversation;
  at most `maxActiveViews` views stay open; a view opened while the reply streams closes on re-render.

## 5. Tool policy register (before enabling anything)
`tool-policy.md` with one row per tool: class read / write(draft) / write / deny, policy allow / ask / deny, note.
Mirror it in the host config as `<tool>_mcp_<server>` globs. Rules of thumb: list/get/search/form/compose = allow;
create draft = allow; send/create/update/move/delete/vote/run = ask; anything writing server disk or admin scope = deny
(refuse `savePath`-style params over HTTP). Update the register in the same commit as the tool change.

## 6. OAuth per user over streamable HTTP
Per-user delegated tokens; dynamic client registration with redirect allow-list; PKCE S256 mandatory at `/authorize`
and `code_verifier` at `/token`; `redirect_uri` required; public URL required off loopback; per-IP rate limits; the
token lives only in the request context; nothing in logs. Document scopes per area and the admin steps with screenshots.
See `references/security-checklist.md`.

## 7. Live verification protocol (the gate the lead runs, never the developer's word)
1. Gate the commit yourself: lint over the whole tree (report the error count), typecheck, full tests, build.
2. Deploy locally (restart only your own PIDs by exact command-line match — never kill by process name).
3. In the real chat (Chrome extension): fresh conversation, right model, servers attached. For each area:
   open the view, compare side by side with the capture (words, states, sizes), exercise every control, confirm the
   approval card shows for writes and that the **real product** shows the change (open it in the other tab).
4. Capture the browser network during the flows: only the host and the sandbox origins; no tokens in URLs.
5. Save screenshots to `reference/live/`, write the result row in the progress doc (pass / fail → fixed / gap), and
   hand gaps back with file-level facts (what the host sent, what the view did, what the real page shows).

## 8. Docs that must exist (and stay current)
`docs/interactive-views.md` (areas, roles, review rule, enabled-tools pattern, responsiveness), `docs/http-oauth.md`
(setup, env, security properties, production checklist), `docs/TRANSFER.md` (file manifest + policy table),
`tool-policy.md`, `docs/admin-setup/ADMIN-SETUP.md` with Entra/IdP screenshots and scopes, a dated progress log,
`reference/<area>/words.md` + `spec.md`, CHANGELOG entry per change.

References: `references/parity.md` (capture + measure recipe), `references/review-before-write.md` (token and refusal
contract), `references/verification.md` (click-by-click live protocol), `references/security-checklist.md`.
