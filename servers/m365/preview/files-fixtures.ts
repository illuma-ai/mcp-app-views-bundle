/** Fixture OneDrive files for the local view preview. Fictional names only. */
import type { DriveItem } from '../src/views/files/types.js';

const day = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();
const ref = { driveId: 'drive-1', id: 'root', path: '/drive/root:/Projects' };

export function buildFiles(): { root: DriveItem[]; children: Record<string, DriveItem[]> } {
  const root: DriveItem[] = [
    {
      id: 'f-plans',
      name: 'Plans',
      folder: { childCount: 3 },
      lastModifiedDateTime: day(2),
      lastModifiedBy: { user: { displayName: 'Ada Lovelace' } },
      parentReference: ref,
    },
    {
      id: 'f-reports',
      name: 'Reports',
      folder: { childCount: 12 },
      shared: { scope: 'users' },
      lastModifiedDateTime: day(9),
      lastModifiedBy: { user: { displayName: 'Ada Lovelace' } },
      parentReference: ref,
    },
    {
      id: 'i-q3',
      name: 'Q3-plan.pptx',
      size: 2_483_200,
      file: { mimeType: 'application/vnd.ms-powerpoint' },
      lastModifiedDateTime: day(1),
      lastModifiedBy: { user: { displayName: 'Ada Lovelace' } },
      webUrl: 'https://files.example.test/q3',
      '@microsoft.graph.downloadUrl': 'https://files.example.test/dl/q3',
      parentReference: ref,
    },
    {
      id: 'i-budget',
      name: 'Budget 2027.xlsx',
      size: 184_320,
      file: { mimeType: 'application/vnd.ms-excel' },
      lastModifiedDateTime: day(3),
      lastModifiedBy: { user: { displayName: 'Grace Hopper' } },
      webUrl: 'https://files.example.test/budget',
      '@microsoft.graph.downloadUrl': 'https://files.example.test/dl/budget',
      parentReference: ref,
    },
    {
      id: 'i-spec',
      name: 'Spec.pdf',
      size: 912_000,
      file: { mimeType: 'application/pdf' },
      lastModifiedDateTime: day(14),
      lastModifiedBy: { user: { displayName: 'Ada Lovelace' } },
      parentReference: ref,
    },
    {
      id: 'i-notes',
      name: 'meeting-notes.docx',
      size: 20_480,
      file: { mimeType: 'application/msword' },
      lastModifiedDateTime: day(0),
      lastModifiedBy: { user: { displayName: 'Ada Lovelace' } },
      parentReference: ref,
    },
    {
      id: 'i-logo',
      name: 'logo.png',
      size: 48_000,
      file: { mimeType: 'image/png' },
      lastModifiedDateTime: day(40),
      lastModifiedBy: { user: { displayName: 'Ada Lovelace' } },
      parentReference: ref,
    },
  ];
  return {
    root,
    children: {
      'f-plans': [
        {
          id: 'i-roadmap',
          name: 'Roadmap.docx',
          size: 30_000,
          file: { mimeType: 'application/msword' },
          lastModifiedDateTime: day(5),
          lastModifiedBy: { user: { displayName: 'Ada Lovelace' } },
          parentReference: {
            driveId: 'drive-1',
            id: 'f-plans',
            path: '/drive/root:/Projects/Plans',
          },
        },
      ],
      'f-reports': [],
    },
  };
}
