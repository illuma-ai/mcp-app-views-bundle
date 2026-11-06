/**
 * One calendar event: organizer, attendees with response status, location and join link, body,
 * invitation responses and editing.
 *
 * Responding, saving and deleting are App-initiated tool calls, so the host asks the user to
 * approve each with its full arguments; saving an event with attendees sends the update to them,
 * which is why it is never automatic.
 */
import {
  Avatar,
  Button,
  Card,
  Input,
  Link,
  MessageBar,
  MessageBarBody,
  Persona,
  Spinner,
  Subtitle2,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowLeft20Regular,
  Checkmark20Regular,
  CheckmarkCircle16Regular,
  Circle16Regular,
  Delete20Regular,
  DismissCircle16Regular,
  Edit20Regular,
  Location16Regular,
  QuestionCircle16Regular,
  Video16Regular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { formatDayLabel, hostTimeZone } from '../lib/format.js';
import { formatMinutes, responseLabel, wallTime } from '../calendar/logic.js';
import type { CalendarEvent, EventAttendee } from '../calendar/types.js';
import { htmlToText } from '../lib/sanitize.js';
import { type FieldState, RecipientRow, allEntries } from './Composer.js';
import { MessageBody } from './MessageBody.js';
import { IconButton, useAction, useApi } from './shared.js';

const useStyles = makeStyles({
  stack: { display: 'grid', rowGap: tokens.spacingVerticalS },
  subject: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minHeight: '44px',
    padding: `0 ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  grow: { flexGrow: 1, minWidth: 0 },
  card: {
    padding: tokens.spacingHorizontalM,
    gap: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusMedium,
  },
  line: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground2,
  },
  when: { fontSize: tokens.fontSizeBase400, color: tokens.colorNeutralForeground1 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  section: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
  attendee: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    justifyContent: 'space-between',
  },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  no: { color: tokens.colorPaletteRedForeground1 },
  maybe: { color: tokens.colorPaletteMarigoldForeground1 },
  none: { color: tokens.colorNeutralForeground3 },
  form: { display: 'grid', rowGap: tokens.spacingVerticalS },
  pair: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: tokens.spacingHorizontalS },
  hint: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

function ResponseIcon({ response }: { response: string | undefined }): ReactElement {
  const s = useStyles();
  if (response === 'accepted' || response === 'organizer')
    return <CheckmarkCircle16Regular className={s.ok} aria-hidden />;
  if (response === 'declined') return <DismissCircle16Regular className={s.no} aria-hidden />;
  if (response === 'tentativelyAccepted')
    return <QuestionCircle16Regular className={s.maybe} aria-hidden />;
  return <Circle16Regular className={s.none} aria-hidden />;
}

/** "Tuesday, March 10 · 9:30 AM – 10:00 AM" */
function whenText(e: CalendarEvent, zone: string): string {
  const s = wallTime(e.start, zone);
  const en = wallTime(e.end, zone);
  if (!s) return '';
  const day = formatDayLabel(s.date);
  if (e.isAllDay) return `${day} · All day`;
  if (!en) return `${day} · ${formatMinutes(s.minutes)}`;
  const endPart =
    en.date === s.date
      ? formatMinutes(en.minutes)
      : `${formatDayLabel(en.date, { month: 'short', day: 'numeric' })} ${formatMinutes(en.minutes)}`;
  return `${day} · ${formatMinutes(s.minutes)} – ${endPart}`;
}

/** A datetime-local value `offsetMinutes` after the next full hour in `zone`. */
function defaultTime(offsetMinutes: number, zone: string): string {
  const now = wallTime({ dateTime: new Date().toISOString() }, zone);
  if (!now) return '';
  const minutes = (Math.floor(now.minutes / 60) + 1) * 60 + offsetMinutes;
  const day =
    minutes >= 1440
      ? new Date(Date.parse(`${now.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
      : now.date;
  const m = minutes % 1440;
  return `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const inputValue = (w: ReturnType<typeof wallTime>): string =>
  w
    ? `${w.date}T${String(Math.floor(w.minutes / 60)).padStart(2, '0')}:${String(w.minutes % 60).padStart(2, '0')}`
    : '';

export interface EventViewProps {
  initial: CalendarEvent;
  onBack?: () => void;
  /** Fetch the full event (attendees, body) when the list result was partial. */
  fetchFull?: boolean;
  /** Start in edit mode (a just-created event). */
  startEditing?: boolean;
  /** A blank form for a new event; Save creates it (the host confirms first). */
  isNew?: boolean;
}

export function EventView({
  initial,
  onBack,
  fetchFull,
  startEditing,
  isNew: creating,
}: EventViewProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const zone = hostTimeZone();
  const [event, setEvent] = useState<CalendarEvent>(initial);
  const [isNew, setIsNew] = useState(Boolean(creating));
  const [editing, setEditing] = useState(Boolean(startEditing || creating));
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [deleted, setDeleted] = useState(false);
  // A new event the user backed out of: nothing exists, so no event card is shown.
  const [dropped, setDropped] = useState(false);
  const { busy, error, run } = useAction();
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!fetchFull || !initial.id || (initial.attendees && initial.body)) return;
    let live = true;
    setLoadingFull(true);
    api
      .call<CalendarEvent>('eventGet', { eventId: initial.id, bodyFormat: 'html', timezone: zone })
      .then((full) => live && setEvent((cur) => ({ ...cur, ...full })))
      .catch((e: Error) => live && setLoadError(`Could not load the event: ${e.message}`))
      .finally(() => live && setLoadingFull(false));
    return () => {
      live = false;
    };
  }, [initial.id]);

  const id = event.id;
  const respond = (
    role: 'accept' | 'tentative' | 'decline',
    response: string,
    failure: string
  ): void =>
    run(async () => {
      await api.call(role, { eventId: id, body: { sendResponse: true }, confirm: true });
      setEvent((cur) => ({ ...cur, responseStatus: { response } }));
      setNotice('Response sent.');
    }, failure);

  const join = event.onlineMeeting?.joinUrl ?? event.onlineMeetingUrl ?? undefined;
  const canRespond = !event.isOrganizer && Boolean(id) && !event.isCancelled;
  const response = event.responseStatus?.response;

  // ---- editing ----
  const startW = useMemo(() => wallTime(event.start, zone), [event.start, zone]);
  const endW = useMemo(() => wallTime(event.end, zone), [event.end, zone]);
  const [title, setTitle] = useState(event.subject ?? '');
  const [start, setStart] = useState(() =>
    creating && !event.start ? defaultTime(0, zone) : inputValue(startW)
  );
  const [end, setEnd] = useState(() =>
    creating && !event.end ? defaultTime(30, zone) : inputValue(endW)
  );
  const [place, setPlace] = useState(event.location?.displayName ?? '');
  const [who, setWho] = useState<FieldState>({
    entries: (event.attendees ?? []).map((a) => ({
      name: a.emailAddress?.name ?? '',
      address: a.emailAddress?.address ?? '',
      valid: true,
      raw: a.emailAddress?.address ?? '',
    })),
    pending: '',
  });
  // The description as plain text: an HTML body is flattened, a text body (a proposal's) is kept.
  const [text, setText] = useState(() =>
    event.body?.contentType?.toLowerCase() === 'html'
      ? htmlToText(event.body.content ?? '')
      : (event.body?.content ?? '')
  );
  const [bodyEdited, setBodyEdited] = useState(false);
  const attendees = allEntries(who);
  const invalid = attendees.some((a) => !a.valid);
  const startEdit = (): void => {
    setTitle(event.subject ?? '');
    setStart(inputValue(wallTime(event.start, zone)));
    setEnd(inputValue(wallTime(event.end, zone)));
    setPlace(event.location?.displayName ?? '');
    setBodyEdited(false);
    setEditing(true);
  };

  const save = (): void =>
    run(async () => {
      const changes: Record<string, unknown> = {
        subject: title,
        start: { dateTime: `${start}:00`, timeZone: zone },
        end: { dateTime: `${end}:00`, timeZone: zone },
        location: { displayName: place },
        attendees: attendees
          .filter((a) => a.valid)
          .map((a) => ({
            type: 'required',
            emailAddress: a.name ? { address: a.address, name: a.name } : { address: a.address },
          })),
      };
      // A new event carries whatever the form shows, a proposed description included; an existing
      // one sends the description only when the user changed it.
      if (bodyEdited || (isNew && text)) changes.body = { contentType: 'text', content: text };
      if (isNew) {
        const created = await api.call<CalendarEvent>('eventCreate', {
          body: changes,
          confirm: true,
        });
        // Success is the server returning the event it made, never just the call returning.
        if (!created || typeof created !== 'object' || !created.id) {
          throw new Error('The server did not return the new event, so it was not created.');
        }
        setEvent((cur) => ({ ...cur, ...created }));
        setIsNew(false);
        setEditing(false);
        setNotice('Event created.');
        return;
      }
      await api.call('eventUpdate', { eventId: id, body: changes, confirm: true });
      setEvent((cur) => ({
        ...cur,
        subject: title,
        start: { dateTime: `${start}:00`, timeZone: zone },
        end: { dateTime: `${end}:00`, timeZone: zone },
        location: { displayName: place },
        attendees: attendees
          .filter((a) => a.valid)
          .map((a) => ({ type: 'required', emailAddress: { address: a.address, name: a.name } })),
        ...(bodyEdited ? { body: { contentType: 'text', content: text } } : {}),
      }));
      setEditing(false);
      setNotice('Event saved.');
    }, 'Not saved');

  const remove = (): void =>
    run(async () => {
      await api.call('eventDelete', { eventId: id, confirm: true });
      setDeleted(true);
    }, 'Not deleted');

  const canSave =
    !busy &&
    (isNew ? api.can('eventCreate') : Boolean(id) && api.can('eventUpdate')) &&
    !invalid &&
    Boolean(start) &&
    Boolean(end) &&
    end > start;

  return (
    <div className={s.stack}>
      <div className={s.subject} data-sticky="top">
        {onBack && <IconButton label="Back" icon={<ArrowLeft20Regular />} onClick={onBack} />}
        <Subtitle2 as="h1" className={s.grow} style={{ margin: `${tokens.spacingVerticalXS} 0` }}>
          {isNew ? 'New event' : event.subject || '(no title)'}
        </Subtitle2>
        {!editing && !deleted && (
          <>
            <IconButton
              label="Edit"
              icon={<Edit20Regular />}
              disabled={busy || !id || !api.can('eventUpdate')}
              onClick={startEdit}
            />
            <IconButton
              label="Delete"
              icon={<Delete20Regular />}
              disabled={busy || !id || !api.can('eventDelete')}
              onClick={remove}
            />
          </>
        )}
      </div>
      {deleted && (
        <MessageBar intent="info">
          <MessageBarBody>The event was deleted.</MessageBarBody>
        </MessageBar>
      )}
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {loadError && (
        <MessageBar intent="error">
          <MessageBarBody>{loadError}</MessageBarBody>
        </MessageBar>
      )}
      {notice && !error && (
        <MessageBar intent="success">
          <MessageBarBody>{notice}</MessageBarBody>
        </MessageBar>
      )}
      {dropped ? (
        <MessageBar intent="info">
          <MessageBarBody>Nothing was created.</MessageBarBody>
          <Button appearance="transparent" onClick={() => setDropped(false)}>
            Keep editing
          </Button>
        </MessageBar>
      ) : editing ? (
        <Card className={s.card} appearance="outline" role="form" aria-label="Edit event">
          <div className={s.form}>
            <Input
              appearance="underline"
              placeholder="Add a title"
              aria-label="Title"
              value={title}
              onChange={(_, d) => setTitle(d.value)}
            />
            <div className={s.pair}>
              <Input
                type="datetime-local"
                aria-label="Start"
                value={start}
                onChange={(_, d) => setStart(d.value)}
              />
              <Input
                type="datetime-local"
                aria-label="End"
                value={end}
                onChange={(_, d) => setEnd(d.value)}
              />
            </div>
            <span className={s.hint}>Times are in {zone}.</span>
            <Input
              contentBefore={<Location16Regular />}
              placeholder="Add a location"
              aria-label="Location"
              value={place}
              onChange={(_, d) => setPlace(d.value)}
            />
            <RecipientRow label="Invite" state={who} onChange={setWho} />
            <Textarea
              resize="vertical"
              aria-label="Description"
              placeholder="Add a description"
              value={text}
              onChange={(_, d) => {
                setText(d.value);
                setBodyEdited(true);
              }}
            />
            <span className={s.hint}>
              Saving sends the update to the attendees after you approve it.
            </span>
            <div className={s.actions}>
              <Button
                appearance="primary"
                icon={<Checkmark20Regular />}
                disabled={!canSave}
                onClick={save}
              >
                Save
              </Button>
              <Button
                appearance="outline"
                disabled={busy}
                onClick={() => {
                  if (isNew && onBack) onBack();
                  else if (isNew) setDropped(true);
                  else setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className={s.card} appearance="outline" role="article">
          <div className={s.when}>{whenText(event, zone)}</div>
          {event.location?.displayName && (
            <div className={s.line}>
              <Location16Regular />
              {event.location.displayName}
            </div>
          )}
          {join && (
            <div className={s.line}>
              <Video16Regular />
              <Link as="button" onClick={() => api.openLink(join)}>
                Join online meeting
              </Link>
            </div>
          )}
          {event.isCancelled && <span className={s.no}>This event was cancelled.</span>}
          {event.organizer?.emailAddress && (
            <div>
              <div className={s.section}>Organizer</div>
              <Persona
                size="small"
                name={event.organizer.emailAddress.name || event.organizer.emailAddress.address}
                secondaryText={event.organizer.emailAddress.address}
                avatar={{ color: 'colorful' }}
              />
            </div>
          )}
          {loadingFull && <Spinner size="tiny" label="Loading details…" />}
          {(event.attendees?.length ?? 0) > 0 && (
            <div>
              <div className={s.section}>{`Attendees (${event.attendees?.length})`}</div>
              {event.attendees?.map((a: EventAttendee, i) => (
                <div
                  key={`${a.emailAddress?.address}-${i}`}
                  className={s.attendee}
                  title={a.emailAddress?.address}
                >
                  <span className={s.line}>
                    <Avatar
                      size={24}
                      name={a.emailAddress?.name || a.emailAddress?.address}
                      color="colorful"
                      aria-hidden
                    />
                    {a.emailAddress?.name || a.emailAddress?.address}
                  </span>
                  <span className={s.line}>
                    <ResponseIcon response={a.status?.response} />
                    {responseLabel(a.status?.response)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {event.body?.content ? (
            <MessageBody body={event.body} compact />
          ) : event.bodyPreview ? (
            <div>{event.bodyPreview}</div>
          ) : null}
          {canRespond && (
            <div className={s.actions} role="group" aria-label="Respond">
              <Button
                appearance={response === 'accepted' ? 'primary' : 'outline'}
                disabled={busy || !api.can('accept')}
                onClick={() => respond('accept', 'accepted', 'Could not accept')}
              >
                Accept
              </Button>
              <Button
                appearance={response === 'tentativelyAccepted' ? 'primary' : 'outline'}
                disabled={busy || !api.can('tentative')}
                onClick={() => respond('tentative', 'tentativelyAccepted', 'Could not respond')}
              >
                Tentative
              </Button>
              <Button
                appearance={response === 'declined' ? 'primary' : 'outline'}
                disabled={busy || !api.can('decline')}
                onClick={() => respond('decline', 'declined', 'Could not decline')}
              >
                Decline
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
