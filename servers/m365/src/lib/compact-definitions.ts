/**
 * Compact tool definitions.
 *
 * Every tool definition is sent to the model on every request, so its size is a standing cost: 46 tools
 * at ~2.2k tokens each filled half a 200k window before the user typed anything. The generated
 * definitions carry the Graph documentation's prose on every OData parameter and a full request-body
 * schema; a model needs a line for each parameter and the body's field names. This module holds the
 * one-line wording and the text shortener. It is used when a definition budget is in force (the default
 * over HTTP; see MS365_MCP_TOOL_DEFINITION_BUDGET).
 */
import type { z } from 'zod';

/** One line for each parameter every list tool repeats. */
export const COMPACT_PARAM_DESCRIPTIONS: Readonly<Record<string, string>> = {
  top: 'Page size.',
  skip: 'Items to skip.',
  search: 'KQL query in double quotes. Not with filter.',
  filter: 'OData $filter expression.',
  count: 'true for advanced filter queries.',
  orderby: 'Sort, e.g. receivedDateTime desc.',
  select: 'Comma-separated fields to return.',
  expand: 'Navigation properties to inline.',
  fetchAllPages: 'Merge all pages (can be huge; only for exports).',
  skiptoken: 'The @odata.nextLink of the previous page.',
  includeHeaders: 'Include response headers.',
  excludeResponse: 'Return only success or failure.',
  confirm: 'true once the user approved this call.',
  timezone: 'IANA or Windows time zone.',
  expandExtendedProperties: 'Include extended properties.',
  account: 'Account to use.',
  name: 'Keep members whose name or email contains this.',
  Accept: 'Alternate representation to request.',
  fileName: 'File name for the result.',
  startDateTime: 'ISO 8601 start of the range.',
  endDateTime: 'ISO 8601 end of the range.',
};

/** "chatMessageId" -> "chat message id", the whole description of a path parameter. */
export function humanizeParam(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * Replaces the long generated descriptions with one line each, in place. A path parameter's generated
 * text ("Value for the 'x' path segment. Pass it under the name ...") becomes its humanized name.
 */
export function compactParamSchemas(paramSchema: Record<string, z.ZodTypeAny>): void {
  for (const [name, schema] of Object.entries(paramSchema)) {
    const short = COMPACT_PARAM_DESCRIPTIONS[name];
    if (short) {
      paramSchema[name] = schema.describe(short);
      continue;
    }
    if (/^Value for the '/.test(schema.description ?? '')) {
      paramSchema[name] = schema.describe(humanizeParam(name));
    }
  }
}

/** Text cut at the last sentence (or word) end within max characters, with an ellipsis only if cut. */
export function shortenText(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const head = flat.slice(0, max);
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentence > max * 0.5) return head.slice(0, sentence + 1);
  const word = head.lastIndexOf(' ');
  return (word > 0 ? head.slice(0, word) : head) + '…';
}
