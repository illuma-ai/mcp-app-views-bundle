/**
 * Contacts: an alphabetical list with search, and a contact card.
 *
 * Read only. Creating, editing and deleting contacts are not reachable from the view; the card opens
 * addresses and numbers through the host links.
 */
import {
  Avatar,
  Button,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowDownload20Regular,
  ArrowLeft20Regular,
  ArrowUpload20Regular,
  Call20Regular,
  Chat20Regular,
  ChevronDown16Regular,
  Delete20Regular,
  Edit20Regular,
  Mail20Regular,
  MoreHorizontal20Regular,
  PersonAdd20Regular,
  Share20Regular,
  StarAdd20Regular,
  Tag20Regular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  contactFields,
  contactName,
  filterContacts,
  groupLetter,
  sortContacts,
} from '../contacts/logic.js';
import type { Contact } from '../contacts/types.js';
import type { Page } from '../mail/types.js';
import { IconButton, useApi, useOverflowFit } from './shared.js';

const useStyles = makeStyles({
  app: { backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1 },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  title: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, flexGrow: 1 },
  search: { flex: '1 1 220px', minWidth: 0 },
  letter: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    color: tokens.colorBrandForeground1,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '56px',
    padding: `0 ${tokens.spacingHorizontalM}`,
    border: 'none',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground1,
    textAlign: 'left',
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  text: { display: 'grid', minWidth: 0 },
  ellipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  state: {
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  foot: { display: 'flex', padding: tokens.spacingHorizontalM },
  card: { display: 'grid', rowGap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalM },
  cardHead: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM },
  field: {
    display: 'grid',
    gridTemplateColumns: '112px minmax(0, 1fr)',
    columnGap: tokens.spacingHorizontalM,
    alignItems: 'baseline',
  },
  link: {
    border: 'none',
    background: 'transparent',
    padding: 0,
    color: tokens.colorBrandForeground1,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    textAlign: 'left',
    cursor: 'pointer',
    overflowWrap: 'anywhere',
    ':hover': { textDecoration: 'underline' },
  },
  // One row, 41px: 4px above and below a 32px button and the 1px divider. What does not fit goes
  // under the ... button, as in the real command bar.
  bar: {
    display: 'flex',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    boxSizing: 'border-box',
    height: '41px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden',
    '& > button': { flexShrink: 0, whiteSpace: 'nowrap' },
  },
  emptyButton: { minWidth: '135px' },
});

export interface ContactsViewProps {
  args: Record<string, unknown>;
  result?: Page<Contact>;
  error?: string;
  received: boolean;
}

/** The list of contacts, with search and a card on selection. */
export function ContactsView({
  result,
  error: resultError,
  received,
}: ContactsViewProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Contact | null>(null);
  const seen = useRef(new Set<string>());

  const ingest = (page: Page<Contact>, replace: boolean): void => {
    if (replace) seen.current.clear();
    const fresh = (page.value ?? []).filter((c) => {
      if (!c || typeof c !== 'object') return false;
      if (c.id) {
        if (seen.current.has(c.id)) return false;
        seen.current.add(c.id);
      }
      return true;
    });
    setContacts((cur) => (replace ? fresh : [...cur, ...fresh]));
    setNext(page['@odata.nextLink'] ?? null);
  };

  useEffect(() => {
    if (!received) return;
    if (resultError) return setError(resultError);
    if (!result || !Array.isArray(result.value))
      return setError('The result is not a contact list.');
    setError(null);
    ingest(result, true);
  }, [result, resultError, received]);

  const loadMore = (): void => {
    if (!next || loading) return;
    setLoading(true);
    api
      .call<Page<Contact>>('contactsList', { top: 50, skiptoken: next })
      .then((page) => ingest(page, false))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const shown = useMemo(() => sortContacts(filterContacts(contacts, query)), [contacts, query]);

  if (open) {
    return (
      <div className={s.app}>
        <ContactCard contact={open} onBack={() => setOpen(null)} />
      </div>
    );
  }

  let lastLetter = '';
  return (
    <div className={s.app}>
      <ContactCommands />
      <div className={s.head} data-sticky="top">
        <span className={s.title}>Your contacts</span>
        <Input
          className={s.search}
          type="search"
          placeholder="Search contacts and directory"
          aria-label="Search contacts and directory"
          value={query}
          onChange={(_, d) => setQuery(d.value)}
        />
      </div>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {shown.length === 0 ? (
        <div className={s.state} role="status">
          {!received ? (
            'Waiting for contacts\u2026'
          ) : query ? (
            'No results found'
          ) : (
            <>
              <p>You haven&apos;t added any contacts yet</p>
              <Button
                appearance="outline"
                className={s.emptyButton}
                icon={<PersonAdd20Regular />}
                disabled
                title="Not available in this view"
              >
                New contact
              </Button>
            </>
          )}
        </div>
      ) : (
        <div role="list" aria-label="Contacts">
          {shown.map((c, i) => {
            const letter = groupLetter(c);
            const header = letter !== lastLetter;
            lastLetter = letter;
            const sub =
              [c.jobTitle, c.companyName].filter(Boolean).join(', ') ||
              c.emailAddresses?.[0]?.address;
            return (
              <div key={c.id ?? i} role="listitem">
                {header && <div className={s.letter}>{letter}</div>}
                <button type="button" className={s.row} onClick={() => setOpen(c)}>
                  <Avatar name={contactName(c)} color="colorful" size={40} />
                  <span className={s.text}>
                    <span className={s.ellipsis}>{contactName(c)}</span>
                    {sub && <span className={`${s.muted} ${s.ellipsis}`}>{sub}</span>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
      {next && (
        <div className={s.foot}>
          <Button
            appearance="outline"
            disabled={loading || !api.can('contactsList')}
            onClick={loadMore}
          >
            {loading ? <Spinner size="tiny" /> : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

export interface ContactCardProps {
  contact: Contact;
  onBack?: () => void;
}

/** One contact: avatar, name, role, quick actions and labelled fields. */
export function ContactCard({ contact, onBack }: ContactCardProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const fields = contactFields(contact);
  const role = [contact.jobTitle, contact.companyName].filter(Boolean).join(', ');
  const canOpen = api.host.canOpenLinks();
  return (
    <div className={s.card}>
      <div className={s.cardHead} data-sticky="top">
        {onBack && <IconButton label="Back" icon={<ArrowLeft20Regular />} onClick={onBack} />}
        <Avatar name={contactName(contact)} color="colorful" size={56} />
        <div>
          <div style={{ fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold }}>
            {contactName(contact)}
          </div>
          {role && <div className={s.muted}>{role}</div>}
        </div>
      </div>
      <ContactCommands contact={contact} />
      {fields.length === 0 && <p className={s.muted}>No contact details</p>}
      {fields.map((f, i) => (
        <div key={`${f.label}-${i}`} className={s.field}>
          <span className={s.muted}>{f.label}</span>
          {f.href && canOpen ? (
            <button type="button" className={s.link} onClick={() => api.openLink(f.href as string)}>
              {f.value}
            </button>
          ) : (
            <span style={{ overflowWrap: 'anywhere' }}>{f.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The People command bar. Every command is shown; the ones with no tool behind them, or that need a
 * contact, are disabled. Email and Call open the contact's address or number through the host.
 */
export function ContactCommands({ contact }: { contact?: Contact }): ReactElement {
  const s = useStyles();
  const api = useApi();
  const fields = contact ? contactFields(contact) : [];
  const email = fields.find((f) => f.label === 'Email');
  const phone = fields.find((f) => f.href?.startsWith('tel:'));
  const canOpen = api.host.canOpenLinks();
  const off = 'Not available in this view';
  const commands: Array<{
    id: string;
    label: string;
    icon: ReactElement;
    disabled: boolean;
    title?: string;
    onClick?: () => void;
  }> = [
    { id: 'edit', label: 'Edit', icon: <Edit20Regular />, disabled: true, title: off },
    { id: 'delete', label: 'Delete', icon: <Delete20Regular />, disabled: true, title: off },
    {
      id: 'email',
      label: 'Email',
      icon: <Mail20Regular />,
      disabled: !email || !canOpen,
      onClick: () => email?.href && api.openLink(email.href),
    },
    { id: 'chat', label: 'Chat', icon: <Chat20Regular />, disabled: true, title: off },
    {
      id: 'call',
      label: 'Call',
      icon: <Call20Regular />,
      disabled: !phone || !canOpen,
      onClick: () => phone?.href && api.openLink(phone.href),
    },
    { id: 'vcard', label: 'Share as vCard', icon: <Share20Regular />, disabled: true, title: off },
    {
      id: 'fav',
      label: 'Add to favorites',
      icon: <StarAdd20Regular />,
      disabled: true,
      title: off,
    },
    { id: 'cat', label: 'Add category', icon: <Tag20Regular />, disabled: true, title: off },
    { id: 'import', label: 'Import', icon: <ArrowDownload20Regular />, disabled: true, title: off },
    { id: 'export', label: 'Export', icon: <ArrowUpload20Regular />, disabled: true, title: off },
  ];
  // Measured, not estimated: what does not fit goes under the ... button.
  const { ref, visible } = useOverflowFit<HTMLDivElement>(commands.length);
  return (
    <div ref={ref} className={s.bar} data-sticky="top" role="toolbar" aria-label="Contact commands">
      <Button appearance="primary" icon={<PersonAdd20Regular />} disabled title={off}>
        New contact
      </Button>
      <Button
        appearance="primary"
        icon={<ChevronDown16Regular />}
        aria-label="More ways to create"
        disabled
      />
      {commands.slice(0, visible).map((c) => (
        <Button
          key={c.id}
          appearance="subtle"
          icon={c.icon}
          disabled={c.disabled}
          title={c.title}
          onClick={c.onClick}
        >
          {c.label}
        </Button>
      ))}
      {visible < commands.length && (
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
              {commands.slice(visible).map((c) => (
                <MenuItem key={c.id} icon={c.icon} disabled={c.disabled} onClick={c.onClick}>
                  {c.label}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      )}
    </div>
  );
}
