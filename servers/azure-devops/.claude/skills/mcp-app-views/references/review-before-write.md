# Review-before-write contract

## Tools
| Kind | Example | Policy | Behaviour |
|---|---|---|---|
| review (read-only) | `compose-<thing>`, `<thing>_form` | allow | Returns the proposal and opens the form pre-filled. Creates nothing. Validates required fields and returns an error if missing. |
| write | `send-<thing>`, `create-<thing>`, `<thing>_write` | ask | Refuses without the view's confirmation. The refusal is `{ error: "review_required", reviewTool: "<name>", sent: false }` (or an equivalent text) and never mentions the token. |

Write-tool description when views are on: `Review first: to create or send this from a conversation, call <review tool>
first; it opens the review form for the user. This tool is only for that form's Save/Send and needs confirm: true.`
With views off: description and schema byte-identical to upstream (test it).

## Confirmation
- Minimum: `confirm: true` sent by the view's control. The server cannot tell a view's `confirm` from a model's; the
  host approval card is the second guard.
- When replay matters (anything that creates records): a **review token** — `nonce(4 hex) + expiryMinute(4 hex) + mac(8 hex)`
  where `mac = HMAC-SHA256(key, tool + canonicalJSON(args without token))`; `key` derived from a server secret (shared
  across replicas, `*_CONFIRM_SECRET`), the user id, a per-view nonce and the expiry. Single use on success; a failed
  write does not spend it; default TTL 30 min; `timingSafeEqual`. The view computes it at write time for the exact args.
- Tests: wrong args rejected; other tool rejected; other user rejected; expired rejected; replay after success rejected;
  failed write keeps the token; token never appears in error text.

## Form behaviour
- Pre-fill every field the proposal carries (including body/notes — map text bodies, not only HTML).
- Editable before submit; validation inline with the product's wording.
- Submit = one call carrying everything (fields, links, parent, iteration) so one approval covers it.
- After the call resolves: success panel "<Thing> N created: <title>" with Open / Create another / Back; the Open
  shows the created record in the detail view. Cancel says "Nothing was created."
- Never render the success state optimistically.
