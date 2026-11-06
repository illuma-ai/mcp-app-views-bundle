/**
 * Reads back what `spotlightContent` wrapped. Kept free of Node imports so the interactive views, which
 * are bundled for a browser, can use it to strip the markers before parsing a tool result.
 */
const MARKER = /^<<([0-9a-f]{32})>> \[UNTRUSTED [^\]\n]*\] <<\1>>\n([\s\S]*)\n<<\/\1>>$/;

/** The text inside a spotlight wrapper; text with no wrapper is returned unchanged. */
export function stripSpotlight(text: string): string {
  const match = MARKER.exec(text);
  return match ? match[2] : text;
}
