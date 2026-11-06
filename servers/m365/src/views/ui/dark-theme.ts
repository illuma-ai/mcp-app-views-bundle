/**
 * The dark theme the views use: the Fluent web dark theme with its deepest layers lifted. The web dark
 * palette's third background layer is the floor of the palette (for scroll gutters); used as a surface
 * it reads as a black band. The real product's layering is a slightly darker grey than the rows, so the
 * layer a view calls "Background3" (and a disabled control's fill) takes the second layer's value, one
 * step below the rows. The contrast gate (`npm run measure:views -- --contrast`) asserts nothing larger
 * than a few px is painted at or below the floor.
 */
import {
  type Theme,
  teamsDarkTheme,
  teamsLightTheme,
  webDarkTheme,
  webLightTheme,
} from '@fluentui/react-components';

export const viewDarkTheme: Theme = {
  ...webDarkTheme,
  colorNeutralBackground3: webDarkTheme.colorNeutralBackground2,
  colorNeutralBackground3Hover: webDarkTheme.colorNeutralBackground2Hover,
  colorNeutralBackground3Pressed: webDarkTheme.colorNeutralBackground2Pressed,
  colorNeutralBackground3Selected: webDarkTheme.colorNeutralBackground2Selected,
  colorNeutralBackgroundDisabled: webDarkTheme.colorNeutralBackground2,
  colorNeutralBackground5: webDarkTheme.colorNeutralBackground2,
  colorNeutralBackground6: webDarkTheme.colorNeutralBackground1,
};

/**
 * Chat panes. On the real page the message pane sits one layer below the message cards: pane = the
 * second layer in dark, cards = the first. In light the pane is white and the cards the soft grey, as
 * captured. Two palette slots the views never use carry these two roles in both themes
 * (`colorNeutralBackground5` is the pane, `colorNeutralBackground6` the card), so one token pair
 * gives the right layering in each theme.
 */
export const viewLightTheme: Theme = {
  ...webLightTheme,
  colorNeutralBackground5: webLightTheme.colorNeutralBackground1,
  colorNeutralBackground6: webLightTheme.colorNeutralBackground3,
};

/**
 * The Teams views (chat list, conversation, channel, composer) use the Teams themes: the brand ramp is
 * the Teams purple, so links, the compose focus line, selection and the own-message tint match the real
 * app. Outlook, OneDrive, People and To Do stay on the web themes (blue). The same chat-pane layering
 * applies: pane one layer below the cards, nothing at the palette floor.
 */
export const teamsViewLightTheme: Theme = {
  ...teamsLightTheme,
  colorNeutralBackground5: teamsLightTheme.colorNeutralBackground1,
  colorNeutralBackground6: teamsLightTheme.colorNeutralBackground3,
};

export const teamsViewDarkTheme: Theme = {
  ...teamsDarkTheme,
  colorNeutralBackgroundDisabled: teamsDarkTheme.colorNeutralBackground3,
  colorNeutralBackground5: teamsDarkTheme.colorNeutralBackground3,
  colorNeutralBackground6: teamsDarkTheme.colorNeutralBackground1,
};
