/**
 * OneDrive explorer: breadcrumb, list or grid of the current folder, type icons, size and modified
 * time, a command bar and a file detail panel.
 *
 * Browsing and searching are reads. New folder, Rename, Move to and Delete are explicit buttons that
 * make App-initiated tool calls, so the host asks the user to approve each with its full arguments.
 * Download and Open use the links Graph returns (opened through the host); nothing is uploaded from
 * here because a view cannot pick a local file.
 */
import {
  Button,
  Checkbox,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Spinner,
  ToggleButton,
  Toolbar,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowDownload20Regular,
  ArrowLeft20Regular,
  Delete20Regular,
  Document20Regular,
  DocumentPdf20Regular,
  Folder20Filled,
  FolderAdd20Regular,
  FolderArrowRight20Regular,
  Image20Regular,
  Open20Regular,
  Rename20Regular,
  SlideText20Regular,
  TableSimple20Regular,
  TextDescription20Regular,
  ChevronRight16Regular,
  ChevronDown12Regular,
  Add20Regular,
  Filter20Regular,
  Info20Regular,
  People16Regular,
  Grid20Regular,
  TextBulletList20Regular,
  FolderZip20Regular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMonthDay, formatSize } from '../lib/format.js';
import {
  TYPE_FILTERS,
  fileKind,
  filterItems,
  folderNameFromPath,
  itemCount,
  sharingLabel,
  sortItems,
  validName,
  type FileKind,
} from '../files/logic.js';
import type { DriveItem } from '../files/types.js';
import type { Page } from '../mail/types.js';
import { IconButton, useAction, useApi } from './shared.js';

/** Name, Modified, Modified By, File size, Sharing (Activity joins when there is room). */
const COLS = '24px minmax(0, 1fr) 104px 64px';
const COLS_MID = '24px minmax(0, 1fr) 104px 120px 64px 72px';
const COLS_WIDE = `${COLS_MID} 72px`;

const useStyles = makeStyles({
  app: { backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1 },
  cmd: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    minHeight: '44px',
  },
  crumbs: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    fontSize: tokens.fontSizeBase400,
  },
  crumb: {
    border: 'none',
    background: 'transparent',
    color: tokens.colorNeutralForeground2,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase400,
    cursor: 'pointer',
    padding: tokens.spacingHorizontalXS,
    borderRadius: tokens.borderRadiusSmall,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  current: { color: tokens.colorNeutralForeground1, fontWeight: tokens.fontWeightSemibold },
  // The primary command is 36px high, taller than a default button.
  create: { height: '36px', minHeight: '36px' },
  grow: { flexGrow: 1 },
  head: {
    display: 'grid',
    gridTemplateColumns: COLS,
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    padding: `0 ${tokens.spacingHorizontalM} 0 36px`,
    boxSizing: 'border-box',
    height: '49px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    '@media (min-width: 560px)': { gridTemplateColumns: COLS_MID },
    '@media (min-width: 900px)': { gridTemplateColumns: COLS_WIDE },
  },
  headCell: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXXS },
  // Modified By and Sharing need 560px, Activity 900px; narrower frames keep Name, Modified, File size.
  mid: { display: 'none', '@media (min-width: 560px)': { display: 'block' } },
  activity: { display: 'none', '@media (min-width: 900px)': { display: 'block' } },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} 0`,
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: COLS,
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '48px',
    padding: `0 ${tokens.spacingHorizontalM} 0 0`,
    border: 'none',
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground1,
    textAlign: 'left',
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightRegular,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    '@media (min-width: 560px)': { gridTemplateColumns: COLS_MID },
    '@media (min-width: 900px)': { gridTemplateColumns: COLS_WIDE },
  },
  rowWrap: {
    display: 'grid',
    gridTemplateColumns: '32px minmax(0, 1fr)',
    alignItems: 'center',
    paddingLeft: tokens.spacingHorizontalXS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  selected: {
    backgroundColor: tokens.colorBrandBackground2Hover,
    ':hover': { backgroundColor: tokens.colorBrandBackground2Hover },
  },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  muted: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'nowrap',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalM,
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase200,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  big: { width: '40px', height: '40px' },
  state: {
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  foot: {
    display: 'flex',
    padding: tokens.spacingHorizontalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  detail: { display: 'grid', rowGap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalM },
  detailHead: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM },
  folderIcon: { color: tokens.colorPaletteMarigoldForeground2 },
  form: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    padding: tokens.spacingHorizontalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

const ICONS: Record<FileKind, ReactElement> = {
  folder: <Folder20Filled />,
  pdf: <DocumentPdf20Regular />,
  word: <Document20Regular />,
  excel: <TableSimple20Regular />,
  powerpoint: <SlideText20Regular />,
  image: <Image20Regular />,
  text: <TextDescription20Regular />,
  archive: <FolderZip20Regular />,
  file: <Document20Regular />,
};

function TypeIcon({ item, large }: { item: DriveItem; large?: boolean }): ReactElement {
  const s = useStyles();
  const kind = fileKind(item);
  return (
    <span
      className={mergeClasses(kind === 'folder' && s.folderIcon, large && s.big)}
      aria-hidden
      style={large ? { fontSize: 40, display: 'inline-flex' } : { display: 'inline-flex' }}
    >
      {ICONS[kind]}
    </span>
  );
}

interface Crumb {
  id: string;
  name: string;
}

export interface FilesViewProps {
  args: Record<string, unknown>;
  result?: Page<DriveItem>;
  error?: string;
  received: boolean;
}

export function FilesView({
  args,
  result,
  error: resultError,
  received,
}: FilesViewProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  // The drive the tool call named (its input can arrive after the view mounted, so it is read on
  // every render), else the one the listed items belong to.
  const [seenDrive, setSeenDrive] = useState<string | undefined>();
  const driveId = typeof args.driveId === 'string' ? args.driveId : seenDrive;
  const [crumbs, setCrumbs] = useState<Crumb[]>([
    { id: typeof args.driveItemId === 'string' ? args.driveItemId : 'root', name: 'My files' },
  ]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'grid'>('list');
  const [selected, setSelected] = useState<DriveItem | null>(null);
  const [detail, setDetail] = useState<DriveItem | null>(null);
  const [naming, setNaming] = useState<null | 'folder' | 'rename'>(null);
  const [nameValue, setNameValue] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<FileKind | null>(null);
  const [nameFilter, setNameFilter] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const { busy, error: actionError, run } = useAction();
  const seen = useRef(new Set<string>());

  const ingest = (page: Page<DriveItem>, replace: boolean): void => {
    if (replace) seen.current.clear();
    const fresh = (page.value ?? []).filter((i) => {
      if (!i || typeof i !== 'object') return false;
      if (i.id) {
        if (seen.current.has(i.id)) return false;
        seen.current.add(i.id);
      }
      return true;
    });
    setItems((cur) => (replace ? fresh : [...cur, ...fresh]));
    setNext(page['@odata.nextLink'] ?? null);
    const drive = fresh.find((i) => i.parentReference?.driveId)?.parentReference?.driveId;
    if (drive) setSeenDrive((cur) => cur ?? drive);
    return;
  };

  // The tool result that created this view.
  useEffect(() => {
    if (!received) return;
    if (resultError) {
      setError(resultError);
      return;
    }
    if (!result || !Array.isArray(result.value)) {
      setError('The result is not a file list.');
      return;
    }
    setError(null);
    ingest(result, true);
    const here = folderNameFromPath(
      result.value.find((i) => i.parentReference?.path)?.parentReference?.path
    );
    // The folder the call listed is where New folder and the other commands act, even when it is empty.
    const folder = typeof args.driveItemId === 'string' ? args.driveItemId : 'root';
    if (here || folder !== 'root')
      setCrumbs([
        { id: 'root', name: 'My files' },
        { id: folder, name: here ?? 'Folder' },
      ]);
  }, [result, resultError, received]);

  const open = (folderId: string, nextCrumbs: Crumb[]): void => {
    if (loading) return;
    setLoading(true);
    setError(null);
    api
      .call<Page<DriveItem>>('filesList', { driveId, driveItemId: folderId, top: 25 })
      .then((page) => {
        ingest(page, true);
        setCrumbs(nextCrumbs);
        setSelected(null);
        setNaming(null);
        setQuery('');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const current = crumbs[crumbs.length - 1];
  const reload = (): void => open(current.id, crumbs);

  const loadMore = (): void => {
    if (loading || !next) return;
    setLoading(true);
    api
      .call<Page<DriveItem>>('filesList', {
        driveId,
        driveItemId: current.id,
        top: 25,
        skiptoken: next,
      })
      .then((page) => ingest(page, false))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const search = (): void => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    api
      .call<Page<DriveItem>>('fileSearch', { driveId, q })
      .then((page) => {
        ingest(page, true);
        setCrumbs([
          { id: 'root', name: 'My files' },
          { id: 'search', name: `Search: ${q}` },
        ]);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const activate = (item: DriveItem): void => {
    if (item.folder && item.id)
      open(item.id, [...crumbs, { id: item.id, name: item.name ?? 'Folder' }]);
    else setDetail(item);
  };

  const sorted = useMemo(
    () => filterItems(sortItems(items), nameFilter ?? '', typeFilter),
    [items, nameFilter, typeFilter]
  );

  // ---- explicit write actions: each is one button, one confirmed call ----
  const createFolder = (): void =>
    run(async () => {
      await api.call('folderCreate', {
        driveId,
        driveItemId: current.id,
        body: { name: nameValue.trim(), folder: {}, '@microsoft.graph.conflictBehavior': 'rename' },
        confirm: true,
      });
      setNaming(null);
      setNameValue('');
      reload();
    }, 'Could not create the folder');
  const rename = (): void =>
    run(async () => {
      await api.call('fileUpdate', {
        driveId,
        driveItemId: selected?.id,
        body: { name: nameValue.trim() },
        confirm: true,
      });
      setNaming(null);
      reload();
    }, 'Could not rename');
  const moveTo = (folder: DriveItem): void =>
    run(async () => {
      await api.call('fileUpdate', {
        driveId,
        driveItemId: selected?.id,
        body: { parentReference: { id: folder.id } },
        confirm: true,
      });
      setSelected(null);
      reload();
    }, 'Could not move');
  const remove = (): void =>
    run(async () => {
      await api.call('fileDelete', { driveId, driveItemId: selected?.id, confirm: true });
      setItems((cur) => cur.filter((i) => i.id !== selected?.id));
      setSelected(null);
    }, 'Could not delete');

  if (detail) {
    return (
      <div className={s.app}>
        <FileDetail
          item={detail}
          onBack={() => setDetail(null)}
          onDeleted={() => {
            setItems((cur) => cur.filter((i) => i.id !== detail.id));
            setDetail(null);
          }}
          driveId={driveId}
        />
      </div>
    );
  }

  const link = selected?.['@microsoft.graph.downloadUrl'];
  const folders = sorted.filter((i) => i.folder && i.id !== selected?.id);
  const writeReady = Boolean(selected?.id) && !busy;
  const atRoot = crumbs.length === 1;

  return (
    <div className={s.app}>
      <div className={s.title} data-sticky="top">
        {atRoot ? (
          <>
            <span>{crumbs[0].name}</span>
            <ChevronDown12Regular aria-hidden />
          </>
        ) : null}
        <span className={s.grow} />
        <Input
          type="search"
          placeholder="Search"
          aria-label="Search"
          value={query}
          disabled={!api.can('fileSearch')}
          onChange={(_, d) => setQuery(d.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
      </div>
      <Toolbar className={s.cmd} data-sticky="top" aria-label="File commands">
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button
              appearance="primary"
              shape="rounded"
              className={s.create}
              icon={<Add20Regular />}
              disabled={busy}
            >
              Create or upload
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem
                icon={<FolderAdd20Regular />}
                disabled={!api.can('folderCreate')}
                onClick={() => {
                  setNaming('folder');
                  setNameValue('');
                }}
              >
                New folder
              </MenuItem>
              <MenuItem
                icon={<ArrowDownload20Regular />}
                disabled
                title="A view cannot pick a file from your device"
              >
                Upload
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
        {selected && (
          <>
            <Button
              appearance="subtle"
              icon={<ArrowDownload20Regular />}
              disabled={!link || !api.host.canOpenLinks()}
              onClick={() => link && api.openLink(link)}
            >
              Download
            </Button>
            <Button
              appearance="subtle"
              icon={<Rename20Regular />}
              disabled={!writeReady || !api.can('fileUpdate')}
              onClick={() => {
                setNaming('rename');
                setNameValue(selected?.name ?? '');
              }}
            >
              Rename
            </Button>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  icon={<FolderArrowRight20Regular />}
                  disabled={!writeReady || !api.can('fileUpdate') || folders.length === 0}
                >
                  Move to
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {folders.map((f) => (
                    <MenuItem key={f.id} icon={<Folder20Filled />} onClick={() => moveTo(f)}>
                      {f.name}
                    </MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
            <Button
              appearance="subtle"
              icon={<Delete20Regular />}
              disabled={!writeReady || !api.can('fileDelete')}
              onClick={remove}
            >
              Delete
            </Button>
          </>
        )}
        <span className={s.grow} />
        <ToggleButton
          appearance="subtle"
          icon={<TextBulletList20Regular />}
          checked={mode === 'list'}
          aria-label="List view"
          onClick={() => setMode('list')}
        />
        <ToggleButton
          appearance="subtle"
          icon={<Grid20Regular />}
          checked={mode === 'grid'}
          aria-label="Grid view"
          onClick={() => setMode('grid')}
        />
        <Button
          appearance="outline"
          icon={<Info20Regular />}
          disabled={!selected}
          aria-pressed={details}
          onClick={() => setDetails((v) => !v)}
        >
          Details
        </Button>
      </Toolbar>
      <div className={s.filters} data-sticky="top" role="toolbar" aria-label="Filters">
        <ToggleButton
          appearance="subtle"
          shape="circular"
          icon={<Filter20Regular />}
          checked={nameFilter !== null}
          aria-label="Filter by name"
          onClick={() => setNameFilter((v) => (v === null ? '' : null))}
        />
        {nameFilter !== null && (
          <Input
            aria-label="Filter by name text"
            placeholder="Filter by name"
            value={nameFilter}
            onChange={(_, d) => setNameFilter(d.value)}
          />
        )}
        {TYPE_FILTERS.map((f) => (
          <ToggleButton
            key={f.kind}
            appearance="subtle"
            shape="circular"
            icon={<span aria-hidden>{ICONS[f.kind]}</span>}
            checked={typeFilter === f.kind}
            aria-label={f.label}
            title={f.label}
            onClick={() => setTypeFilter((v) => (v === f.kind ? null : f.kind))}
          />
        ))}
      </div>
      {!atRoot && (
        <nav className={s.crumbs} aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={`${c.id}-${i}`}>
              {i > 0 && <ChevronRight16Regular aria-hidden />}
              {i === crumbs.length - 1 ? (
                <span className={mergeClasses(s.crumb, s.current)} aria-current="page">
                  {c.name}
                </span>
              ) : (
                <button
                  type="button"
                  className={s.crumb}
                  disabled={loading}
                  onClick={() => open(c.id, crumbs.slice(0, i + 1))}
                >
                  {c.name}
                </button>
              )}
            </span>
          ))}
          {loading && <Spinner size="tiny" />}
        </nav>
      )}
      {atRoot && loading && <Spinner size="tiny" />}
      {naming && (
        <div className={s.form}>
          <Input
            autoFocus
            aria-label={naming === 'folder' ? 'Folder name' : 'New name'}
            placeholder={naming === 'folder' ? 'Folder name' : 'Name'}
            value={nameValue}
            onChange={(_, d) => setNameValue(d.value)}
          />
          <Button
            appearance="primary"
            disabled={!validName(nameValue) || busy}
            onClick={naming === 'folder' ? createFolder : rename}
          >
            {naming === 'folder' ? 'Create' : 'Rename'}
          </Button>
          <Button appearance="outline" onClick={() => setNaming(null)}>
            Cancel
          </Button>
        </div>
      )}
      {(error || actionError) && (
        <MessageBar intent="error">
          <MessageBarBody>{error ?? actionError}</MessageBarBody>
        </MessageBar>
      )}
      {details && selected && (
        <FileDetail
          item={selected}
          driveId={driveId}
          onDeleted={() => {
            setItems((cur) => cur.filter((i) => i.id !== selected.id));
            setSelected(null);
            setDetails(false);
          }}
        />
      )}
      {sorted.length === 0 ? (
        <p className={s.state} role="status">
          {loading
            ? 'Loading\u2026'
            : received
              ? 'This folder is empty'
              : 'Waiting for files\u2026'}
        </p>
      ) : mode === 'list' ? (
        <div role="list" aria-label="Files">
          <div className={s.head} aria-hidden>
            <span />
            {['Name', 'Modified', 'Modified By', 'File size', 'Sharing'].map((h) => (
              <span
                key={h}
                className={mergeClasses(
                  s.headCell,
                  (h === 'Modified By' || h === 'Sharing') && s.mid
                )}
              >
                {h}
                <ChevronDown12Regular />
              </span>
            ))}
            <span className={s.activity}>Activity</span>
          </div>
          {sorted.map((i) => (
            <div
              key={i.id}
              role="listitem"
              className={mergeClasses(s.rowWrap, selected?.id === i.id && s.selected)}
            >
              <Checkbox
                aria-label={`Select ${i.name}`}
                checked={selected?.id === i.id}
                onChange={(_, d) => setSelected(d.checked ? i : null)}
              />
              <button
                type="button"
                className={s.row}
                onClick={() => activate(i)}
                aria-label={`${i.name}${i.folder ? ', folder' : ''}`}
              >
                <TypeIcon item={i} />
                <span className={s.name}>{i.name}</span>
                <span className={s.name}>{formatMonthDay(i.lastModifiedDateTime)}</span>
                <span className={mergeClasses(s.name, s.mid)}>
                  {i.lastModifiedBy?.user?.displayName ?? ''}
                </span>
                <span className={s.name}>
                  {i.folder ? itemCount(i.folder.childCount) : formatSize(i.size)}
                </span>
                <span className={mergeClasses(s.name, s.mid)}>
                  {i.shared && <People16Regular aria-hidden />} {sharingLabel(i)}
                </span>
                <span className={s.activity} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.grid} role="list" aria-label="Files">
          {sorted.map((i) => (
            <button
              key={i.id}
              type="button"
              className={mergeClasses(s.tile, selected?.id === i.id && s.selected)}
              role="listitem"
              onClick={() => activate(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                setSelected(i);
              }}
            >
              <TypeIcon item={i} large />
              <span className={s.name} style={{ maxWidth: '100%' }}>
                {i.name}
              </span>
              <span className={s.muted}>
                {i.folder ? itemCount(i.folder.childCount) : formatSize(i.size)}
              </span>
            </button>
          ))}
        </div>
      )}
      {next && (
        <div className={s.foot}>
          <Button
            appearance="outline"
            disabled={loading || !api.can('filesList')}
            onClick={loadMore}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

export interface FileDetailProps {
  item: DriveItem;
  driveId?: string;
  onBack?: () => void;
  onDeleted?: () => void;
}

/** One file: icon, size, modified, location, Open, Download, Rename and Delete. */
export function FileDetail({
  item: initial,
  driveId,
  onBack,
  onDeleted,
}: FileDetailProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const [item, setItem] = useState(initial);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(initial.name ?? '');
  const { busy, error, run } = useAction();
  const drive = driveId ?? item.parentReference?.driveId;
  const download = item['@microsoft.graph.downloadUrl'];
  return (
    <div className={s.detail}>
      <div className={s.detailHead} data-sticky="top">
        {onBack && <IconButton label="Back" icon={<ArrowLeft20Regular />} onClick={onBack} />}
        <TypeIcon item={item} large />
        <div>
          <div style={{ fontWeight: tokens.fontWeightSemibold, overflowWrap: 'anywhere' }}>
            {item.name}
          </div>
          <div className={s.muted}>
            {item.folder ? `${item.folder.childCount ?? 0} items` : formatSize(item.size)} {'·'}{' '}
            Modified {formatMonthDay(item.lastModifiedDateTime)}
            {item.lastModifiedBy?.user?.displayName
              ? ` by ${item.lastModifiedBy.user.displayName}`
              : ''}
          </div>
        </div>
      </div>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.form} style={{ border: 'none', padding: 0 }}>
        <Button
          appearance="primary"
          icon={<Open20Regular />}
          disabled={!item.webUrl || !api.host.canOpenLinks()}
          onClick={() => item.webUrl && api.openLink(item.webUrl)}
        >
          Open
        </Button>
        <Button
          appearance="outline"
          icon={<ArrowDownload20Regular />}
          disabled={!download || !api.host.canOpenLinks()}
          onClick={() => download && api.openLink(download)}
        >
          Download
        </Button>
        <Button
          appearance="outline"
          icon={<Rename20Regular />}
          disabled={busy || !api.can('fileUpdate')}
          onClick={() => setRenaming(true)}
        >
          Rename
        </Button>
        <Button
          appearance="outline"
          icon={<Delete20Regular />}
          disabled={busy || !item.id || !api.can('fileDelete')}
          onClick={() =>
            run(async () => {
              await api.call('fileDelete', { driveId: drive, driveItemId: item.id, confirm: true });
              onDeleted?.();
            }, 'Could not delete')
          }
        >
          Delete
        </Button>
      </div>
      {renaming && (
        <div className={s.form} style={{ padding: 0, border: 'none' }}>
          <Input aria-label="New name" value={name} onChange={(_, d) => setName(d.value)} />
          <Button
            appearance="primary"
            disabled={!validName(name) || busy}
            onClick={() =>
              run(async () => {
                await api.call('fileUpdate', {
                  driveId: drive,
                  driveItemId: item.id,
                  body: { name: name.trim() },
                  confirm: true,
                });
                setItem((cur) => ({ ...cur, name: name.trim() }));
                setRenaming(false);
              }, 'Could not rename')
            }
          >
            Rename
          </Button>
          <Button appearance="outline" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
