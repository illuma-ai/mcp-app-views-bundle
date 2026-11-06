/**
 * Calendar view in the layout of the reference client: a command bar (New event, Day, Work week,
 * Week, Month, Split view, Filter, Share, Print), a date bar (Today, previous/next, range title) and
 * a time grid or month grid. Navigation, opening an event and creating one are App-initiated tool
 * calls (the host confirms each). Times are wall-clock in the host's time zone: the view asks Graph
 * for that zone, so nothing is converted client-side.
 */
import {
  Badge,
  Button,
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
  ToolbarDivider,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  CalendarAdd20Regular,
  CalendarDay20Regular,
  CalendarMonth20Regular,
  CalendarToday20Regular,
  CalendarWeekNumbers20Regular,
  CalendarWorkWeek20Regular,
  AddCircle20Filled,
  MoreHorizontal20Regular,
  ChevronDown16Regular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  Filter20Regular,
  Print20Regular,
  Share20Regular,
  Video16Regular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDayLabel, hostTimeZone } from '../lib/format.js';
import {
  type CalendarMode,
  type Slot,
  type TimedEvent,
  formatHour,
  formatMinutes,
  groupAgenda,
  layoutDay,
  modeForRange,
  placeEvents,
  rangeFor,
  rangeTitle,
  shiftAnchor,
  startOfDayIso,
  todayKey,
  wallTime,
} from '../calendar/logic.js';
import type { CalendarEvent } from '../calendar/types.js';
import type { Page } from '../mail/types.js';
import { EventView } from './EventView.js';
import {
  IconButton,
  NARROW_PX,
  SplitAction,
  useApi,
  useOverflowFit,
  useNarrower,
} from './shared.js';

/** Fields requested for grid and agenda items. */
export const EVENT_SELECT =
  'id,subject,start,end,isAllDay,isCancelled,isOrganizer,isOnlineMeeting,onlineMeeting,location,organizer,responseStatus,showAs,type,webLink';
/** Pixels per hour: the real grid's hour rows are 80px (two 40px halves). */
const HOUR = 80;

const useStyles = makeStyles({
  app: { backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1 },
  // One line, as in the real bar: what does not fit moves under the ... button at the right end.
  cmd: {
    display: 'flex',
    flexWrap: 'nowrap',
    overflow: 'hidden',
    '& > *': { flexShrink: 0 },
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    minHeight: '44px',
  },
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    minHeight: '52px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
    color: tokens.colorNeutralForeground2,
  },
  grow: { flexGrow: 1 },
  pane: { padding: tokens.spacingHorizontalS, backgroundColor: tokens.colorNeutralBackground2 },
  // The hours scroll inside the frame (the wheel scrolls them, not the host page) and stay put at the ends.
  scroller: {
    maxHeight: '560px',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    position: 'relative',
  },
  sticky: {
    position: 'sticky',
    top: 0,
    zIndex: 4,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  grid: {
    display: 'grid',
    position: 'relative',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  // The header band is 55px with its divider: a 20px blue day number over a 12px weekday, and a 3px
  // accent bar across the top on today.
  dayHead: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    position: 'sticky',
    top: 0,
    zIndex: 4,
    backgroundColor: tokens.colorNeutralBackground1,
    boxSizing: 'border-box',
    height: '55px',
    padding: `0 ${tokens.spacingHorizontalS}`,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    borderTop: '3px solid transparent',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  dayNum: {
    fontSize: '20px',
    lineHeight: '28px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
  },
  weekday: { fontSize: tokens.fontSizeBase200, lineHeight: '16px' },
  today: { borderTopColor: tokens.colorBrandStroke1 },
  todayWeekday: { color: tokens.colorBrandForeground1 },
  allDay: {
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: tokens.spacingVerticalXXS,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minHeight: '4px',
  },
  axis: {
    position: 'relative',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  hourLabel: {
    position: 'absolute',
    right: tokens.spacingHorizontalS,
    transform: 'translateY(-50%)',
    whiteSpace: 'nowrap',
  },
  col: { position: 'relative', borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  weekend: { backgroundColor: tokens.colorNeutralBackground2 },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  halfLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTop: `1px dashed ${tokens.colorNeutralStroke2}`,
  },
  block: {
    position: 'absolute',
    boxSizing: 'border-box',
    overflow: 'hidden',
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}`,
    border: 'none',
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForeground1,
    textAlign: 'left',
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorBrandBackground2Hover },
  },
  inline: { position: 'static' },
  free: {
    borderLeftColor: tokens.colorNeutralStroke1,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  cancelled: { textDecorationLine: 'line-through', color: tokens.colorNeutralForeground3 },
  blockTitle: {
    fontWeight: tokens.fontWeightSemibold,
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  // The current time: a thin dashed line across the week, a 2px solid line over today's column, and a dot
  // where today's column begins.
  nowAcross: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTop: `1px dashed ${tokens.colorBrandStroke1}`,
    zIndex: 1,
    pointerEvents: 'none',
  },
  now: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTop: `2px solid ${tokens.colorBrandStroke1}`,
    zIndex: 2,
    pointerEvents: 'none',
  },
  nowDot: {
    position: 'absolute',
    left: '-6px',
    width: '12px',
    height: '12px',
    marginTop: '-5px',
    borderRadius: '50%',
    backgroundColor: tokens.colorBrandBackground,
    zIndex: 3,
    pointerEvents: 'none',
  },
  newHere: {
    position: 'absolute',
    right: '8px',
    top: '12px',
    width: '24px',
    height: '24px',
    minWidth: '24px',
    padding: 0,
    color: tokens.colorBrandForeground1,
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    height: '37px',
    boxSizing: 'border-box',
    padding: '0 24px 0 12px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontWeight: tokens.fontWeightSemibold,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '112px minmax(0, 1fr)',
    columnGap: tokens.spacingHorizontalM,
    alignItems: 'start',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '56px',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    border: 'none',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    textAlign: 'left',
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  rowTime: { color: tokens.colorNeutralForeground2 },
  rowTitle: { fontWeight: tokens.fontWeightSemibold },
  rowMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
  month: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  monthHead: {
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    height: '29px',
    padding: `0 ${tokens.spacingHorizontalS}`,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  cell: {
    boxSizing: 'border-box',
    minHeight: '93px',
    padding: tokens.spacingHorizontalXXS,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    overflow: 'hidden',
  },
  cellNum: {
    fontSize: tokens.fontSizeBase300,
    lineHeight: '20px',
    color: tokens.colorNeutralForeground2,
    paddingLeft: tokens.spacingHorizontalXS,
  },
  // Today's number sits in a 20px accent circle.
  cellToday: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    width: '20px',
    height: '20px',
    paddingLeft: 0,
    borderRadius: '50%',
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    fontWeight: tokens.fontWeightSemibold,
  },
  outside: { color: tokens.colorNeutralForeground4 },
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
});

export interface CalendarViewProps {
  args: Record<string, unknown>;
  result?: Page<CalendarEvent>;
  error?: string;
  received: boolean;
}

const eventTitle = (e: CalendarEvent): string => e.subject || '(no title)';

function timeLabel(item: TimedEvent, e: CalendarEvent, zone: string): string {
  if (item.allDay) return 'All day';
  const end = wallTime(e.end, zone);
  return `${formatMinutes(item.start)}${end ? ` – ${formatMinutes(end.minutes)}` : ''}`;
}

type EventFilter = 'all' | 'pending' | 'online';
const FILTER_LABEL: Record<EventFilter, string> = {
  all: 'All events',
  pending: 'Needs response',
  online: 'Online meetings',
};

export function CalendarView({
  args,
  result,
  error: resultError,
  received,
}: CalendarViewProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const zone = hostTimeZone();
  const today = todayKey(new Date(), zone);
  const startArg = typeof args.startDateTime === 'string' ? args.startDateTime : undefined;
  const endArg = typeof args.endDateTime === 'string' ? args.endDateTime : undefined;
  const [mode, setMode] = useState<CalendarMode>(() => modeForRange(startArg, endArg));
  // Below the narrow width a time grid cannot be read, so the days are listed as an agenda.
  const narrow = useNarrower(NARROW_PX);
  // 4 mode buttons (not in the narrow agenda) and Split view, Filter, Share, Print.
  const { ref: barRef, visible: barVisible } = useOverflowFit<HTMLDivElement>(narrow ? 4 : 8);
  const currentMode = mode;
  const [anchor, setAnchor] = useState(() =>
    startArg ? (wallTime({ dateTime: startArg }, zone)?.date ?? today) : today
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ event: CalendarEvent | null } | null>(null);
  const [filter, setFilter] = useState<EventFilter>('all');
  const seen = useRef(new Set<string>());

  const ingest = (page: Page<CalendarEvent>, replace: boolean): void => {
    if (replace) seen.current.clear();
    const fresh = (page.value ?? []).filter((e) => {
      if (!e || typeof e !== 'object') return false;
      if (e.id) {
        if (seen.current.has(e.id)) return false;
        seen.current.add(e.id);
      }
      return true;
    });
    setEvents((cur) => (replace ? fresh : [...cur, ...fresh]));
    setNext(page['@odata.nextLink'] ?? null);
  };

  // The tool result that created this view.
  useEffect(() => {
    if (!received) return;
    if (startArg) setAnchor(wallTime({ dateTime: startArg }, zone)?.date ?? today);
    setMode(modeForRange(startArg, endArg));
    if (resultError) {
      setError(resultError);
      setEvents([]);
    } else if (result && Array.isArray(result.value)) {
      setError(null);
      ingest(result, true);
    } else {
      setError('The result is not an event list.');
    }
  }, [result, resultError, received]);

  const go = (nextAnchor: string, nextMode: CalendarMode): void => {
    if (loading) return;
    const range = rangeFor(nextMode, nextAnchor);
    setLoading(true);
    setError(null);
    api
      .call<Page<CalendarEvent>>('calView', {
        startDateTime: startOfDayIso(range.start, zone),
        endDateTime: startOfDayIso(range.end, zone),
        select: EVENT_SELECT,
        orderby: 'start/dateTime',
        top: 100,
        timezone: zone,
      })
      .then((page) => {
        ingest(page, true);
        setAnchor(nextAnchor);
        setMode(nextMode);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const loadMore = (): void => {
    if (loading || !next) return;
    setLoading(true);
    api
      .call<Page<CalendarEvent>>(startArg || api.actions.calView ? 'calView' : 'calList', {
        skiptoken: next,
        timezone: zone,
      })
      .then((page) => ingest(page, false))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const visible = useMemo(
    () =>
      events.filter((e) =>
        filter === 'pending'
          ? e.responseStatus?.response === 'notResponded'
          : filter === 'online'
            ? Boolean(e.isOnlineMeeting)
            : true
      ),
    [events, filter]
  );
  const placed = useMemo(() => placeEvents(visible, zone), [visible, zone]);
  const range = rangeFor(mode, anchor);
  const canNavigate = api.can('calView');
  const choose = (m: CalendarMode): void => (canNavigate ? go(anchor, m) : setMode(m));

  if (detail) {
    return (
      <div className={mergeClasses(s.app, s.pane)}>
        <EventView
          initial={detail.event ?? {}}
          isNew={!detail.event}
          fetchFull={Boolean(detail.event) && api.can('eventGet')}
          onBack={() => setDetail(null)}
        />
      </div>
    );
  }

  const modeButton = (value: CalendarMode, label: string, icon: ReactElement): ReactElement => (
    <ToggleButton
      appearance="subtle"
      size="medium"
      icon={icon}
      checked={mode === value}
      onClick={() => choose(value)}
    >
      {label}
    </ToggleButton>
  );

  // The commands after New event, in order, with their rendered widths. They go on one line; the ones
  // that do not fit are listed under the ... button.
  type Item = {
    id: string;
    width: number;
    node: ReactElement;
    menu: Array<{
      label: string;
      icon?: ReactElement;
      disabled?: boolean;
      checked?: boolean;
      onClick?: () => void;
    }>;
  };
  const off = 'Not available in this view';
  const items: Item[] = [
    ...(narrow
      ? []
      : (
          [
            ['day', 'Day', <CalendarDay20Regular key="d" />, 80],
            ['workweek', 'Work week', <CalendarWorkWeek20Regular key="w" />, 118],
            ['week', 'Week', <CalendarWeekNumbers20Regular key="k" />, 84],
            ['month', 'Month', <CalendarMonth20Regular key="m" />, 88],
          ] as const
        ).map(
          ([mode, label, icon, width]): Item => ({
            id: mode,
            width,
            node: <span key={mode}>{modeButton(mode, label, icon)}</span>,
            menu: [{ label, icon, checked: mode === currentMode, onClick: () => choose(mode) }],
          })
        )),
    {
      id: 'split',
      width: 108,
      node: (
        <Button
          key="split"
          appearance="subtle"
          disabled
          icon={<CalendarWeekNumbers20Regular />}
          title={off}
        >
          Split view
        </Button>
      ),
      menu: [{ label: 'Split view', icon: <CalendarWeekNumbers20Regular />, disabled: true }],
    },
    {
      id: 'filter',
      width: 100,
      node: (
        <Menu key="filter">
          <MenuTrigger disableButtonEnhancement>
            <Button appearance="subtle" icon={<Filter20Regular />} iconPosition="before">
              {filter === 'all' ? 'Filter' : 'Filter applied'}
              <ChevronDown16Regular />
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {(Object.keys(FILTER_LABEL) as EventFilter[]).map((f) => (
                <MenuItem
                  key={f}
                  onClick={() => setFilter(f)}
                  secondaryContent={filter === f ? '\u2713' : undefined}
                >
                  {FILTER_LABEL[f]}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      ),
      menu: (Object.keys(FILTER_LABEL) as EventFilter[]).map((f) => ({
        label: FILTER_LABEL[f],
        icon: <Filter20Regular />,
        checked: filter === f,
        onClick: () => setFilter(f),
      })),
    },
    {
      id: 'share',
      width: 88,
      node: (
        <Button key="share" appearance="subtle" disabled icon={<Share20Regular />} title={off}>
          Share
        </Button>
      ),
      menu: [{ label: 'Share', icon: <Share20Regular />, disabled: true }],
    },
    {
      id: 'print',
      width: 84,
      node: (
        <Button key="print" appearance="subtle" disabled icon={<Print20Regular />} title={off}>
          Print
        </Button>
      ),
      menu: [{ label: 'Print', icon: <Print20Regular />, disabled: true }],
    },
  ];
  const shown = items.slice(0, barVisible);
  const hidden = items.slice(barVisible);

  return (
    <div className={s.app}>
      <Toolbar ref={barRef} className={s.cmd} data-sticky="top" aria-label="Calendar commands">
        <SplitAction
          label="New event"
          icon={<CalendarAdd20Regular />}
          disabled={!api.can('eventCreate')}
          onClick={() => setDetail({ event: null })}
          menuLabel="More New event options"
          items={[
            {
              label: 'New event',
              icon: <CalendarAdd20Regular />,
              onClick: () => setDetail({ event: null }),
            },
          ]}
        />
        <ToolbarDivider />
        {shown.map((c) => c.node)}
        {hidden.length > 0 && (
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button
                appearance="subtle"
                icon={<MoreHorizontal20Regular />}
                aria-label="More commands"
              />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {hidden.flatMap((c) =>
                  c.menu.map((m) => (
                    <MenuItem
                      key={c.id + m.label}
                      icon={m.icon}
                      disabled={m.disabled}
                      secondaryContent={m.checked ? '\u2713' : undefined}
                      onClick={m.onClick}
                    >
                      {m.label}
                    </MenuItem>
                  ))
                )}
              </MenuList>
            </MenuPopover>
          </Menu>
        )}
      </Toolbar>
      <div className={s.bar} data-sticky="top" role="toolbar" aria-label="Date">
        <Button
          appearance="outline"
          icon={<CalendarToday20Regular />}
          disabled={!canNavigate || loading}
          onClick={() => go(today, mode === 'agenda' ? 'week' : mode)}
        >
          Today
        </Button>
        <IconButton
          label="Previous"
          icon={<ChevronLeft20Regular />}
          disabled={!canNavigate || loading}
          onClick={() => go(shiftAnchor(mode, anchor, -1), mode === 'agenda' ? 'week' : mode)}
        />
        <IconButton
          label="Next"
          icon={<ChevronRight20Regular />}
          disabled={!canNavigate || loading}
          onClick={() => go(shiftAnchor(mode, anchor, 1), mode === 'agenda' ? 'week' : mode)}
        />
        <span className={s.title} role="heading" aria-level={2}>
          {rangeTitle(mode === 'agenda' ? 'week' : mode, anchor)}
        </span>
        <span className={s.grow} />
        {loading && <Spinner size="tiny" />}
      </div>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {mode === 'agenda' || narrow ? (
        <Agenda
          items={placed}
          zone={zone}
          onOpen={(e) => setDetail({ event: e })}
          loading={loading}
          received={received}
        />
      ) : mode === 'month' ? (
        <MonthGrid
          days={range.days}
          anchor={anchor}
          items={placed}
          today={today}
          onOpen={(e) => setDetail({ event: e })}
        />
      ) : (
        <Grid
          days={range.days}
          items={placed}
          today={today}
          zone={zone}
          onOpen={(e) => setDetail({ event: e })}
          onNew={api.can('eventCreate') ? () => setDetail({ event: null }) : undefined}
        />
      )}
      {next && (
        <div className={s.foot}>
          <Button
            appearance="outline"
            disabled={loading || !(api.can('calView') || api.can('calList'))}
            onClick={loadMore}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function Agenda({
  items,
  zone,
  onOpen,
  loading,
  received,
}: {
  items: TimedEvent[];
  zone: string;
  onOpen: (e: CalendarEvent) => void;
  loading: boolean;
  received: boolean;
}): ReactElement {
  const s = useStyles();
  const groups = groupAgenda(items);
  if (!groups.length)
    return (
      <p className={s.state}>
        {loading ? 'Loading…' : received ? 'No events in this range.' : 'Waiting for events…'}
      </p>
    );
  return (
    <div role="list" aria-label="Agenda">
      {groups.map((g) => (
        <div key={g.date} role="listitem">
          <div className={s.group}>{formatDayLabel(g.date)}</div>
          {g.items.map((it, i) => (
            <button
              key={it.event.id ?? i}
              type="button"
              className={s.row}
              onClick={() => onOpen(it.event)}
            >
              <span className={s.rowTime}>{timeLabel(it, it.event, zone)}</span>
              <span>
                <span className={mergeClasses(s.rowTitle, it.event.isCancelled && s.cancelled)}>
                  {eventTitle(it.event)}
                </span>
                <span className={s.rowMeta}>
                  {it.event.location?.displayName && <span>{it.event.location.displayName}</span>}
                  {it.event.isOnlineMeeting && (
                    <Badge appearance="outline" size="small" icon={<Video16Regular />}>
                      Online
                    </Badge>
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

const isWeekend = (date: string): boolean => {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
};

function Grid({
  days,
  items,
  today,
  zone,
  onOpen,
  onNew,
}: {
  days: string[];
  items: TimedEvent[];
  today: string;
  zone: string;
  onOpen: (e: CalendarEvent) => void;
  onNew?: () => void;
}): ReactElement {
  const s = useStyles();
  const timed = items.filter((i) => !i.allDay && days.includes(i.date));
  const nowParts = wallTime({ dateTime: new Date().toISOString() }, zone);
  // The visible hours include the current time when today is on screen, so its line is always there.
  const todayShown = days.includes(today) && nowParts?.date === today ? nowParts.minutes : null;
  const first = Math.min(
    8 * 60,
    ...timed.map((i) => i.start),
    ...(todayShown === null ? [] : [todayShown])
  );
  const last = Math.max(
    18 * 60,
    ...timed.map((i) => i.end),
    ...(todayShown === null ? [] : [todayShown + 60])
  );
  const from = Math.floor(first / 60) * 60;
  const to = Math.min(24 * 60, Math.ceil(last / 60) * 60);
  const height = ((to - from) / 60) * HOUR;
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  const scroller = useRef<HTMLDivElement>(null);
  // Open at the current hour (a little above it) instead of at the top of the day.
  useEffect(() => {
    if (todayShown !== null && scroller.current) {
      scroller.current.scrollTop = Math.max(0, ((todayShown - from) / 60) * HOUR - 120);
    }
  }, []);
  return (
    <div className={s.scroller} data-scroll="grid" ref={scroller}>
      <div
        className={s.grid}
        style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="Calendar grid"
      >
        <div className={s.sticky} />
        {days.map((d) => (
          <div
            key={d}
            className={mergeClasses(s.dayHead, d === today && s.today)}
            role="columnheader"
          >
            <span className={s.dayNum}>{formatDayLabel(d, { day: 'numeric' })}</span>
            <span className={mergeClasses(s.weekday, d === today && s.todayWeekday)}>
              {formatDayLabel(d, { weekday: 'short' })}
            </span>
            {d === today && onNew && (
              <Button
                appearance="transparent"
                className={s.newHere}
                aria-label="New event"
                icon={<AddCircle20Filled />}
                onClick={onNew}
              />
            )}
          </div>
        ))}
        <div />
        {days.map((d) => (
          <div key={d} className={s.allDay}>
            {items
              .filter((i) => i.allDay && i.date === d)
              .map((i, k) => (
                <button
                  key={i.event.id ?? k}
                  type="button"
                  className={mergeClasses(s.block, s.inline)}
                  onClick={() => onOpen(i.event)}
                >
                  <span className={s.blockTitle}>{eventTitle(i.event)}</span>
                </button>
              ))}
          </div>
        ))}
        <div className={s.axis} style={{ height }}>
          {hours.map((h, i) => (
            <span key={h} className={s.hourLabel} style={{ top: i === 0 ? 8 : i * HOUR }}>
              {i === 0 ? '' : formatHour(h)}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const slots: Slot[] = layoutDay(timed.filter((i) => i.date === d));
          return (
            <div
              key={d}
              className={mergeClasses(s.col, isWeekend(d) && s.weekend)}
              style={{ height }}
              role="gridcell"
            >
              {hours.map((h, i) => (
                <div key={h}>
                  {i > 0 && <div className={s.hourLine} style={{ top: i * HOUR }} />}
                  <div className={s.halfLine} style={{ top: i * HOUR + HOUR / 2 }} />
                </div>
              ))}
              {d < today &&
                todayShown !== null &&
                nowParts &&
                nowParts.minutes >= from &&
                nowParts.minutes <= to && (
                  <div
                    className={s.nowAcross}
                    data-now="across"
                    style={{ top: ((nowParts.minutes - from) / 60) * HOUR }}
                  />
                )}
              {d === today &&
                nowParts &&
                nowParts.date === d &&
                nowParts.minutes >= from &&
                nowParts.minutes <= to && (
                  <>
                    <div
                      className={s.now}
                      data-now="line"
                      style={{ top: ((nowParts.minutes - from) / 60) * HOUR }}
                    />
                    <div
                      className={s.nowDot}
                      data-now="dot"
                      style={{ top: ((nowParts.minutes - from) / 60) * HOUR }}
                    />
                  </>
                )}
              {slots.map((slot, i) => (
                <button
                  key={slot.event.id ?? i}
                  type="button"
                  className={mergeClasses(
                    s.block,
                    slot.event.showAs === 'free' && s.free,
                    slot.event.isCancelled && s.cancelled
                  )}
                  style={{
                    top: ((slot.start - from) / 60) * HOUR,
                    height: Math.max(20, ((slot.end - slot.start) / 60) * HOUR - 1),
                    left: `${(slot.column / slot.columns) * 100}%`,
                    width: `calc(${100 / slot.columns}% - 2px)`,
                  }}
                  title={`${eventTitle(slot.event)} ${formatMinutes(slot.start)}`}
                  onClick={() => onOpen(slot.event)}
                >
                  <span className={s.blockTitle}>{eventTitle(slot.event)}</span>
                  {slot.end - slot.start >= 45 && slot.event.location?.displayName && (
                    <span className={s.blockTitle}>{slot.event.location.displayName}</span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({
  days,
  anchor,
  items,
  today,
  onOpen,
}: {
  days: string[];
  anchor: string;
  items: TimedEvent[];
  today: string;
  onOpen: (e: CalendarEvent) => void;
}): ReactElement {
  const s = useStyles();
  const weeks = Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const shown = weeks.filter((w) => w.some((d) => d.slice(0, 7) === anchor.slice(0, 7)));
  return (
    <div className={s.month} role="grid" aria-label="Month">
      {shown[0].map((d) => (
        <div key={d} className={s.monthHead} role="columnheader">
          {formatDayLabel(d, { weekday: 'long' })}
        </div>
      ))}
      {shown.flat().map((d) => {
        const list = items.filter((i) => i.date === d);
        return (
          <div key={d} className={mergeClasses(s.cell, isWeekend(d) && s.weekend)} role="gridcell">
            <span
              className={mergeClasses(
                s.cellNum,
                d === today && s.cellToday,
                d.slice(0, 7) !== anchor.slice(0, 7) && s.outside
              )}
            >
              {/* the first of a month is labelled with its month, as in the real grid: "Nov 1" */}
              {d.slice(8) === '01' || d === shown[0][0]
                ? formatDayLabel(d, { month: 'short', day: 'numeric' })
                : formatDayLabel(d, { day: 'numeric' })}
            </span>
            {list.slice(0, 3).map((i, k) => (
              <button
                key={i.event.id ?? k}
                type="button"
                className={mergeClasses(s.block, s.inline)}
                onClick={() => onOpen(i.event)}
              >
                <span className={s.blockTitle}>{eventTitle(i.event)}</span>
              </button>
            ))}
            {list.length > 3 && <span className={s.cellNum}>{`+${list.length - 3} more`}</span>}
          </div>
        );
      })}
    </div>
  );
}
