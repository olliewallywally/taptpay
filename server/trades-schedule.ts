/** Existing UTC cycle math for trades recurring invoices, shared by the cron and the locked schedule mutations. */
export function nextJobRun(from: Date, frequency: string, anchorDom?: number): Date {
  const date = new Date(from);
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else if (frequency === "fortnightly") date.setUTCDate(date.getUTCDate() + 14);
  else {
    // Monthly: advance one month and clamp the anchor day-of-month to the target
    // month's length. Plain setUTCMonth(+1) overflows for 29th–31st anchors
    // (e.g. Jan 31 -> Mar 3), skipping a month and permanently drifting the
    // billing date. Anchoring on the schedule's original day recovers the 31st
    // in months that have it.
    const dom = anchorDom ?? date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(dom, daysInMonth));
  }
  return date;
}

/**
 * The first date on a recurring invoice's cycle after `now`, counting on from `from` and keeping a
 * monthly one on its start date's day of the month. Resuming a paused one starts there (owner
 * decision 2026-09-27): nothing is sent for the paused time.
 */
export function nextJobRunDateAfter(from: Date, frequency: string, startDate: Date, now: Date): Date {
  const anchorDom = new Date(startDate).getUTCDate();
  let next = new Date(from);
  while (next <= now) next = nextJobRun(next, frequency, anchorDom);
  return next;
}
