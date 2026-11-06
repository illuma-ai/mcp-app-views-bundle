/** Contact logic with no UI: names, ordering, filtering and field lists. */
import type { Contact, ContactAddress } from './types.js';

/** The name shown for a contact: the display name, else the parts, else the first address. */
export function contactName(c: Contact): string {
  const display = c.displayName?.trim();
  if (display) return display;
  const parts = [c.givenName, c.surname].filter(Boolean).join(' ').trim();
  return parts || c.emailAddresses?.[0]?.address || 'Unnamed contact';
}

/** Alphabetical by name, ignoring case. */
export function sortContacts(list: Contact[]): Contact[] {
  return [...list].sort((a, b) =>
    contactName(a).localeCompare(contactName(b), undefined, { sensitivity: 'base' })
  );
}

/** The letter a contact is grouped under ("#" for anything that is not a letter). */
export function groupLetter(c: Contact): string {
  const first = contactName(c).charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

/** Contacts whose name, company or any address contains the text. */
export function filterContacts(list: Contact[], query: string): Contact[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) =>
    [contactName(c), c.companyName, ...(c.emailAddresses ?? []).map((e) => e.address)]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  );
}

/** One address on a single line, skipping empty parts. */
export function addressLine(a: ContactAddress | undefined): string {
  if (!a) return '';
  return [a.street, a.city, [a.state, a.postalCode].filter(Boolean).join(' '), a.countryOrRegion]
    .filter((p) => p && String(p).trim())
    .join(', ');
}

export interface ContactField {
  label: string;
  value: string;
  /** The link a value opens through the host, when it has one. */
  href?: string;
}

/** The labelled fields a card shows, in the order they appear, leaving out empty ones. */
export function contactFields(c: Contact): ContactField[] {
  const out: ContactField[] = [];
  for (const e of c.emailAddresses ?? []) {
    if (e.address) out.push({ label: 'Email', value: e.address, href: `mailto:${e.address}` });
  }
  if (c.mobilePhone)
    out.push({ label: 'Mobile', value: c.mobilePhone, href: `tel:${c.mobilePhone}` });
  for (const p of c.businessPhones ?? []) {
    if (p) out.push({ label: 'Work phone', value: p, href: `tel:${p}` });
  }
  for (const p of c.homePhones ?? []) {
    if (p) out.push({ label: 'Home phone', value: p, href: `tel:${p}` });
  }
  const work = addressLine(c.businessAddress);
  if (work) out.push({ label: 'Work address', value: work });
  const home = addressLine(c.homeAddress);
  if (home) out.push({ label: 'Home address', value: home });
  return out;
}
