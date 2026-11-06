// @vitest-environment happy-dom
import { act, useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { fileKind, folderNameFromPath, sortItems, validName } from '../src/views/files/logic.js';
import type { DriveItem } from '../src/views/files/types.js';
import { FileDetail, FilesView } from '../src/views/ui/FilesView.js';
import {
  ACTIONS,
  WRITE_TOOLS,
  byLabel,
  byText,
  click,
  fakeHost,
  mountView,
  type,
  type Mounted,
} from './helpers/view-harness.js';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
});

const ref = { driveId: 'd1', id: 'root', path: '/drive/root:/Projects' };
const ITEMS: DriveItem[] = [
  {
    id: 'i1',
    name: 'b.xlsx',
    size: 2048,
    file: {},
    lastModifiedDateTime: '2026-10-20T10:00:00Z',
    parentReference: ref,
  },
  { id: 'f1', name: 'Plans', folder: { childCount: 3 }, parentReference: ref },
  {
    id: 'i2',
    name: 'a.pdf',
    size: 10,
    file: {},
    '@microsoft.graph.downloadUrl': 'https://x.test/dl',
    webUrl: 'https://x.test/w',
    parentReference: ref,
  },
];
const MEETINGS: DriveItem = {
  id: 'f2',
  name: 'Meetings',
  folder: { childCount: 1 },
  shared: { scope: 'users' },
  lastModifiedDateTime: `${new Date().getFullYear()}-03-10T12:00:00Z`,
  lastModifiedBy: { user: { displayName: 'Ada Lovelace' } },
  parentReference: ref,
};
const writes = (calls: Array<{ name: string }>) =>
  calls.filter((c) => WRITE_TOOLS.includes(c.name));

describe('files logic', () => {
  it('picks kinds, sorts folders first and validates names', () => {
    expect(fileKind({ name: 'x.DOCX' })).toBe('word');
    expect(fileKind({ name: 'x', folder: {} })).toBe('folder');
    expect(fileKind({ name: 'x', file: { mimeType: 'image/heic' } })).toBe('image');
    expect(sortItems(ITEMS).map((i) => i.name)).toEqual(['Plans', 'a.pdf', 'b.xlsx']);
    expect(folderNameFromPath('/drive/root:/Docs/My%20Plans')).toBe('My Plans');
    expect(folderNameFromPath('/drive/root:')).toBeUndefined();
    expect(validName('ok.txt')).toBe(true);
    for (const bad of ['', ' ', 'a/b', 'a:b', '..']) expect(validName(bad)).toBe(false);
  });
});

describe('files explorer', () => {
  it('shows the reference words, breadcrumb and folders first, and never writes while browsing', async () => {
    const { calls, api } = fakeHost((name) =>
      name === ACTIONS.filesList ? { value: [{ id: 'c1', name: 'Roadmap.docx', file: {} }] } : {}
    );
    mounted = await mountView(
      <FilesView args={{}} received result={{ value: [...ITEMS, MEETINGS] }} />,
      api
    );
    const text = mounted.container.textContent ?? '';
    for (const w of [
      'My files',
      'Projects',
      'Create or upload',
      'Details',
      'Name',
      'Modified',
      'Modified By',
      'File size',
      'Sharing',
      'Activity',
      'Private',
      'Shared',
      '3 items',
      '1 item',
      'March 10',
    ]) {
      expect(text, w).toContain(w);
    }
    expect(byLabel(mounted.container, 'Search')).toBeTruthy();
    expect(byLabel(mounted.container, 'List view')).toBeTruthy();
    const names = Array.from(mounted.container.querySelectorAll('[role=listitem] button')).map(
      (b) => b.getAttribute('aria-label')
    );
    expect(names[0]).toBe('Meetings, folder');
    expect(text).toContain('Ada Lovelace');
    // nothing is selected, so the selection commands are not offered yet
    expect(byText(mounted.container, 'button', 'Delete')).toBeUndefined();
    await click(byLabel(mounted.container, 'Grid view'));
    await click(byLabel(mounted.container, 'List view'));
    await click(byLabel(mounted.container, 'Plans, folder'));
    expect(calls.map((c) => c.name)).toEqual([ACTIONS.filesList]);
    expect(mounted.container.textContent).toContain('Roadmap.docx');
    expect(writes(calls)).toEqual([]);
  });

  it('shows the empty folder words', async () => {
    const { api } = fakeHost();
    mounted = await mountView(<FilesView args={{}} received result={{ value: [] }} />, api);
    expect(mounted.container.textContent).toContain('This folder is empty');
  });

  it('deletes only when Delete is pressed, with confirm: true, and selecting writes nothing', async () => {
    const { calls, api } = fakeHost((name) => (name === ACTIONS.filesList ? { value: ITEMS } : {}));
    mounted = await mountView(<FilesView args={{}} received result={{ value: ITEMS }} />, api);
    await click(byLabel(mounted.container, 'Select b.xlsx'));
    expect(writes(calls)).toEqual([]);
    await click(byText(mounted.container, 'button', 'Delete'));
    expect(writes(calls)).toHaveLength(1);
    expect(calls.find((c) => c.name === ACTIONS.fileDelete)?.args).toMatchObject({
      driveItemId: 'i1',
      confirm: true,
    });
  });

  it('renames only after the name is entered and Rename in the form is pressed', async () => {
    const { calls, api } = fakeHost((name) => (name === ACTIONS.filesList ? { value: ITEMS } : {}));
    mounted = await mountView(<FilesView args={{}} received result={{ value: ITEMS }} />, api);
    await click(byLabel(mounted.container, 'Select b.xlsx'));
    await click(byText(mounted.container, 'button', 'Rename'));
    expect(writes(calls)).toEqual([]);
    await type(byLabel(mounted.container, 'New name') as HTMLInputElement, 'c.xlsx');
    expect(writes(calls)).toEqual([]);
    const buttons = Array.from(mounted.container.querySelectorAll('button')).filter(
      (b) => b.textContent === 'Rename'
    );
    await click(buttons[buttons.length - 1]);
    expect(calls.find((c) => c.name === ACTIONS.fileUpdate)?.args).toMatchObject({
      body: { name: 'c.xlsx' },
      confirm: true,
    });
  });

  it('creates a folder only after Create is pressed', async () => {
    const { calls, api } = fakeHost((name) => (name === ACTIONS.filesList ? { value: ITEMS } : {}));
    mounted = await mountView(<FilesView args={{}} received result={{ value: ITEMS }} />, api);
    await click(byText(mounted.container, 'button', 'Create or upload'));
    const upload = byText(document.body, '[role=menuitem]', 'Upload') as HTMLElement;
    expect(upload.getAttribute('aria-disabled')).toBe('true');
    expect(upload.title).toContain('device');
    await click(byText(document.body, '[role=menuitem]', 'New folder'));
    await type(byLabel(mounted.container, 'Folder name') as HTMLInputElement, 'Archive');
    expect(writes(calls)).toEqual([]);
    await click(byText(mounted.container, 'button', 'Create'));
    expect(calls.find((c) => c.name === ACTIONS.folderCreate)?.args).toMatchObject({
      confirm: true,
      body: { name: 'Archive' },
    });
  });

  it('disables commands whose tool is not enabled', async () => {
    const { host } = fakeHost();
    const { MailApi } = await import('../src/views/mail/api.js');
    const api = new MailApi(host, { filesList: 'tool-files-list' });
    mounted = await mountView(<FilesView args={{}} received result={{ value: ITEMS }} />, api);
    await click(byLabel(mounted.container, 'Select b.xlsx'));
    for (const l of ['Rename', 'Delete']) {
      expect((byText(mounted.container, 'button', l) as HTMLButtonElement).disabled, l).toBe(true);
    }
    await click(byText(mounted.container, 'button', 'Create or upload'));
    expect(
      (byText(document.body, '[role=menuitem]', 'New folder') as HTMLElement).getAttribute(
        'aria-disabled'
      )
    ).toBe('true');
  });
});

describe('file detail', () => {
  it('opens and downloads through the host links and deletes only on its button', async () => {
    const { host, calls, api } = fakeHost();
    mounted = await mountView(<FileDetail item={ITEMS[2]} />, api);
    expect(writes(calls)).toEqual([]);
    await click(byText(mounted.container, 'button', 'Download'));
    expect(host.openLink).toHaveBeenCalledWith('https://x.test/dl');
    await click(byText(mounted.container, 'button', 'Open'));
    expect(host.openLink).toHaveBeenCalledWith('https://x.test/w');
    await click(byText(mounted.container, 'button', 'Delete'));
    expect(calls.at(-1)).toMatchObject({ name: ACTIONS.fileDelete, args: { confirm: true } });
  });
});

describe('files view opened the way the host opens it', () => {
  it('uses the drive and folder from a tool input that arrives after mount, even for an empty folder', async () => {
    let push: (next: { args: Record<string, unknown>; received: boolean }) => void = () =>
      undefined;
    const Live = (): ReactElement => {
      const [s, set] = useState<{ args: Record<string, unknown>; received: boolean }>({
        args: {},
        received: false,
      });
      push = set;
      return (
        <FilesView
          args={s.args}
          received={s.received}
          result={s.received ? { value: [] } : undefined}
        />
      );
    };
    const { calls, api } = fakeHost();
    mounted = await mountView(<Live />, api);
    const input = { driveId: 'D9', driveItemId: 'F9' };
    await act(async () => push({ args: input, received: false }));
    await act(async () => push({ args: input, received: true }));
    await click(byText(mounted.container, 'button', 'Create or upload'));
    await click(byText(document.body, '[role=menuitem]', 'New folder'));
    await type(byLabel(mounted.container, 'Folder name') as HTMLInputElement, 'Archive');
    await click(byText(mounted.container, 'button', 'Create'));
    expect(calls.find((c) => c.name === ACTIONS.folderCreate)?.args).toMatchObject({
      driveId: 'D9',
      driveItemId: 'F9',
      confirm: true,
    });
  });
});
