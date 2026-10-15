import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
export interface OperationContext {
  requestId?: string;
  jobId?: string;
}
const contexts = new AsyncLocalStorage<Readonly<OperationContext>>();
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isOperationId = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);
export function requestIdFromHeader(value: unknown) {
  return isOperationId(value) ? value.toLowerCase() : randomUUID();
}
export function getOperationContext(): Readonly<OperationContext> {
  return contexts.getStore() ?? {};
}
export function runWithOperationContext<T>(
  context: OperationContext,
  run: () => T
): T {
  const parent = getOperationContext(),
    next = { ...parent };
  if (context.requestId !== undefined)
    next.requestId = isOperationId(context.requestId)
      ? context.requestId.toLowerCase()
      : randomUUID();
  if (context.jobId !== undefined)
    next.jobId = isOperationId(context.jobId)
      ? context.jobId.toLowerCase()
      : randomUUID();
  return contexts.run(Object.freeze(next), run);
}
