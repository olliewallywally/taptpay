/* Shared visual language for every generated report. Colours and typeface are
   lifted straight from the app (navy #040D6D / sky #58ABFF, Outfit) so a printed
   report reads as the same product as the screen it came from. Only this module
   and components.tsx touch @react-pdf styling — report files compose primitives. */
import { Font, StyleSheet } from "@react-pdf/renderer";

import OutfitRegular from "@/assets/fonts/Outfit-Regular.ttf";
import OutfitMedium from "@/assets/fonts/Outfit-Medium.ttf";
import OutfitSemiBold from "@/assets/fonts/Outfit-SemiBold.ttf";
import OutfitBold from "@/assets/fonts/Outfit-Bold.ttf";

export const FONT = "Outfit";

let registered = false;
/** Register Outfit once. Called lazily on first render so importing the theme
   (e.g. from a test or the modal) doesn't force the font engine to boot. */
export function ensureFonts() {
  if (registered) return;
  Font.register({
    family: FONT,
    fonts: [
      { src: OutfitRegular, fontWeight: 400 },
      { src: OutfitMedium, fontWeight: 500 },
      { src: OutfitSemiBold, fontWeight: 600 },
      { src: OutfitBold, fontWeight: 700 },
    ],
  });
  // Outfit's geometric caps don't need hyphenation; keep long addresses whole.
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

export const COLORS = {
  navy: "#040D6D",
  navySoft: "#1A2A8A",
  sky: "#58ABFF",
  skyWash: "#EAF3FF", // sky at ~10% for zebra rows / chart ghosts
  offWhite: "#F6F8FC",
  ink: "#0F1633", // primary body text (near-navy, softer than pure black)
  muted: "#6B7392", // secondary text / labels
  hairline: "#E2E7F2",
  white: "#FFFFFF",
  danger: "#D64550", // overdue / negative
  good: "#2FA36B", // collected / positive
} as const;

/* Page geometry — A4 with an 18mm-ish margin, in PostScript points (72/in). */
export const PAGE = {
  size: "A4" as const,
  padTop: 44,
  padBottom: 54, // room for the fixed footer
  padX: 40,
};

export const styles = StyleSheet.create({
  page: {
    fontFamily: FONT,
    fontWeight: 400,
    fontSize: 9.5,
    color: COLORS.ink,
    backgroundColor: COLORS.white,
    paddingTop: PAGE.padTop,
    paddingBottom: PAGE.padBottom,
    paddingHorizontal: PAGE.padX,
  },

  /* Brand header band (first page) */
  cover: {
    backgroundColor: COLORS.navy,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  coverBiz: { color: COLORS.white, fontSize: 15, fontWeight: 700, letterSpacing: 0.2 },
  coverMeta: { color: COLORS.sky, fontSize: 8, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 3 },
  coverTitle: { color: COLORS.white, fontSize: 20, fontWeight: 700, marginTop: 14, letterSpacing: -0.3 },
  coverPeriod: { color: COLORS.sky, fontSize: 10, fontWeight: 500, marginTop: 3 },

  /* Running header (pages 2+) */
  runHeader: {
    position: "absolute",
    top: 18,
    left: PAGE.padX,
    right: PAGE.padX,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    color: COLORS.muted,
    fontSize: 7.5,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  /* Footer */
  footer: {
    position: "absolute",
    bottom: 24,
    left: PAGE.padX,
    right: PAGE.padX,
    flexDirection: "row",
    justifyContent: "space-between",
    color: COLORS.muted,
    fontSize: 7.5,
  },

  /* Section heading */
  sectionTitle: { fontSize: 12, fontWeight: 700, color: COLORS.navy, marginTop: 16, marginBottom: 8, letterSpacing: -0.2 },

  /* KPI cards */
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  kpiCard: {
    flexGrow: 1,
    flexBasis: 0,
    backgroundColor: COLORS.offWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  kpiLabel: { color: COLORS.muted, fontSize: 7, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" },
  kpiValue: { color: COLORS.navy, fontSize: 15, fontWeight: 700, marginTop: 4, letterSpacing: -0.3 },
  kpiSub: { color: COLORS.sky, fontSize: 7.5, fontWeight: 600, marginTop: 2 },

  /* Tables */
  tHeadRow: { flexDirection: "row", backgroundColor: COLORS.navy, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  tHeadCell: { color: COLORS.white, fontSize: 8, fontWeight: 700, paddingVertical: 6, paddingHorizontal: 6, letterSpacing: 0.3 },
  tRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.hairline },
  tRowAlt: { backgroundColor: COLORS.skyWash },
  tCell: { fontSize: 8.5, paddingVertical: 5, paddingHorizontal: 6, color: COLORS.ink },
  tFootRow: { flexDirection: "row", backgroundColor: COLORS.offWhite, borderTopWidth: 1.4, borderTopColor: COLORS.navy },
  tFootCell: { fontSize: 8.5, fontWeight: 700, paddingVertical: 6, paddingHorizontal: 6, color: COLORS.navy },

  right: { textAlign: "right" },
  center: { textAlign: "center" },

  /* Status pill (rendered as coloured text; @react-pdf has no inline-block bg easily) */
  statusPaid: { color: COLORS.good, fontWeight: 700 },
  statusOverdue: { color: COLORS.danger, fontWeight: 700 },
  statusSent: { color: COLORS.sky, fontWeight: 700 },
  statusMuted: { color: COLORS.muted, fontWeight: 600 },

  empty: { color: COLORS.muted, fontSize: 9, fontStyle: "italic", paddingVertical: 14, textAlign: "center" },
});
