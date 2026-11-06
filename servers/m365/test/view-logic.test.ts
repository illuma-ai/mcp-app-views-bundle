import { describe, expect, it } from 'vitest';
import { LIST_SELECT, THREAD_SELECT, odataString, parseToolResult } from '../src/views/mail/api.js';
import { groupByConversation } from '../src/views/mail/conversation.js';
import { dateGroup } from '../src/views/mail/dates.js';
import { person, recipientsToText, toGraphRecipients } from '../src/views/mail/people.js';
import { splitQuoted, textToHtml } from '../src/views/lib/quoted.js';
import { frameStyle, themeKind, toTriplet } from '../src/views/lib/host-theme.js';
import { formatListTime, formatSize, initials } from '../src/views/lib/format.js';

const msg = (id: string, conv: string | undefined, at: string, extra = {}) => ({
  id,
  conversationId: conv,
  receivedDateTime: at,
  subject: `s-${id}`,
  from: { emailAddress: { name: `n-${id}`, address: `${id}@x.test` } },
  ...extra,
});

describe('conversation grouping', () => {
  it('groups by conversationId, keeps list order and sorts each thread oldest first', () => {
    const groups = groupByConversation([
      msg('a2', 'A', '2026-03-02T10:00:00Z', { isRead: false }),
      msg('b1', 'B', '2026-03-01T10:00:00Z'),
      msg('a1', 'A', '2026-03-01T09:00:00Z', {
        flag: { flagStatus: 'flagged' },
        hasAttachments: true,
      }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['A', 'B']);
    expect(groups[0].messages.map((x) => x.id)).toEqual(['a1', 'a2']);
    expect(groups[0].latest.id).toBe('a2');
    expect(groups[0]).toMatchObject({
      unread: true,
      flagged: true,
      attachments: true,
      subject: 's-a2',
    });
    expect(groups[0].participants).toEqual(['n-a2', 'n-a1']);
    expect(groups[1].unread).toBe(false);
  });

  it('treats messages without a conversationId as their own group', () => {
    expect(
      groupByConversation([
        msg('x', undefined, '2026-01-01T00:00:00Z'),
        msg('y', undefined, '2026-01-02T00:00:00Z'),
      ])
    ).toHaveLength(2);
  });
});

describe('date groups', () => {
  const now = new Date(2026, 2, 11, 15, 0, 0); // Wednesday 11 March 2026, local time
  const at = (d: number, h = 9) => new Date(2026, 2, d, h).toISOString();
  it('labels today, yesterday, this week, last week and earlier', () => {
    expect(dateGroup(at(11), now)).toBe('Today');
    expect(dateGroup(at(10), now)).toBe('Yesterday');
    expect(dateGroup(at(9), now)).toBe('This week');
    expect(dateGroup(at(4), now)).toBe('Last week');
    expect(dateGroup(at(1), now)).toBe('Earlier this month');
    expect(dateGroup(new Date(2025, 11, 5).toISOString(), now)).toBe('December 2025');
    expect(dateGroup(undefined, now)).toBe('Older');
  });
});

describe('reply drafts', () => {
  it('splits the quoted history from what the user writes', () => {
    const html =
      '<html><body><div>Thanks</div><hr style="display:inline-block;width:98%" tabindex="-1"><div id="divRplyFwdMsg" dir="ltr"><b>From:</b> A</div><div>orig</div></body></html>';
    const split = splitQuoted(html);
    expect(split?.top).toBe('<html><body><div>Thanks</div>');
    expect(split?.quoted.startsWith('<hr')).toBe(true);
    expect(split?.quoted).toContain('orig');
    expect((split?.top ?? '') + (split?.quoted ?? '')).toBe(html);
    expect(splitQuoted('<p>plain draft</p>')).toBeNull();
  });

  it('turns typed text into escaped html lines', () => {
    expect(textToHtml('a <b>\nc & d')).toBe('<div>a &lt;b&gt;<br>c &amp; d</div>');
    expect(textToHtml('  ')).toBe('');
  });
});

describe('recipients', () => {
  it('round-trips through the text form and Graph shape', () => {
    const graph = toGraphRecipients([
      { name: 'Ada Lovelace', address: 'ada@x.test' },
      { name: '', address: 'b@x.test' },
    ]);
    expect(graph).toEqual([
      { emailAddress: { address: 'ada@x.test', name: 'Ada Lovelace' } },
      { emailAddress: { address: 'b@x.test' } },
    ]);
    expect(recipientsToText(graph)).toBe('Ada Lovelace <ada@x.test>; b@x.test');
    expect(person(graph[0]).label).toBe('Ada Lovelace');
    expect(person(undefined).label).toBe('(unknown)');
  });
});

describe('tool results and queries', () => {
  it('parses JSON, errors and plain text', () => {
    expect(parseToolResult({ content: [{ type: 'text', text: '{"a":1}' }] }).data).toEqual({
      a: 1,
    });
    expect(
      parseToolResult({
        isError: true,
        content: [{ type: 'text', text: '{"error":"bad","message":"why"}' }],
      }).error
    ).toBe('bad: why');
    expect(parseToolResult({ content: [{ type: 'text', text: 'hello' }] })).toEqual({
      text: 'hello',
    });
    expect(parseToolResult(undefined).error).toBeTruthy();
  });

  it('escapes OData string literals and selects the fields the list uses', () => {
    expect(odataString("a'b")).toBe("a''b");
    expect(THREAD_SELECT.split(',')).not.toContain('body');
    expect(LIST_SELECT).not.toContain('body,');
  });
});

describe('host theme', () => {
  it('turns the host frame variables into a border and background', () => {
    expect(
      frameStyle({
        '--color-background-secondary': '247 247 248',
        '--color-border-secondary': '#e3e3e3',
        '--color-text-primary': 'x',
      })
    ).toEqual({
      backgroundColor: 'rgb(247 247 248)',
      borderColor: 'rgb(227 227 227)',
    });
    expect(frameStyle(undefined)).toEqual({ backgroundColor: undefined, borderColor: undefined });
  });

  it('accepts triplets, hex and rgb() and ignores anything else', () => {
    expect(toTriplet('#fff')).toBe('255 255 255');
    expect(toTriplet('rgb(205, 205, 205)')).toBe('205 205 205');
    expect(toTriplet('hsl(0 0% 0%)')).toBeUndefined();
  });

  it('never takes a black-class host surface in dark mode, and follows the page signal without a host theme', () => {
    const vars = { '--color-background-secondary': '0 0 0' };
    expect(frameStyle(vars, true).backgroundColor).toBeUndefined();
    expect(
      frameStyle({ '--color-background-secondary': '20 20 20' }, true).backgroundColor
    ).toBeUndefined();
    expect(frameStyle(vars, false).backgroundColor).toBe('rgb(0 0 0)');
    expect(frameStyle({ '--color-background-secondary': '33 33 33' }, true).backgroundColor).toBe(
      'rgb(33 33 33)'
    );
    expect(themeKind(undefined, false, true)).toBe('dark');
    expect(themeKind('light', false, true)).toBe('light');
  });

  it('picks high contrast over the host theme', () => {
    expect(themeKind('dark', false)).toBe('dark');
    expect(themeKind('light', false)).toBe('light');
    expect(themeKind(undefined, false)).toBe('light');
    expect(themeKind('dark', true)).toBe('highContrast');
  });
});

describe('formatting', () => {
  it('formats list times, sizes and initials', () => {
    const now = new Date('2026-03-10T15:00:00Z');
    expect(formatListTime('2026-03-10T09:30:00Z', now)).toMatch(/\d/);
    expect(formatListTime('2025-01-05T09:30:00Z', now)).toContain('2025');
    expect(formatListTime(undefined, now)).toBe('');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('support@x.test')).toBe('ST');
  });
});
