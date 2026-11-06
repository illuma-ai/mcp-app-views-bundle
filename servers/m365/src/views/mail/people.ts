/** Recipient parsing and display helpers shared by the list, thread and composer. */
import type { Recipient } from './types.js';

export interface Person {
  name: string;
  address: string;
  label: string;
}

/** A display label: the name when it adds information, else the address. */
export function person(r: Recipient | undefined): Person {
  const name = r?.emailAddress?.name ?? '';
  const address = r?.emailAddress?.address ?? '';
  const label = name && name !== address ? name : address;
  return { name, address, label: label || '(unknown)' };
}

const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;

export interface ParsedRecipients {
  list: Array<{ name: string; address: string }>;
  invalid: string[];
}

/** Parses "a@b.c; Name <d@e.f>, ..." into valid recipients and the entries that failed. */
export function parseRecipients(text: string): ParsedRecipients {
  const list: ParsedRecipients['list'] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[;,\n]+/)) {
    const s = part.trim();
    if (!s) continue;
    const m = /^(.*?)\s*<([^<>]+)>$/.exec(s);
    const name = m ? m[1].replace(/^"|"$/g, '').trim() : '';
    const address = (m ? m[2] : s).trim();
    if (EMAIL.test(address)) list.push({ name, address });
    else invalid.push(s);
  }
  return { list, invalid };
}

/** Graph recipient objects from parsed entries. */
export function toGraphRecipients(list: ParsedRecipients['list']): Recipient[] {
  return list.map((r) => ({
    emailAddress: r.name ? { address: r.address, name: r.name } : { address: r.address },
  }));
}

/** The inverse of parseRecipients, for filling an input. */
export function recipientsToText(list: Recipient[] | undefined): string {
  return (list ?? [])
    .map((r) => {
      const p = person(r);
      return p.name && p.name !== p.address ? `${p.name} <${p.address}>` : p.address;
    })
    .join('; ');
}
