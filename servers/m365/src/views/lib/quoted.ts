/**
 * Reply and forward drafts arrive with the original message quoted below a marker. The composer
 * shows only the part the user writes and keeps the quoted history collapsed.
 */

const MARKER = /<div[^>]*\bid=["']divRplyFwdMsg["']/i;

export interface SplitBody {
  /** The part above the quoted history (what the user writes). */
  top: string;
  /** The quoted history, including its separator, or '' when there is none. */
  quoted: string;
}

/** Splits an HTML draft body at the quoted-history marker; null when there is no marker. */
export function splitQuoted(html: string): SplitBody | null {
  const m = MARKER.exec(html);
  if (!m) return null;
  let cut = m.index;
  // The separator rule sits directly above the marker; keep it with the quoted part.
  const hr = html.slice(0, cut).search(/<hr[^>]*>\s*$/i);
  if (hr >= 0) cut = hr;
  return { top: html.slice(0, cut), quoted: html.slice(cut) };
}

/** Escapes plain text into HTML paragraphs-by-line for a rich draft body. */
export function textToHtml(text: string): string {
  if (!text.trim()) return '';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div>${escaped.replace(/\r?\n/g, '<br>')}</div>`;
}

export interface OriginalMessage {
  from: string;
  to: string;
  sent: string;
  /** The original body without its header block, as HTML to be sanitised before display. */
  bodyHtml: string;
}

/** Reads the header block (From, Sent, To) and body out of a quoted reply/forward history. */
export function parseOriginal(quoted: string): OriginalMessage | null {
  const doc = new DOMParser().parseFromString(quoted, 'text/html');
  const header = doc.getElementById('divRplyFwdMsg');
  if (!header) return null;
  const lines = (
    header.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') || ''
  ).split('\n');
  const field = (label: string): string => {
    const line = lines.find((l) =>
      l
        .trim()
        .toLowerCase()
        .startsWith(label.toLowerCase() + ':')
    );
    return line
      ? line
          .slice(line.indexOf(':') + 1)
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim()
      : '';
  };
  const out = { from: field('From'), to: field('To'), sent: field('Sent') || field('Date') };
  header.remove();
  doc.querySelectorAll('hr').forEach((hr) => hr.remove());
  return { ...out, bodyHtml: doc.body.innerHTML };
}
