// client/src/lib/trades-theme.ts
// Trades vertical theme tokens — swap these to restyle the WHOLE vertical.
// Palette (user-chosen 2026-06-26): navy base + sky-blue accent + off-white —
// the same palette as the property vertical (user asked to mirror PM exactly).
// Keep this the single source of trades colour so a restyle is a one-place edit.
export const TRADES_THEME = {
  INK:    '#040D6D', // navy base (matches property's NAVY)
  ACCENT: '#58ABFF', // sky-blue accent + card surface (matches property's BLUE/sky)
  OFFW:   '#F4F4F4',
  GREEN:  '#1BBF85',
  RED:    '#FF3B4E',
  AMBER:  '#FFB02E',
} as const;

export type TradesTheme = typeof TRADES_THEME;
