/** Existing UTC cycle math, shared by cron and locked schedule mutations. */
export function computeNextRunDate(from: Date, frequency: string): Date {
  const d = new Date(from);
  if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === "fortnightly") d.setUTCDate(d.getUTCDate() + 14);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Resume at the first cycle after now; never bill the time spent paused. */
export function nextRunDateAfter(from: Date, frequency: string, now: Date): Date {
  let next = new Date(from);
  while (next <= now) next = computeNextRunDate(next, frequency);
  return next;
}
