// client/src/lib/trades-theme.ts
// Trades vertical theme tokens — swap these to restyle the WHOLE vertical.
// Colours are placeholders; the user has not finalised them. Keep this the
// single source of trades colour so a restyle is a one-place edit.
export const TRADES_THEME = {
  INK:    '#1A1D21', // charcoal base (property's NAVY equivalent)
  ACCENT: '#FF7A1A', // safety amber (property's BLUE equivalent)
  OFFW:   '#F4F4F4',
  GREEN:  '#1BBF85',
  RED:    '#FF3B4E',
  AMBER:  '#FFB02E',
} as const;

export type TradesTheme = typeof TRADES_THEME;
