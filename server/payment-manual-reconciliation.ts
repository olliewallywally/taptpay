import {logOperation} from "./structured-log";
import type { ConfiguredPaymentRuntime } from './payment-runtime';

export async function reconcileRetainedPaymentsBeforeManualCommand(
  runtime: ConfiguredPaymentRuntime | undefined,
  target: { domain: 'retail' | 'property' | 'trades'; aggregateId: number | string; merchantId: number },
): Promise<void> {
  if (!runtime) return;
  try {
    const sessions = await runtime.repository.pendingSessionsForMerchant(target);
    for (let offset = 0; offset < sessions.length; offset += 4) {
      await Promise.allSettled(sessions.slice(offset, offset + 4).map(session => runtime.reconcile(session, 'poll')));
    }
  } catch {
    logOperation("error","MANUAL_COMMAND_RECONCILIATION_UNAVAILABLE",{payload:['[MANUAL_COMMAND_RECONCILIATION_UNAVAILABLE]']});
  }
  // Owner decision: an unknown result permits the command. The storage mutation
  // still checks captured money under its aggregate lock. Never drop attempts.
}
