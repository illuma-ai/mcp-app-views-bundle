/**
 * The outer frame of every view. Border and background come from the host's style variables so the
 * view blends into the surrounding chat; everything inside is the Fluent theme.
 */
import { makeStyles, shorthands, tokens } from '@fluentui/react-components';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

const useStyles = makeStyles({
  frame: {
    overflow: 'hidden',
    borderRadius: tokens.borderRadiusLarge,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    color: tokens.colorNeutralForeground1,
    // The theme's own surface; the host's colour (when usable) is applied on top by the style prop.
    backgroundColor: tokens.colorNeutralBackground1,
  },
  padded: { padding: tokens.spacingHorizontalS },
});

export function Frame({
  style,
  padded,
  children,
}: {
  style: CSSProperties;
  padded?: boolean;
  children: ReactNode;
}): ReactElement {
  const s = useStyles();
  return (
    <div className={`${s.frame}${padded ? ` ${s.padded}` : ''}`} style={style}>
      {children}
    </div>
  );
}
