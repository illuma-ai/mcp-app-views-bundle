/**
 * Fixture mail for the local view preview. Fictional people on reserved example domains; dates are
 * relative to "now" so the date groups ("Today", "This week", ...) always show. These never reach
 * the server's runtime path.
 */
import type { MailFolder, MailMessage, Page } from '../src/views/mail/types.js';

const person = (name: string, address: string) => ({ emailAddress: { name, address } });
const ME = person('Jordan Rivera', 'jordan.rivera@example.test');

const newsletterHtml = `<!doctype html><html><head><style>body{background:#000;color:#fff}</style><script>alert('x')</script></head>
<body style="background:#123456;color:#ffffff;font-family:Papyrus">
<table width="100%" cellpadding="0"><tr><td align="center" style="background:#1f2937;color:#fff;font-size:22px">Past due notice</td></tr>
<tr><td><img src="https://tracker.example.test/pixel.gif" width="1" height="1" alt="">
<img src="https://cdn.example.test/logo.png" alt="Company logo">
<h2 style="color:#ff0000">Action required: your account is past due</h2>
<p>Dear customer,</p>
<p>Your payment ending in 8423 failed. Please update your payment method at
<a href="https://billing.example.test/payment-preferences" onclick="steal()">billing.example.test/payment-preferences</a>.</p>
<p><a href="javascript:alert(1)">This link must be inert</a> and <a href="mailto:billing@example.test">this one is a mailto</a>.</p>
<blockquote>Quoted note from the previous notice.</blockquote>
<iframe src="https://evil.example.test"></iframe><form action="https://evil.example.test"><input name="card"></form>
</td></tr></table></body></html>`;

const replyHtml = (original: string) =>
  `<html><head></head><body><div></div><hr style="display:inline-block;width:98%" tabindex="-1"><div id="divRplyFwdMsg" dir="ltr"><b>From:</b> Ada Lovelace &lt;ada.lovelace@example.test&gt;<br><b>Sent:</b> Monday<br><b>To:</b> Jordan Rivera<br><b>Subject:</b> Q3 planning</div><div>${original}</div></body></html>`;

export interface Fixtures {
  inboxPage1: Page<MailMessage>;
  inboxPage2: Page<MailMessage>;
  drafts: Page<MailMessage>;
  folders: Page<MailFolder>;
  messages: Record<string, MailMessage>;
  conversations: Record<string, MailMessage[]>;
  agentDraft: MailMessage;
  htmlDraft: MailMessage;
  replyDraft: MailMessage;
  emptyDraft: MailMessage;
}

export function buildFixtures(now: Date = new Date()): Fixtures {
  const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString();
  const H = 3_600_000;
  const D = 24 * H;

  const q3: MailMessage[] = [
    {
      id: 'm-q3-1',
      conversationId: 'conv-q3',
      parentFolderId: 'f-inbox',
      subject: 'Q3 planning',
      from: person('Ada Lovelace', 'ada.lovelace@example.test'),
      toRecipients: [ME, person('Grace Hopper', 'grace.hopper@example.test')],
      receivedDateTime: ago(3 * D),
      sentDateTime: ago(3 * D),
      isRead: true,
      hasAttachments: true,
      importance: 'normal',
      bodyPreview:
        'Hi all, here is the draft plan for the third quarter. Please review the attached deck before Thursday.',
      body: {
        contentType: 'html',
        content:
          '<p>Hi all,</p><p>Here is the draft plan for the third quarter. Please review the attached deck before Thursday.</p><p>Thanks,<br>Ada</p>',
      },
      attachments: [
        {
          id: 'a1',
          name: 'Q3-plan.pptx',
          size: 2_483_200,
          contentType: 'application/vnd.ms-powerpoint',
        },
      ],
    },
    {
      id: 'm-q3-2',
      conversationId: 'conv-q3',
      parentFolderId: 'f-sent',
      subject: 'RE: Q3 planning',
      from: person('Grace Hopper', 'grace.hopper@example.test'),
      toRecipients: [person('Ada Lovelace', 'ada.lovelace@example.test'), ME],
      receivedDateTime: ago(2 * D),
      isRead: true,
      bodyPreview:
        'Looks good overall. I would move the hiring milestone to July and split the platform work into two tracks.',
      body: {
        contentType: 'html',
        content:
          '<p>Looks good overall. I would move the hiring milestone to July and split the platform work into two tracks.</p><p>Grace</p>',
      },
    },
    {
      id: 'm-q3-3',
      conversationId: 'conv-q3',
      parentFolderId: 'f-inbox',
      subject: 'RE: Q3 planning',
      from: person('Ada Lovelace', 'ada.lovelace@example.test'),
      toRecipients: [person('Grace Hopper', 'grace.hopper@example.test'), ME],
      ccRecipients: [person('Finance Team', 'finance@example.test')],
      receivedDateTime: ago(40 * 60_000),
      isRead: false,
      importance: 'high',
      flag: { flagStatus: 'flagged' },
      bodyPreview:
        'Agreed on both points. Jordan, can you confirm the budget numbers by Friday so we can lock the plan?',
      body: {
        contentType: 'html',
        content:
          '<p>Agreed on both points.</p><p>Jordan, can you confirm the budget numbers by Friday so we can lock the plan?</p><p>Ada</p>',
      },
    },
  ];

  const single = (
    id: string,
    who: [string, string],
    subject: string,
    preview: string,
    at: number,
    extra: Partial<MailMessage> = {}
  ): MailMessage => ({
    id,
    conversationId: `conv-${id}`,
    subject,
    from: person(...who),
    toRecipients: [ME],
    receivedDateTime: ago(at),
    sentDateTime: ago(at),
    isRead: true,
    bodyPreview: preview,
    body: { contentType: 'html', content: `<p>${preview}</p><p>Regards,<br>${who[0]}</p>` },
    ...extra,
  });

  const billing = single(
    'm-billing',
    ['Billing Notices', 'billing@example.test'],
    'Action required – your account is past due',
    'Past Due Notice View in Notification Center. Action required: your card payment ending in 8423 failed.',
    5 * H,
    {
      isRead: false,
      hasAttachments: false,
      body: { contentType: 'html', content: newsletterHtml },
    }
  );
  const inboxPage1: Page<MailMessage> = {
    value: [
      q3[2],
      q3[1],
      q3[0],
      billing,
      single(
        'm-alerts',
        ['Cost Alerts', 'alerts@example.test'],
        'Free tier limit alert',
        'Your account has exceeded 85% of the monthly free tier usage limit for compute hours.',
        26 * H,
        { isRead: false }
      ),
      single(
        'm-lena',
        ['Lena Okafor', 'lena.okafor@example.test'],
        'Lunch on Thursday?',
        'Are you free around noon on Thursday? There is a new place near the office I would like to try.',
        4 * D
      ),
      single(
        'm-dev',
        ['Dev Patel', 'dev.patel@example.test'],
        'Design review notes',
        'Notes from this morning are in the shared folder. Two open questions on the navigation pattern.',
        5 * D,
        { hasAttachments: true }
      ),
      single(
        'm-hr',
        ['People Operations', 'people@example.test'],
        'Open enrollment closes Friday',
        'A reminder that benefits enrollment closes this Friday at 5pm. No action is needed if you are keeping your current plan.',
        9 * D,
        { importance: 'high' }
      ),
      single(
        'm-old',
        ['Mei Tanaka', 'mei.tanaka@example.test'],
        'Welcome aboard',
        'Welcome to the team! Here is a short list of people to meet in your first two weeks.',
        40 * D
      ),
    ],
    '@odata.nextLink': 'https://graph.example.test/v1.0/me/mailFolders/inbox/messages?$skip=10',
  };
  const inboxPage2: Page<MailMessage> = {
    value: [
      single(
        'm-p2a',
        ['Sam Whitfield', 'sam.whitfield@example.test'],
        'Weekly metrics',
        'Attached is the weekly metrics summary. Sign-ups are up 12 percent week over week.',
        41 * D
      ),
      single(
        'm-p2b',
        ['Noor Haddad', 'noor.haddad@example.test'],
        'Conference travel',
        'Flights are booked for the conference. Itinerary is attached; hotel confirmation to follow.',
        44 * D,
        { hasAttachments: true }
      ),
    ],
  };

  const drafts: Page<MailMessage> = {
    value: [
      {
        id: 'd-existing',
        conversationId: 'conv-d-existing',
        subject: 'Budget confirmation',
        isDraft: true,
        isRead: true,
        from: ME,
        toRecipients: [person('Ada Lovelace', 'ada.lovelace@example.test')],
        receivedDateTime: ago(30 * 60_000),
        bodyPreview: 'Hi Ada, the budget numbers are confirmed.',
        body: {
          contentType: 'text',
          content:
            'Hi Ada,\n\nThe budget numbers are confirmed. I will send the spreadsheet separately.\n\nJordan',
        },
      },
    ],
  };

  const folders: Page<MailFolder> = {
    value: [
      { id: 'f-inbox', displayName: 'Inbox', unreadItemCount: 4, totalItemCount: 900 },
      { id: 'f-sent', displayName: 'Sent Items', unreadItemCount: 0, totalItemCount: 640 },
      { id: 'f-projects', displayName: 'Projects', unreadItemCount: 3, totalItemCount: 120 },
      { id: 'f-receipts', displayName: 'Receipts', unreadItemCount: 0, totalItemCount: 48 },
      { id: 'f-newsletters', displayName: 'Newsletters', unreadItemCount: 12, totalItemCount: 380 },
    ],
  };

  const messages: Record<string, MailMessage> = {};
  for (const m of [
    ...(inboxPage1.value ?? []),
    ...(inboxPage2.value ?? []),
    ...(drafts.value ?? []),
  ])
    if (m.id) messages[m.id] = m;
  const conversations: Record<string, MailMessage[]> = { 'conv-q3': q3 };

  return {
    inboxPage1,
    inboxPage2,
    drafts,
    folders,
    messages,
    conversations,
    agentDraft: {
      id: 'd-agent',
      subject: 'Follow-up on the Q3 budget',
      isDraft: true,
      toRecipients: [
        person('Ada Lovelace', 'ada.lovelace@example.test'),
        person('Grace Hopper', 'grace.hopper@example.test'),
      ],
      ccRecipients: [person('Finance Team', 'finance@example.test')],
      body: {
        contentType: 'text',
        content:
          'Hi Ada and Grace,\n\nThe budget numbers are confirmed and attached to the planning doc. Please let me know if anything looks off before Friday.\n\nThanks,\nJordan',
      },
    },
    htmlDraft: {
      id: 'd-html',
      subject: 'Customer briefing',
      isDraft: true,
      toRecipients: [person('Lena Okafor', 'lena.okafor@example.test')],
      body: {
        contentType: 'html',
        content:
          '<p>Hi Lena,</p><p><b>Agenda</b></p><ul><li>Roadmap highlights</li><li>Open questions</li></ul><p><a href="https://example.test/briefing">Briefing document</a></p><img src="https://cdn.example.test/chart.png" alt="Chart">',
      },
    },
    replyDraft: {
      id: 'd-reply',
      subject: 'RE: Q3 planning',
      isDraft: true,
      toRecipients: [person('Ada Lovelace', 'ada.lovelace@example.test')],
      body: {
        contentType: 'html',
        content: replyHtml(
          '<p>Agreed on both points.</p><p>Jordan, can you confirm the budget numbers by Friday so we can lock the plan?</p>'
        ),
      },
    },
    emptyDraft: {
      id: 'd-new',
      subject: '',
      isDraft: true,
      toRecipients: [],
      body: { contentType: 'text', content: '' },
    },
  };
}
