/**
 * To Do: lists across the top, the open tasks of the current list, a collapsible Completed section.
 *
 * Reading and switching lists are reads. Checking a task off (or back on) and adding a task are
 * explicit controls that make App-initiated tool calls, so the host asks the user to approve each
 * with its full arguments. Nothing is saved implicitly.
 */
import {
  Button,
  Checkbox,
  Input,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Spinner,
  Tab,
  TabList,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  Add20Regular,
  Alert20Regular,
  ArrowRepeatAll20Regular,
  ArrowSort20Regular,
  CalendarLtr20Regular,
  ChevronDown16Regular,
  ChevronRight16Regular,
  Circle20Regular,
  Grid20Regular,
  GroupList20Regular,
  Home20Regular,
  MoreHorizontal20Regular,
  Star16Filled,
  Star16Regular,
  TaskListLtr20Regular,
  TextBulletList20Regular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { Page } from '../mail/types.js';
import {
  dueLabel,
  isDone,
  isOverdue,
  looksLikeLists,
  sortLists,
  splitTasks,
} from '../tasks/logic.js';
import type { Task, TaskList } from '../tasks/types.js';
import { useAction, useApi } from './shared.js';

const useStyles = makeStyles({
  app: { backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1 },
  listHead: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
  },
  listButton: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
  },
  addBox: {
    margin: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  addTop: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    boxSizing: 'border-box',
    minHeight: '52px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
  },
  addCircle: { color: tokens.colorBrandForeground1 },
  addFoot: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    boxSizing: 'border-box',
    minHeight: '45px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  gridList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: tokens.spacingHorizontalS,
    padding: `0 ${tokens.spacingHorizontalM}`,
  },
  tabs: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  head: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalS}`,
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightSemibold,
  },
  add: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalS}`,
  },
  grow: { flexGrow: 1 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minHeight: '52px',
    padding: `0 ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  text: { display: 'grid', minWidth: 0, flexGrow: 1 },
  done: { textDecorationLine: 'line-through', color: tokens.colorNeutralForeground3 },
  ellipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  overdue: { color: tokens.colorPaletteRedForeground1, fontSize: tokens.fontSizeBase200 },
  star: { color: tokens.colorBrandForeground1 },
  // Grid: one white table with Due Date and Importance columns, like the real app.
  table: {
    margin: `0 ${tokens.spacingHorizontalM}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  tableCols: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 112px 96px',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    padding: `0 ${tokens.spacingHorizontalM}`,
    '@media (max-width: 559px)': { gridTemplateColumns: 'minmax(0, 1fr) 72px 40px' },
  },
  tableHead: {
    boxSizing: 'border-box',
    minHeight: '40px',
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  tableRow: {
    boxSizing: 'border-box',
    minHeight: '40px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    ':last-child': { borderBottom: 'none' },
  },
  cellTitle: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, minWidth: 0 },
  starButton: { justifySelf: 'center' },
  section: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    border: 'none',
    background: 'transparent',
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    cursor: 'pointer',
  },
  state: {
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

export interface TasksViewProps {
  args: Record<string, unknown>;
  result?: Page<Task | TaskList>;
  error?: string;
  received: boolean;
}

export function TasksView({
  args,
  result,
  error: resultError,
  received,
}: TasksViewProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const [lists, setLists] = useState<TaskList[]>([]);
  // The list the user picked; until then the one the tool call named. The call's input can arrive
  // after the view has mounted, so it is read on every render, never captured once.
  const [picked, setPicked] = useState<string | undefined>();
  const listId =
    picked ?? (typeof args.todoTaskListId === 'string' ? args.todoTaskListId : undefined);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [title, setTitle] = useState('');
  const { busy, error: actionError, run } = useAction();

  const loadTasks = (id: string): void => {
    setLoading(true);
    setError(null);
    api
      .call<Page<Task>>('tasksList', { todoTaskListId: id, top: 100 })
      .then((page) => {
        setTasks(page.value ?? []);
        setPicked(id);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!received) return;
    if (resultError) return setError(resultError);
    if (!result || !Array.isArray(result.value)) return setError('The result is not a task list.');
    setError(null);
    if (looksLikeLists(result.value)) {
      const sorted = sortLists(result.value as TaskList[]);
      setLists(sorted);
      const first = listId ?? sorted[0]?.id;
      if (first && api.can('tasksList')) loadTasks(first);
    } else {
      setTasks(result.value as Task[]);
      if (api.can('taskLists')) {
        api
          .call<Page<TaskList>>('taskLists', {})
          .then((page) => setLists(sortLists(page.value ?? [])))
          .catch(() => undefined);
      }
    }
  }, [result, resultError, received]);

  const { open, done } = useMemo(() => splitTasks(tasks), [tasks]);
  const current = lists.find((l) => l.id === listId);

  // Explicit writes: one control, one confirmed call.
  const toggle = (t: Task): void =>
    run(async () => {
      const status = isDone(t) ? 'notStarted' : 'completed';
      await api.call('taskUpdate', {
        todoTaskListId: listId,
        todoTaskId: t.id,
        body: { status },
        confirm: true,
      });
      setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, status } : x)));
    }, 'Could not update the task');

  const add = (): void =>
    run(async () => {
      const created = await api.call<Task>('taskCreate', {
        todoTaskListId: listId,
        body: { title: title.trim() },
        confirm: true,
      });
      setTasks((cur) => [{ ...created, title: created.title ?? title.trim() }, ...cur]);
      setTitle('');
    }, 'Could not add the task');

  // The star sets or clears importance: an explicit click, one confirmed update call.
  const setImportance = (t: Task): void =>
    run(async () => {
      const importance = t.importance === 'high' ? 'normal' : 'high';
      await api.call('taskUpdate', {
        todoTaskListId: listId,
        todoTaskId: t.id,
        body: { importance },
        confirm: true,
      });
      setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, importance } : x)));
    }, 'Could not change the importance');

  const circle = (t: Task): ReactElement => (
    <Checkbox
      shape="circular"
      checked={isDone(t)}
      disabled={busy || !api.can('taskUpdate') || !t.id}
      aria-label={isDone(t) ? `Mark ${t.title} as not completed` : `Mark ${t.title} as completed`}
      onChange={() => toggle(t)}
    />
  );
  const star = (t: Task): ReactElement => {
    const high = t.importance === 'high';
    return (
      <Button
        appearance="transparent"
        className={s.starButton}
        disabled={busy || !api.can('taskUpdate') || !t.id}
        aria-pressed={high}
        aria-label={high ? `Remove importance from ${t.title}` : `Mark ${t.title} as important`}
        icon={
          high ? (
            <Star16Filled className={s.star} aria-label="Important" />
          ) : (
            <Star16Regular className={s.star} />
          )
        }
        onClick={() => setImportance(t)}
      />
    );
  };

  // Grid is a table (Due Date, Importance); list is compact rows with the due line under the title.
  const row = (t: Task): ReactElement =>
    layout === 'grid' ? (
      <div key={t.id} className={mergeClasses(s.tableCols, s.tableRow)} role="listitem">
        <span className={s.cellTitle}>
          {circle(t)}
          <span className={mergeClasses(s.ellipsis, isDone(t) && s.done)}>{t.title}</span>
        </span>
        <span className={isOverdue(t) ? s.overdue : s.muted}>
          {isDone(t) ? '' : dueLabel(t).replace(/^Due /, '')}
        </span>
        {star(t)}
      </div>
    ) : (
      <div key={t.id} className={s.row} role="listitem">
        {circle(t)}
        <span className={s.text}>
          <span className={mergeClasses(isDone(t) && s.done)}>{t.title}</span>
          {t.dueDateTime?.dateTime && !isDone(t) && (
            <span className={isOverdue(t) ? s.overdue : s.muted}>{dueLabel(t)}</span>
          )}
        </span>
        {star(t)}
      </div>
    );

  const tableHead = (
    <div className={mergeClasses(s.tableCols, s.tableHead)} aria-hidden>
      <span>Title</span>
      <span>Due Date</span>
      <span style={{ justifySelf: 'center' }}>Importance</span>
    </div>
  );
  const rows = (items: Task[], label: string): ReactElement =>
    layout === 'grid' ? (
      <div className={s.table} role="list" aria-label={label}>
        {tableHead}
        {items.map(row)}
      </div>
    ) : (
      <div role="list" aria-label={label}>
        {items.map(row)}
      </div>
    );

  const smart = ['My Day', 'Important', 'Planned', 'Assigned to me'];
  const HomeIcon =
    current?.wellknownListName === 'defaultList' || !current ? Home20Regular : TaskListLtr20Regular;
  const listName = current?.displayName ?? 'Tasks';

  return (
    <div className={s.app}>
      <div className={s.listHead} data-sticky="top">
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button
              appearance="transparent"
              className={s.listButton}
              icon={<HomeIcon />}
              iconPosition="before"
              aria-label="Lists"
            >
              {listName}
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {smart.map((n) => (
                <MenuItem key={n} disabled title="Not available in this view">
                  {n}
                </MenuItem>
              ))}
              <MenuDivider />
              {lists.map((l) => (
                <MenuItem
                  key={l.id}
                  disabled={loading || !api.can('tasksList')}
                  onClick={() => l.id && loadTasks(l.id)}
                >
                  {l.displayName}
                </MenuItem>
              ))}
              <MenuDivider />
              <MenuItem icon={<Add20Regular />} disabled title="Not available in this view">
                New list
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
        <Button appearance="subtle" icon={<MoreHorizontal20Regular />} aria-label="More" disabled />
        <TabList
          size="small"
          selectedValue={layout}
          onTabSelect={(_, d) => setLayout(d.value as 'grid' | 'list')}
        >
          <Tab value="grid" icon={<Grid20Regular />}>
            Grid
          </Tab>
          <Tab value="list" icon={<TextBulletList20Regular />}>
            List
          </Tab>
        </TabList>
        <span className={s.grow} />
        <Button
          appearance="subtle"
          icon={<ArrowSort20Regular />}
          disabled
          title="Not available in this view"
        >
          Sort
        </Button>
        <Button
          appearance="subtle"
          icon={<GroupList20Regular />}
          disabled
          title="Not available in this view"
        >
          Group
        </Button>
      </div>
      <div className={s.addBox}>
        <div className={s.addTop}>
          <Circle20Regular className={s.addCircle} aria-hidden />
          <Input
            className={s.grow}
            appearance="underline"
            placeholder="Add a task"
            aria-label="Add a task"
            value={title}
            disabled={!api.can('taskCreate') || !listId}
            onChange={(_, d) => setTitle(d.value)}
          />
        </div>
        <div className={s.addFoot}>
          <Button
            appearance="subtle"
            icon={<CalendarLtr20Regular />}
            aria-label="Add due date"
            disabled
          />
          <Button appearance="subtle" icon={<Alert20Regular />} aria-label="Remind me" disabled />
          <Button
            appearance="subtle"
            icon={<ArrowRepeatAll20Regular />}
            aria-label="Repeat"
            disabled
          />
          <span className={s.grow} />
          <Button appearance="outline" disabled={!title.trim() || busy || !listId} onClick={add}>
            Add
          </Button>
        </div>
      </div>
      {(error || actionError) && (
        <MessageBar intent="error">
          <MessageBarBody>{error ?? actionError}</MessageBarBody>
        </MessageBar>
      )}
      {loading && <Spinner size="tiny" />}
      {open.length === 0 && done.length === 0
        ? !received && (
            <p className={s.state} role="status">
              Waiting for tasks…
            </p>
          )
        : rows(open, 'Tasks')}
      {done.length > 0 && (
        <>
          <button
            type="button"
            className={s.section}
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
          >
            {showDone ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
            {`Completed ${done.length}`}
          </button>
          {showDone && rows(done, 'Completed tasks')}
        </>
      )}
    </div>
  );
}
