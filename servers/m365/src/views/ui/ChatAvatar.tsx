/**
 * The chat avatars of the real list, 20px by default. A person (and the self-chat) is a circle with the
 * photo or two initials on the Fluent colourful colour; a bot or app chat is a 2px-radius square, a solid
 * brand square when the app has no icon (no letters); a meeting chat is a circle on light lavender with
 * the calendar glyph; a group chat is a grey circle with the people glyph. The presence badge needs a
 * presence tool and is not shown (see the parity matrix).
 */
import { Avatar, makeStyles, tokens } from '@fluentui/react-components';
import { CalendarLtr12Regular, People12Regular } from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import type { ChatKind } from '../teams/logic.js';

const useStyles = makeStyles({
  shape: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxSizing: 'border-box',
  },
  bot: {
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorBrandBackgroundHover,
  },
  meeting: {
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
  },
  group: {
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground6,
    color: tokens.colorNeutralForeground2,
  },
});

export function ChatAvatar({
  kind,
  name,
  size = 20,
}: {
  kind: ChatKind;
  name?: string;
  size?: 20 | 24 | 32;
}): ReactElement {
  const s = useStyles();
  if (kind === 'person')
    return <Avatar size={size} name={name} shape="circular" color="colorful" aria-hidden />;
  const box = { width: size, height: size };
  return (
    <span data-avatar={kind} aria-hidden className={`${s.shape} ${s[kind]}`} style={box}>
      {kind === 'meeting' && <CalendarLtr12Regular />}
      {kind === 'group' && <People12Regular />}
    </span>
  );
}
