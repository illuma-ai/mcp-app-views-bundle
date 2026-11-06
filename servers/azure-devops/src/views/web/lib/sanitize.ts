/**
 * Allowlist sanitiser for untrusted message HTML.
 *
 * The input is parsed into an inert document (scripts never run, nothing loads), then a brand new
 * tree is built from it: only allowlisted elements and attributes are copied, so no input string
 * ever reaches innerHTML. Remote images are replaced with a placeholder, scripts/styles/forms/
 * frames are removed with their content, URLs are limited to http(s), mailto and tel, and the
 * inline style attribute keeps only a few presentation properties so sender colours and fonts
 * never fight the host theme.
 */

const set = (list: string): Record<string, true> => Object.fromEntries(list.split(" ").map((k) => [k, true as const]));

const ALLOW = set(
  "a abbr b blockquote br caption center code col colgroup dd div dl dt em h1 h2 h3 h4 h5 h6 hr i li ol p pre s small span strike strong sub sup table tbody td tfoot th thead tr u ul"
);
const DROP = set(
  "script style iframe frame frameset object embed applet svg math template noscript head title link meta base form select option textarea button input audio video source track canvas map area dialog"
);
const ACTIVE = set("script iframe frame frameset object embed applet form audio video");
const BLOCK = set("address article aside blockquote br dd div dl dt fieldset figcaption figure footer h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table td th tr ul");

const STYLE_OK: Record<string, RegExp> = {
  "font-weight": /^(normal|bold|[1-9]00)$/,
  "font-style": /^(normal|italic)$/,
  "text-align": /^(left|right|center|justify)$/,
  "text-decoration": /^(none|underline|line-through)$/,
  "vertical-align": /^(top|middle|bottom|baseline)$/,
  "white-space": /^(normal|pre|pre-wrap|nowrap)$/,
};

const DATA_IMAGE = /^data:image\/(png|gif|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i;
const DIMENSION = /^\d{1,4}%?$/;
const MAX_DATA_IMAGE = 2_000_000;

export interface SanitizeStats {
  blockedImages: number;
  /** Scripts, frames, objects, embeds and forms that were removed. */
  blockedActive: number;
  links: number;
}

export interface SanitizedHtml {
  node: HTMLElement;
  stats: SanitizeStats;
}

/** Keeps only allowlisted presentation properties from a style attribute. */
export function cleanStyle(style: string): string {
  const out: string[] = [];
  for (const declaration of style.split(";")) {
    const i = declaration.indexOf(":");
    if (i < 1) continue;
    const property = declaration.slice(0, i).trim().toLowerCase();
    const value = declaration
      .slice(i + 1)
      .trim()
      .toLowerCase();
    if (STYLE_OK[property]?.test(value)) out.push(`${property}:${value}`);
  }
  return out.join(";");
}

/** Returns a cleaned absolute http(s), mailto or tel URL, or null. Relative and script URLs are refused. */
export function safeUrl(url: string): string | null {
  const s = url.replace(/[\u0000- \u007f-\u009f]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!scheme) return null;
  return ["http", "https", "mailto", "tel"].includes(scheme[1].toLowerCase()) ? s : null;
}

function copyChildren(from: Node, to: Node, stats: SanitizeStats): void {
  for (let child = from.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === Node.TEXT_NODE) {
      to.appendChild(document.createTextNode(child.nodeValue ?? ""));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const tag = el.localName;
    if (DROP[tag]) {
      if (ACTIVE[tag]) stats.blockedActive++;
      continue;
    }
    if (tag === "img") {
      appendImage(el, to, stats);
      continue;
    }
    if (!ALLOW[tag]) {
      copyChildren(el, to, stats);
      continue;
    }
    const copy = document.createElement(tag);
    copyAttributes(el, copy, stats);
    copyChildren(el, copy, stats);
    to.appendChild(copy);
  }
}

function appendImage(el: Element, to: Node, stats: SanitizeStats): void {
  const src = el.getAttribute("src") ?? "";
  if (src.length < MAX_DATA_IMAGE && DATA_IMAGE.test(src)) {
    const img = document.createElement("img");
    img.setAttribute("src", src);
    img.setAttribute("alt", el.getAttribute("alt") ?? "");
    for (const name of ["width", "height"]) {
      const v = el.getAttribute(name);
      if (v && DIMENSION.test(v)) img.setAttribute(name, v);
    }
    to.appendChild(img);
    return;
  }
  stats.blockedImages++;
  const alt = el.getAttribute("alt");
  const placeholder = document.createElement("span");
  placeholder.className = "k-blocked-image";
  placeholder.textContent = alt ? `[image blocked: ${alt.slice(0, 80)}]` : "[image blocked]";
  to.appendChild(placeholder);
}

function copyAttributes(from: Element, to: Element, stats: SanitizeStats): void {
  const tag = from.localName;
  for (const attr of Array.from(from.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    if (name === "href" && tag === "a") {
      const safe = safeUrl(value);
      if (safe) {
        to.setAttribute("href", safe);
        to.setAttribute("rel", "noopener noreferrer");
        stats.links++;
      }
    } else if (name === "title" || name === "lang") to.setAttribute(name, value.slice(0, 300));
    else if (name === "dir" && /^(ltr|rtl|auto)$/i.test(value)) to.setAttribute(name, value.toLowerCase());
    else if (name === "align" && /^(left|right|center|justify)$/i.test(value)) {
      to.setAttribute(name, value.toLowerCase());
    } else if ((name === "colspan" || name === "rowspan") && /^\d{1,3}$/.test(value)) {
      to.setAttribute(name, value);
    } else if ((name === "width" || name === "height") && DIMENSION.test(value)) {
      to.setAttribute(name, value);
    } else if (name === "style") {
      const style = cleanStyle(value);
      if (style) to.setAttribute("style", style);
    }
  }
}

/** Builds a detached `.k-body` element from untrusted HTML. */
export function sanitizeHtml(html: string): SanitizedHtml {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const node = document.createElement("div");
  node.className = "k-body";
  const stats: SanitizeStats = { blockedImages: 0, blockedActive: 0, links: 0 };
  if (parsed.body) copyChildren(parsed.body, node, stats);
  return { node, stats };
}

/** Plain-text rendition of HTML, used when the user chooses to edit an HTML body as text. */
export function htmlToText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  let out = "";
  const newline = (): void => {
    if (out && !out.endsWith("\n")) out += "\n";
  };
  const walk = (node: Node): void => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child.nodeValue ?? "").replace(/\s+/g, " ");
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = (child as Element).localName;
      if (DROP[tag]) continue;
      if (tag === "br") {
        out += "\n";
        continue;
      }
      if (BLOCK[tag]) newline();
      if (tag === "li") out += "- ";
      walk(child);
      if (BLOCK[tag]) newline();
    }
  };
  walk(parsed.body ?? parsed);
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
