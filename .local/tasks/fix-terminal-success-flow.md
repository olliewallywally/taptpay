# Fix terminal success flow — overlay, chime, and status cleanup

## What & Why

After a customer pays, three things should happen on the merchant terminal:
1. A success chime plays
2. A "Payment Received" overlay appears for 5 seconds
3. The "Payment Accepted" status badge disappears and the terminal resets to ready state

Currently none of these work reliably. Root-cause investigation identified **four distinct bugs**:

**Bug A — Mobile terminal completely unpatched.** The desktop terminal was recently fixed (constant 3s polling, `txToShow` guard, no cache wipe), but the mobile terminal (`merchant-terminal-mobile.tsx`) still has all the old bugs:
- Conditional polling that stops when there's no pending/processing data (lines 179–182)
- `queryClient.setQueryData(null)` on completion (line 296) which kills the cache and stops polling
- Raw `currentTransaction || activeTransaction` fallbacks everywhere (~20 occurrences) instead of the safe `txToShow` pattern
- These let the completed transaction leak back into the UI via `activeTransaction` after SSE re-sends it

**Bug B — "Payment Accepted" persists on mobile.** After the effect fires completion on mobile, it wipes the cache. But a subsequent SSE event or poll re-populates `activeTransaction` with the completed transaction. Since the mobile UI uses `currentTransaction || activeTransaction` (no `txToShow` guard), `null || completedTx` = completedTx, so `EnhancedPaymentStatus` renders "Payment Accepted" indefinitely.

**Bug C — SSE may not reach the terminal.** The server's `broadcastToStone(merchantId, stoneId, message)` sends to stone-specific SSE channels. If the terminal's SSE connection isn't registered to the correct stone channel, completion events from Windcave callbacks never arrive via SSE, and completion is only detected via polling — which is broken on mobile due to Bug A.

**Bug D — Silent error swallowing.** Both terminals' `playSuccessChime()` has an empty `catch {}` that silently swallows AudioContext errors. If the audio context is in a bad state, the chime fails with no diagnostic information.

## Done looks like

- After a payment completes, the merchant sees the success overlay (animated checkmark) for 5 seconds on both desktop and mobile terminals
- The success chime plays on both terminals
- The "Payment Accepted" / "Awaiting Payment" status badge disappears after completion — the terminal resets to "ready for next transaction" state
- Creating a new transaction after a completion works immediately on both terminals
- No stale completed transaction data leaks into the UI

## Out of scope

- Changing the SSE architecture (stone-specific vs merchant-wide channels)
- Changing the server's 3-minute completed-transaction fallback window
- Changing the overlay design or duration

## Tasks

1. **Fix mobile terminal polling** — Change `refetchInterval` from conditional (`pending/processing ? 1000 : false`) to constant `3000` so polling never stops.

2. **Remove mobile cache wipe** — Delete the `queryClient.setQueryData(null)` call from the mobile completion handler (the `txToShow` guard makes it unnecessary).

3. **Add `txToShow` to mobile terminal** — Create the same safe computed variable before the return statement and replace all ~20 `currentTransaction || activeTransaction` fallbacks in the JSX with `txToShow`. Also fix `startTapToPayPayment` and any other function-level fallbacks.

4. **Add error logging to chime** — Replace empty `catch {}` with `catch (e) { console.warn('Chime failed:', e); }` on both terminals so audio failures are diagnosable.

5. **Verify SSE stone channel alignment** — Confirm the terminal's `sseClient.connect()` call registers on the correct stone channel that `broadcastToStone` sends to. If misaligned, add the stone ID to the connection call.

## Relevant files

- `client/src/pages/merchant-terminal-mobile.tsx:55-104,170-183,265-309,335,438,704-706,912-919,1144,1280-1286,1527-1555,1587-1589,1847-1854`
- `client/src/pages/merchant-terminal.tsx:60-108,143-151,382-406,430-455,1293-1301,1348-1364,1506-1508`
- `client/src/components/enhanced-payment-status.tsx`
- `server/routes.ts:22-24,85-100,885-950`
