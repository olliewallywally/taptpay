import { AsyncLocalStorage } from 'node:async_hooks';
export class CronStopped extends Error {
  constructor() {
    super('cron_ownership_lost');
  }
}
const checkpoints = new AsyncLocalStorage<() => void | Promise<void>>();
export const isCronContext = () => checkpoints.getStore() !== undefined;
/** No-op for manual/HTTP actions outside a coordinated cron context. */
export async function cronCheckpoint() {
  await checkpoints.getStore()?.();
}
export function withCronCheckpoint<T>(
  check: () => void | Promise<void>,
  run: () => T
): T {
  return checkpoints.run(check, run);
}
export const isCronStopped = (error: unknown) => error instanceof CronStopped;
