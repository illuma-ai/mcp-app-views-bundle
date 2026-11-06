# Live verification — click by click

Preconditions: gate green on the exact commit; servers restarted from that build (stop only your own PIDs by exact
command-line match); host config carries the allow/ask rules for every new tool; `tabs_context_mcp` first.

1. **Fresh conversation.** New chats may default to a small model and to no MCP servers: pick the right model and attach
   the servers (composer "+" → MCP Servers → toggle). Remembered approvals do not carry over, so prompts are observable.
2. **Read path.** Ask in plain words ("Show my inbox", "Show the team board"). Expect: no approval prompt; "Open app"
   on the tool call; the view loads with the product's loading state, then data. Screenshot. Compare with the capture.
3. **Controls.** Exercise each: tabs, filters, sort, search, pagination, expand/collapse, drag-and-drop (use a real mouse
   drag), row open → detail → back. Each should either work or be visibly disabled with a reason.
4. **Write path.** From the view (Save/Send/Create/star/move): expect the host card "Run tool from app?" with the full
   arguments (token short and masked where possible). Approve → the view updates only after the result → open the real
   product in the other tab and confirm the record (state, description, links). Screenshot both.
5. **Model write path.** Ask the model to create/send directly: expect the write tool to be refused (or the review tool
   called first), the form pre-filled with the model's proposal, one approval at Save.
6. **Network capture.** `read_network_requests` on the chat tab during 2–5: only the host origin (`/api/mcp/app-tool-call`,
   `/api/mcp/app/validate`, …) and the sandbox origin; nothing to the product's hosts; no tokens in URLs.
7. **Logs.** grep the host and server logs for `Bearer`, `access_token`, `refresh_token`, JWT prefixes, `code_verifier`,
   `client_secret` — expect nothing.
8. **Record.** `reference/live/<server>-<area>-<state>.jpg`; a progress-doc row per flow: pass / fail → fixed (commit) /
   gap (what the real page shows that ours does not). Hand failures back with the host-sequence facts (what args the host
   sent — read them from the conversation store — what the view did, what the real page shows).

Guardrails: test messages/emails only to the signed-in user's own mailbox; writes only to the agreed test project; the
host caps open views (close older ones with "Close app" before opening a new one); a view opened while the reply still
streams closes on re-render — wait for the reply to finish.
