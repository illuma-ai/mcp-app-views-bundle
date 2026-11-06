/** File explorer logic with no UI: kinds, ordering and path pieces. */
import type { DriveItem } from './types.js';

export type FileKind =
  | 'folder'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'image'
  | 'text'
  | 'archive'
  | 'file';

const BY_EXTENSION: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  xls: 'excel',
  xlsx: 'excel',
  csv: 'excel',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  txt: 'text',
  md: 'text',
  zip: 'archive',
};

/** The kind that picks an item's icon. */
export function fileKind(item: DriveItem): FileKind {
  if (item.folder) return 'folder';
  const ext = (item.name ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (BY_EXTENSION[ext]) return BY_EXTENSION[ext];
  const mime = item.file?.mimeType ?? '';
  return mime.startsWith('image/') ? 'image' : mime.startsWith('text/') ? 'text' : 'file';
}

/** Folders first, then by name, ignoring case. */
export function sortItems(items: DriveItem[]): DriveItem[] {
  return [...items].sort(
    (a, b) =>
      Number(Boolean(b.folder)) - Number(Boolean(a.folder)) ||
      (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' })
  );
}

/** The folder name at the end of a Graph parent path ("/drive/root:/Docs/Plans" gives "Plans"). */
export function folderNameFromPath(path: string | undefined): string | undefined {
  const after = path?.split('root:')[1];
  const parts = (after ?? '').split('/').filter(Boolean);
  return parts.length ? decodeURIComponent(parts[parts.length - 1]) : undefined;
}

/** A name that is safe to send: trimmed, no path separators or reserved characters. */
export function validName(name: string): boolean {
  const t = name.trim();
  return t.length > 0 && t.length <= 255 && !/[\\/:*?"<>|]/.test(t) && t !== '.' && t !== '..';
}

/** "0 items", "1 item", "6 items": the File size cell of a folder. */
export function itemCount(n: number | undefined): string {
  const count = n ?? 0;
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

/** The Sharing cell: "Shared" when the item is shared, else "Private". */
export function sharingLabel(item: DriveItem): 'Shared' | 'Private' {
  return item.shared ? 'Shared' : 'Private';
}

/** Kinds the type filter offers, in the order the buttons appear. */
export const TYPE_FILTERS: ReadonlyArray<{ kind: FileKind; label: string }> = [
  { kind: 'word', label: 'Word' },
  { kind: 'excel', label: 'Excel' },
  { kind: 'powerpoint', label: 'PowerPoint' },
  { kind: 'pdf', label: 'PDF' },
];

/** Applies the name text and the type filter; folders stay visible only without a type filter. */
export function filterItems(items: DriveItem[], name: string, kind: FileKind | null): DriveItem[] {
  const q = name.trim().toLowerCase();
  return items.filter(
    (i) => (!q || (i.name ?? '').toLowerCase().includes(q)) && (!kind || fileKind(i) === kind)
  );
}
