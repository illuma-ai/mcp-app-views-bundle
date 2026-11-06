/**
 * Reading tool results inside a view.
 *
 * Every Azure DevOps tool result is wrapped by the server in a "spotlight" boundary
 * (`<<nonce>> [UNTRUSTED ... CONTENT ...] <<nonce>>` ... `<</nonce>>`) so a model can tell data from
 * instructions. The views want the JSON inside, so the boundary lines are removed here. The wrapper
 * itself is untouched on the wire: tool output stays byte-identical with or without views.
 */

export interface ToolResultLike {
  content?: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

export interface ParsedResult<T = unknown> {
  data?: T;
  text?: string;
  error?: string;
}

const OPEN = /^<<([0-9a-f]{16,})>>[^\n]*\n/;

/** Removes the spotlight boundary from one text block; text without a boundary is returned as is. */
export function stripSpotlight(text: string): string {
  const open = OPEN.exec(text);
  if (!open) return text;
  const nonce = open[1];
  const rest = text.slice(open[0].length);
  const close = `\n<</${nonce}>>`;
  return rest.endsWith(close) ? rest.slice(0, -close.length) : rest;
}

/** Joins the text blocks of a result with the boundaries removed. */
export function resultText(res: ToolResultLike | undefined): string {
  return (res?.content ?? [])
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => stripSpotlight(c.text as string))
    .join("\n");
}

/** JSON data when the text parses, the error text for a failed call, else the raw text. */
export function parseToolResult<T = unknown>(res: ToolResultLike | undefined): ParsedResult<T> {
  if (!res) return { error: "No result received." };
  const text = resultText(res);
  if (res.isError) return { error: text || "The tool reported an error." };
  if (res.structuredContent && typeof res.structuredContent === "object") {
    return { data: res.structuredContent as T, text };
  }
  // Some tools return a short label block before the JSON block; try the last block first.
  const blocks = (res.content ?? []).filter((c) => c?.type === "text" && typeof c.text === "string").map((c) => stripSpotlight(c.text as string));
  for (const candidate of [...blocks].reverse().concat(text)) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed !== null && typeof parsed === "object") return { data: parsed as T, text };
    } catch {
      /* try the next candidate */
    }
  }
  return { text };
}
