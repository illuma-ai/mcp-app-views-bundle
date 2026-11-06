/**
 * Draft composer (new mail, reply, reply-all, forward) for a draft that already exists in the
 * mailbox.
 *
 * Nothing leaves the mailbox from here on its own. Save and Send are each an App-initiated tool
 * call, which the host confirms with the full arguments before it runs; the only code path that
 * reaches the send tool is the Send button's click handler.
 */
import {
  Avatar,
  Button,
  Card,
  Input,
  MessageBar,
  MessageBarBody,
  Tag,
  TagGroup,
  Textarea,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  Checkmark20Regular,
  Delete20Regular,
  Open20Regular,
  Send20Regular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { useMemo, useRef, useState } from 'react';
import { htmlToText } from '../lib/sanitize.js';
import { parseOriginal, splitQuoted, textToHtml } from '../lib/quoted.js';
import type { MailMessage, Recipient } from '../mail/types.js';
import { MessageBody } from './MessageBody.js';
import { IconButton, SplitAction, useAction, useApi } from './shared.js';

const useStyles = makeStyles({
  card: { padding: 0, gap: 0, borderRadius: tokens.borderRadiusMedium },
  // The send bar is 48px plus its 1px divider, and the first row sits 12px below it.
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    boxSizing: 'border-box',
    height: '49px',
    padding: `0 ${tokens.spacingHorizontalM}`,
    marginBottom: '6px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  grow: { flexGrow: 1 },
  row: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    // 32px field rows 44px apart
    paddingTop: '6px',
    paddingBottom: '6px',
  },
  label: { minWidth: '50px', height: '32px' },
  trailing: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', flexShrink: 0 },
  bare: {
    border: 'none',
    backgroundColor: 'transparent',
    boxShadow: 'none',
    '::after': { display: 'none' },
  },
  // The original message sits in the same card, below the draft, so the send bar stays put over both.
  original: {
    padding: 0,
    gap: 0,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    marginTop: tokens.spacingVerticalS,
  },
  originalHead: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalS}`,
  },
  originalWho: { flexGrow: 1, minWidth: 0 },
  originalDate: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  chip: { maxWidth: '100%', minWidth: 0 },
  field: {
    display: 'flex',
    flexWrap: 'wrap',
    minWidth: 0,
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    boxSizing: 'border-box',
    minHeight: '32px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    ':focus-within': { borderBottomColor: tokens.colorCompoundBrandStroke },
  },
  plainInput: {
    flexGrow: 1,
    minWidth: '3rem',
    flexBasis: 0,
    width: '3rem',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: tokens.colorNeutralForeground1,
    font: 'inherit',
    padding: tokens.spacingVerticalXS,
  },
  bad: { color: tokens.colorPaletteRedForeground1 },
  hint: {
    gridColumn: 2,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteRedForeground1,
    paddingBottom: tokens.spacingVerticalXS,
  },
  subject: {
    // 16px below the last recipient row (the row's own 6px padding plus 10px here)
    margin: `10px ${tokens.spacingHorizontalM} ${tokens.spacingVerticalS}`,
    width: `calc(100% - ${tokens.spacingHorizontalXXL})`,
  },
  write: {
    margin: `0 ${tokens.spacingHorizontalM}`,
    width: `calc(100% - ${tokens.spacingHorizontalXXL})`,
    minHeight: '144px',
  },
  status: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  quoted: {
    marginLeft: tokens.spacingHorizontalM,
    marginRight: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  pill: {
    alignSelf: 'flex-start',
    marginLeft: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalS,
    minHeight: '16px',
    height: '16px',
    minWidth: '28px',
    paddingTop: 0,
    paddingBottom: 0,
    lineHeight: '12px',
  },
});

export interface Entry {
  name: string;
  address: string;
  valid: boolean;
  raw: string;
}

const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;

/** Parses "Name <a@b.c>" or a bare address into an entry. */
export function parseEntry(text: string): Entry {
  const s = text.trim();
  const m = /^(.*?)\s*<([^<>]+)>$/.exec(s);
  const address = (m ? m[2] : s).trim();
  return {
    name: m ? m[1].replace(/^"|"$/g, '').trim() : '',
    address,
    valid: EMAIL.test(address),
    raw: s,
  };
}

const fromRecipients = (list: Recipient[] | undefined): Entry[] =>
  (list ?? []).map((r) => ({
    name: r.emailAddress?.name ?? '',
    address: r.emailAddress?.address ?? '',
    valid: true,
    raw: r.emailAddress?.address ?? '',
  }));
const toGraph = (list: Entry[]): Recipient[] =>
  list.map((r) => ({
    emailAddress: r.name ? { address: r.address, name: r.name } : { address: r.address },
  }));
const fingerprint = (list: Entry[]): string =>
  list
    .filter((e) => e.valid)
    .map((r) => `${r.name}<${r.address}>`)
    .join(';');

export interface FieldState {
  entries: Entry[];
  pending: string;
}

/** The entries of a field including a half-typed address. */
export function allEntries(f: FieldState): Entry[] {
  const typed = f.pending.trim();
  return typed ? [...f.entries, parseEntry(typed)] : f.entries;
}

export interface RecipientRowProps {
  label: string;
  state: FieldState;
  onChange: (next: FieldState) => void;
  trailing?: ReactElement | null;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function RecipientRow({
  label,
  state,
  onChange,
  trailing,
  inputRef,
}: RecipientRowProps): ReactElement {
  const s = useStyles();
  const commit = (text: string): FieldState => {
    const parts = text
      .split(/[;,\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    return { entries: [...state.entries, ...parts.map(parseEntry)], pending: '' };
  };
  const invalid = allEntries(state).filter((e) => !e.valid);
  return (
    <div className={s.row}>
      <Button appearance="outline" className={s.label}>
        {label}
      </Button>
      <div className={s.field}>
        <TagGroup
          onDismiss={(_, d) =>
            onChange({ ...state, entries: state.entries.filter((e) => e.raw !== d.value) })
          }
        >
          {state.entries.map((e, i) => (
            <Tag
              key={`${e.raw}-${i}`}
              value={e.raw}
              dismissible
              size="small"
              appearance="outline"
              className={mergeClasses(s.chip, !e.valid && s.bad)}
            >
              {e.name && e.name !== e.address ? `${e.name} <${e.address}>` : e.raw}
            </Tag>
          ))}
        </TagGroup>
        <input
          ref={inputRef}
          className={s.plainInput}
          aria-label={label}
          aria-invalid={invalid.length > 0}
          autoComplete="off"
          spellCheck={false}
          value={state.pending}
          onChange={(e) => onChange({ ...state, pending: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ';' || e.key === ',') {
              e.preventDefault();
              if (state.pending.trim()) onChange(commit(state.pending));
            } else if (e.key === 'Backspace' && !state.pending && state.entries.length) {
              onChange({ ...state, entries: state.entries.slice(0, -1) });
            }
          }}
          onBlur={() => state.pending.trim() && onChange(commit(state.pending))}
        />
        {trailing && <span className={s.trailing}>{trailing}</span>}
      </div>
      {invalid.length > 0 && (
        <div className={s.hint} role="alert">
          Not a valid address: {invalid.map((e) => e.raw).join(', ')}
        </div>
      )}
    </div>
  );
}

export interface ComposerProps {
  draft: MailMessage;
  /** Called after the send tool succeeded. */
  onSent?: () => void;
  /** Called when the composer should go away (closed, or the draft was discarded). */
  onClose?: () => void;
  /** Show the original message below the composer for a reply or forward (default true). */
  showOriginal?: boolean;
}

export function Composer({
  draft,
  onSent,
  onClose,
  showOriginal = true,
}: ComposerProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const id = draft.id;
  const bodyIn =
    typeof draft.body?.content === 'string'
      ? draft.body
      : { contentType: 'text', content: draft.bodyPreview ?? '' };
  const isHtml = String(bodyIn.contentType).toLowerCase() === 'html';
  const split = useMemo(
    () => (isHtml ? splitQuoted(bodyIn.content ?? '') : null),
    [isHtml, bodyIn.content]
  );
  const original = useMemo(() => (split ? parseOriginal(split.quoted) : null), [split]);
  const replyLayout = Boolean(split) || /^\s*(re|fw|fwd)\s*:/i.test(draft.subject ?? '');
  // 'quoted': a reply/forward whose history stays attached; 'preview': other HTML (read-only until
  // the user chooses plain text); 'text': an editable plain-text body.
  const initialMode: 'quoted' | 'preview' | 'text' = split ? 'quoted' : isHtml ? 'preview' : 'text';
  const [mode, setMode] = useState(initialMode);
  const initialText =
    initialMode === 'quoted'
      ? htmlToText(split?.top ?? '')
      : initialMode === 'text'
        ? (bodyIn.content ?? '')
        : '';

  const [subject, setSubject] = useState(draft.subject ?? '');
  const [to, setTo] = useState<FieldState>({
    entries: fromRecipients(draft.toRecipients),
    pending: '',
  });
  const [cc, setCc] = useState<FieldState>({
    entries: fromRecipients(draft.ccRecipients),
    pending: '',
  });
  const [bcc, setBcc] = useState<FieldState>({
    entries: fromRecipients(draft.bccRecipients),
    pending: '',
  });
  const [showCc, setShowCc] = useState(!replyLayout || (draft.ccRecipients ?? []).length > 0);
  const [showBcc, setShowBcc] = useState((draft.bccRecipients ?? []).length > 0);
  const [text, setText] = useState(initialText);
  const [bodyEdited, setBodyEdited] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const [sent, setSent] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const [notice, setNotice] = useState('');
  const { busy, error, run, clearError } = useAction();
  const ccRef = useRef<HTMLInputElement>(null);
  const bccRef = useRef<HTMLInputElement>(null);

  const base = useRef({
    subject: draft.subject ?? '',
    to: fingerprint(fromRecipients(draft.toRecipients)),
    cc: fingerprint(fromRecipients(draft.ccRecipients)),
    bcc: fingerprint(fromRecipients(draft.bccRecipients)),
    text: initialText,
  });

  const toAll = allEntries(to);
  const ccAll = allEntries(cc);
  const bccAll = allEntries(bcc);
  const anyInvalid = [...toAll, ...ccAll, ...bccAll].some((e) => !e.valid);
  const count = [...toAll, ...ccAll, ...bccAll].filter((e) => e.valid).length;

  const changes = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (subject !== base.current.subject) out.subject = subject;
    if (fingerprint(toAll) !== base.current.to)
      out.toRecipients = toGraph(toAll.filter((e) => e.valid));
    if (fingerprint(ccAll) !== base.current.cc)
      out.ccRecipients = toGraph(ccAll.filter((e) => e.valid));
    if (fingerprint(bccAll) !== base.current.bcc)
      out.bccRecipients = toGraph(bccAll.filter((e) => e.valid));
    if (bodyEdited && mode !== 'preview' && text !== base.current.text) {
      out.body =
        mode === 'quoted'
          ? { contentType: 'html', content: textToHtml(text) + (split?.quoted ?? '') }
          : { contentType: 'text', content: text };
    }
    return out;
  };
  const dirty = Object.keys(changes()).length > 0;

  const save = async (): Promise<void> => {
    await api.update(id ?? '', changes());
    base.current = {
      subject,
      to: fingerprint(toAll),
      cc: fingerprint(ccAll),
      bcc: fingerprint(bccAll),
      text,
    };
    setBodyEdited(false);
  };

  const canSend =
    !busy && !sent && !discarded && !anyInvalid && count > 0 && api.can('send') && Boolean(id);
  const canDiscard = api.can('discard') && Boolean(id);

  /** The only path to the send tool: a user click on Send. The host confirms the call. */
  const onSend = (): void => {
    if (!canSend) return;
    setNotice('');
    run(async () => {
      if (dirty) await save();
      await api.call('send', { messageId: id, confirm: true });
      setSent(true);
      setNotice('Message sent.');
      onSent?.();
    }, 'Not sent');
  };

  const onSave = (): void => {
    if (busy || sent || !dirty) return;
    setNotice('');
    run(async () => {
      await save();
      setNotice('Changes saved to the draft.');
    }, 'Not saved');
  };

  const onDiscard = (): void => {
    if (busy) return;
    if (!canDiscard || sent) return onClose?.();
    run(async () => {
      await api.call('discard', { messageId: id, confirm: true });
      if (onClose) onClose();
      else setDiscarded(true);
    }, 'Not discarded');
  };

  const unavailable = !api.host.canCallTools()
    ? 'Saving and sending need a host that can run tools for this view.'
    : !api.actions.send
      ? 'Sending is not enabled on this server.'
      : !id
        ? 'This draft has no id, so it cannot be changed or sent from here.'
        : '';

  return (
    <>
      <Card className={s.card} role="region" aria-label="Draft" appearance="outline">
        <div className={s.bar} data-sticky="top">
          <SplitAction
            label="Send"
            icon={<Send20Regular />}
            disabled={!canSend}
            onClick={onSend}
            menuLabel="More Send options"
            items={[
              {
                label: 'Save draft',
                icon: <Checkmark20Regular />,
                disabled: busy || sent || !dirty || !api.can('update'),
                onClick: onSave,
              },
            ]}
          />
          <div className={s.grow} />
          {(onClose || canDiscard) && (
            <IconButton
              label={canDiscard ? 'Discard draft' : 'Close'}
              icon={<Delete20Regular />}
              onClick={onDiscard}
              disabled={busy}
            />
          )}
          <IconButton label="Pop out (not available)" icon={<Open20Regular />} disabled />
        </div>
        <RecipientRow
          label="To"
          state={to}
          onChange={setTo}
          trailing={
            replyLayout ? (
              <>
                {!showCc && (
                  <Button
                    appearance="transparent"
                    size="small"
                    onClick={() => {
                      setShowCc(true);
                      setTimeout(() => ccRef.current?.focus());
                    }}
                  >
                    Cc
                  </Button>
                )}
                {!showBcc && (
                  <Button
                    appearance="transparent"
                    size="small"
                    onClick={() => {
                      setShowBcc(true);
                      setTimeout(() => bccRef.current?.focus());
                    }}
                  >
                    Bcc
                  </Button>
                )}
              </>
            ) : showBcc ? null : (
              <Button
                appearance="transparent"
                size="small"
                onClick={() => {
                  setShowBcc(true);
                  setTimeout(() => bccRef.current?.focus());
                }}
              >
                Bcc
              </Button>
            )
          }
        />
        {showCc && <RecipientRow label="Cc" state={cc} onChange={setCc} inputRef={ccRef} />}
        {showBcc && <RecipientRow label="Bcc" state={bcc} onChange={setBcc} inputRef={bccRef} />}

        <Input
          className={s.subject}
          appearance="underline"
          placeholder="Add a subject"
          aria-label="Subject"
          value={subject}
          onChange={(_, d) => setSubject(d.value)}
        />

        {mode === 'preview' ? (
          <div>
            <MessageBody body={bodyIn} />
            <div className={s.bar}>
              <Button
                appearance="outline"
                onClick={() => {
                  setText(htmlToText(bodyIn.content ?? ''));
                  setMode('text');
                  setBodyEdited(true);
                }}
              >
                Edit as plain text
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Textarea
              root={{ className: s.bare }}
              className={s.write}
              appearance="outline"
              resize="vertical"
              aria-label="Message body"
              placeholder={replyLayout ? 'Type your reply' : 'Type a message'}
              value={text}
              onChange={(_, d) => {
                setText(d.value);
                setBodyEdited(true);
              }}
            />
            {mode === 'quoted' && (
              <>
                <Button
                  className={s.pill}
                  size="small"
                  aria-expanded={showQuoted}
                  aria-label="Show quoted text"
                  onClick={() => setShowQuoted(!showQuoted)}
                >
                  {'…'}
                </Button>
                {showQuoted && (
                  <div className={s.quoted}>
                    <MessageBody body={{ contentType: 'html', content: split?.quoted ?? '' }} />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {discarded && (
          <MessageBar intent="info">
            <MessageBarBody>The draft was discarded.</MessageBarBody>
          </MessageBar>
        )}
        {sent && (
          <MessageBar intent="success">
            <MessageBarBody>The message was sent.</MessageBarBody>
          </MessageBar>
        )}
        {error && (
          <MessageBar intent="error" onClick={clearError}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        {!error && !sent && notice && (
          <div className={s.status} role="status">
            {notice}
          </div>
        )}
        {unavailable && <div className={s.status}>{unavailable}</div>}
        {showOriginal && original && (
          <div className={s.original} role="article" aria-label="Original message">
            <div className={s.originalHead}>
              <Avatar size={40} name={original.from} color="colorful" aria-hidden />
              <div className={s.originalWho}>
                <div>{original.from}</div>
                {original.to && <div>To: {original.to}</div>}
              </div>
              <div className={s.originalDate}>{original.sent}</div>
            </div>
            <MessageBody body={{ contentType: 'html', content: original.bodyHtml }} />
          </div>
        )}
      </Card>
    </>
  );
}
