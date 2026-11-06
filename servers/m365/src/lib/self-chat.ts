/**
 * The Teams self-chat (your own notes space, thread 48:notes) is not returned by Graph: /me/chats does not
 * list it and it has no chat id to post to. A message "to myself" therefore cannot be addressed, and the
 * compose tool and its view say so instead of searching and finding nothing.
 */
export const SELF_CHAT_MESSAGE =
  'Teams keeps your own notes chat out of Microsoft Graph (/me/chats does not list it), so a message to ' +
  'yourself cannot be addressed from here. Post in a channel, or in a chat with another person.';

const SELF_ALIASES = new Set([
  'me',
  'myself',
  'self',
  'i',
  'my notes',
  'notes',
  'to myself',
  'you',
]);

/** True when every recipient is just a word for "me" (the signed-in user, by any alias). */
export function onlySelfAliases(recipients: readonly string[]): boolean {
  const wanted = recipients.map((r) => r.trim().toLowerCase()).filter(Boolean);
  return wanted.length > 0 && wanted.every((r) => SELF_ALIASES.has(r));
}

/** True when every recipient is the signed-in user, by name, address or alias. */
export function onlyMe(
  recipients: readonly string[],
  me: { displayName?: string; mail?: string; userPrincipalName?: string }
): boolean {
  const wanted = recipients.map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return false;
  const mine = [me.displayName, me.mail, me.userPrincipalName]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.toLowerCase());
  return wanted.every((r) => SELF_ALIASES.has(r) || mine.includes(r));
}
