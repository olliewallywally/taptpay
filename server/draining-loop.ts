export type StopWorker = (() => void) & { drain(): Promise<void> };

/** One tracked task at a time; stopping scheduling does not cancel an effect. */
export function startDrainingLoop(
  task: (canContinue: () => boolean) => Promise<void>,
  intervalMs: number
): StopWorker {
  let stopped = false,
    active: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (stopped || active) return;
    active = Promise.resolve()
      .then(() => {
        if (!stopped) return task(() => !stopped);
      })
      .finally(() => {
        active = undefined;
      });
    // The caller owns its fixed failure diagnostic. Keep rejected tasks handled
    // even if shutdown did not happen to be waiting for this tick.
    void active.catch(() => undefined);
  }, intervalMs);
  timer.unref();
  return Object.assign(
    () => {
      stopped = true;
      clearInterval(timer);
    },
    { drain: () => active ?? Promise.resolve() }
  );
}
