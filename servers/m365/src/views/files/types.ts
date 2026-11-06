/** Shapes of the Microsoft Graph drive resources the views read. Every field is optional. */

export interface DriveItem {
  id?: string;
  name?: string;
  size?: number;
  webUrl?: string;
  lastModifiedDateTime?: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  folder?: { childCount?: number };
  /** Present when the item is shared with anyone. */
  shared?: Record<string, unknown>;
  file?: { mimeType?: string };
  parentReference?: { driveId?: string; id?: string; path?: string };
  '@microsoft.graph.downloadUrl'?: string;
}

/** Tool roles the file views may call back (see actions.ts). */
export interface FilesActions {
  filesList?: string;
  fileGet?: string;
  fileSearch?: string;
  fileUpdate?: string;
  fileDelete?: string;
  folderCreate?: string;
}
