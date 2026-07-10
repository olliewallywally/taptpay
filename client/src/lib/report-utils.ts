/* Shared, side-effect-free helpers for report generation across all three
   verticals (retail, property, trades). Everything here is pure so it can be
   unit-tested without a DOM or a PDF engine — the IO (PDF share, CSV download)
   lives in report-pdf/savePdf.ts.

   Money is handled in integer cents everywhere. Retail transactions store
   `price` as a decimal-dollar string, so cross that boundary with
   dollarsToCents() at the edge and stay in cents thereafter. GST math is NZ
   15% and is always computed on a total (never summed per-line) so it can
   never drift a cent from what an accountant would compute. Dates are
   formatted and bucketed in Pacific/Auckland — a payment at 11pm NZ on the
   last of the month must land in that month's GST period, not the next. */

export const NZ_TZ = "Pacific/Auckland";
export const GST_RATE = 0.15;

/* ── Money ──────────────────────────────────────────────────────────── */

/** Parse a decimal-dollar string/number (retail `price`) into integer cents. */
export function dollarsToCents(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** "$1,234.56" — pass withCode for the "$1,234.56 NZD" report-header form. */
export function fmtNZD(cents: number, withCode = false): string {
  const neg = cents < 0;
  const dollars = Math.abs(cents) / 100;
  const body = dollars.toLocaleString("en-NZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${neg ? "-" : ""}$${body}${withCode ? " NZD" : ""}`;
}

/* ── GST (NZ 15%) ───────────────────────────────────────────────────── */

export interface GstBreakdown {
  excl: number; // cents excluding GST
  gst: number; // cents of GST
  incl: number; // cents including GST
}

/** GST-inclusive total → its excl/gst/incl split, in whole cents. */
export function calcGST(centsInclGst: number): GstBreakdown {
  const excl = Math.round(centsInclGst / (1 + GST_RATE));
  return { excl, gst: centsInclGst - excl, incl: centsInclGst };
}

/** GST-exclusive (net) amount → its split, in whole cents. */
export function calcGSTExclusive(centsExclGst: number): GstBreakdown {
  const gst = Math.round(centsExclGst * GST_RATE);
  return { excl: centsExclGst, gst, incl: centsExclGst + gst };
}

/** Interpret `cents` per the merchant's trade GST mode ("inclusive" default). */
export function calcGSTByMode(cents: number, mode?: string | null): GstBreakdown {
  return mode === "exclusive" ? calcGSTExclusive(cents) : calcGST(cents);
}

/* ── Dates (all formatting/bucketing in NZ time) ────────────────────── */

const nzParts = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year") };
};

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toDate(v: Date | string | number | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** dd/mm/yyyy in NZ time. Returns "" for null/invalid so tables don't print "Invalid Date". */
export function fmtDate(v: Date | string | number | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  const { day, month, year } = nzParts(d);
  return `${day}/${month}/${year}`;
}

/** "5 Jun 2026, 2:04 PM" NZ time — for transaction ledgers. */
export function fmtDateTime(v: Date | string | number | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** "1 Jun – 30 Jun 2026" (collapses the year when the range shares one). */
export function dateRangeLabel(start: Date, end: Date): string {
  const s = nzParts(start);
  const e = nzParts(end);
  const sMon = MONTHS_SHORT[parseInt(s.month, 10) - 1];
  const eMon = MONTHS_SHORT[parseInt(e.month, 10) - 1];
  const left = s.year === e.year ? `${parseInt(s.day, 10)} ${sMon}` : `${parseInt(s.day, 10)} ${sMon} ${s.year}`;
  const right = `${parseInt(e.day, 10)} ${eMon} ${e.year}`;
  return `${left} – ${right}`;
}

/** Whole days a due date is overdue as of `asOf` (0 if not yet due). */
export function daysOverdue(dueAt: Date | string | number | null | undefined, asOf: Date = new Date()): number {
  const due = toDate(dueAt);
  if (!due) return 0;
  const ms = asOf.getTime() - due.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/* ── Timeframe → date window (NZ-aligned) ───────────────────────────── */

export type Timeframe = "day" | "week" | "month" | "year";

/** [start, end) window for a preset timeframe, ending at `now`.
   Week is Monday-start to match the dashboards' periodWindow(). */
export function timeframeWindow(tf: Timeframe, now: Date = new Date()): { start: Date; end: Date } {
  const end = now;
  const start = new Date(now);
  switch (tf) {
    case "day":
      start.setHours(0, 0, 0, 0);
      break;
    case "week": {
      const dow = (start.getDay() + 6) % 7; // 0 = Monday
      start.setDate(start.getDate() - dow);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case "month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "year":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
  }
  return { start, end };
}

/** True when `when` falls within [start, end]. Null dates are excluded. */
export function inRange(when: Date | string | number | null | undefined, start: Date, end: Date): boolean {
  const d = toDate(when);
  if (!d) return false;
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/* ── Aged buckets (shared by Property Arrears + Trades Receivables) ──── */

export const AGE_BUCKETS = [
  { key: "1-7", label: "1–7 days", min: 1, max: 7 },
  { key: "8-30", label: "8–30 days", min: 8, max: 30 },
  { key: "31-60", label: "31–60 days", min: 31, max: 60 },
  { key: "60+", label: "60+ days", min: 61, max: Infinity },
] as const;

export interface AgedBucket<T> {
  key: string;
  label: string;
  rows: T[];
  totalCents: number;
}

/** Group overdue items into age buckets. `getDue` reads the due date, `getCents`
   the amount owed. Items not yet overdue (daysOverdue === 0) are dropped. */
export function agedBuckets<T>(
  items: T[],
  getDue: (t: T) => Date | string | number | null | undefined,
  getCents: (t: T) => number,
  asOf: Date = new Date(),
): { buckets: AgedBucket<T>[]; grandTotalCents: number } {
  const buckets: AgedBucket<T>[] = AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, rows: [], totalCents: 0 }));
  let grand = 0;
  for (const item of items) {
    const days = daysOverdue(getDue(item), asOf);
    if (days < 1) continue;
    const idx = AGE_BUCKETS.findIndex((b) => days >= b.min && days <= b.max);
    if (idx < 0) continue;
    const cents = getCents(item);
    buckets[idx].rows.push(item);
    buckets[idx].totalCents += cents;
    grand += cents;
  }
  return { buckets, grandTotalCents: grand };
}

/* ── CSV ────────────────────────────────────────────────────────────── */

/** Escape one CSV field: quote-wrap when needed, and neutralise formula
   injection (a leading = + - @ makes Excel/Sheets execute the cell). */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // formula-injection guard
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Build a CSV string from a header row and body rows. */
export function buildCSV(headers: string[], rows: (unknown[])[]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}

/* ── Small numeric helpers ──────────────────────────────────────────── */

/** Percentage 0–100, rounded to `dp`; null when the denominator is 0 so
   callers render "—" instead of NaN%. */
export function ratePct(numerator: number, denominator: number, dp = 0): number | null {
  if (!denominator) return null;
  const f = Math.pow(10, dp);
  return Math.round((numerator / denominator) * 100 * f) / f;
}

/** "72%" or "—" for a rate produced by ratePct(). */
export function fmtPct(v: number | null): string {
  return v == null ? "—" : `${v}%`;
}

export function sumCents<T>(items: T[], getCents: (t: T) => number): number {
  let total = 0;
  for (const i of items) total += getCents(i) || 0;
  return total;
}
