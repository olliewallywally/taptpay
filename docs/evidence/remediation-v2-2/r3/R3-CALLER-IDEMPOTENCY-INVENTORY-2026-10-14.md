# R3 retained callers and command identity — candidate inventory

Candidate: `27d235b8` plus the reviewed working tree. R4 belongs to Claude.
This inventory records repository behavior; provider UAT and phase exit are open.
The generated route and tenant inventories record every registration and storage
method, including refusal branches. No initiation or reconciliation flag changed.

| Retained flow / caller | Disposition and authoritative path | Key, uniqueness and fingerprint | Locks / recovery / one-time effects |
| --- | --- | --- | --- |
| Retail token checkout; phone checkout | Migrate to existing R2 retail attempts through durable retail adapter | Browser UUID retained before POST; aggregate/share + key; immutable cents, reference, currency, account/environment | Retail parent, attempts, shares; stable X-ID before send; unsent expiry may release; possible acceptance retained and queried; one settlement/usage/event/outbox |
| Numeric retail; payment board checkout | Migrate to the same attempt service and verifier/finalizer | Same UUID/session/share contract; board addressing never supplies an outcome | Same parent/attempt/share lock order; no independent numeric finalizer |
| Retail hosted fields / Google Pay | Migrate to the prepared session | Retained UUID, exact session/share; wallet submission persisted once | Unknown SDK send stays pending; completion queries R2; no blind wallet resubmit |
| Retail browser callback / hashed return | Reconciliation only | Hashed expiring return state resolves persisted attempt; browser text cannot authorize | Shared inbox/finalizer; missing browser return does not lose FPRN recovery |
| Five FPRN registrations | Reconciliation only | Unique Windcave/session/kind inbox; body is only a hint | Commit inbox before ACK; fenced finite worker lease; exact binding and R2 verification; bounded retry/dead letter |
| Property/trades normal and split checkout; invoice page | Migrate to concrete invoice attempts | Retained browser UUID and exact reserved share; amount/email frozen before provider creation | Parent, attempts, concrete shares; choose full/split before preparation; one session across methods; exact share cents; one event/outbox |
| Property/trades completion and browser callbacks | Reconciliation only | Exact retained session, UUID/share or valid hashed return | Same positive-money finalizer, no next-pending-share completion; expired state cannot change money |
| Retail creation; phone/desktop terminal, API v1 | Migrate to immutable concrete creation receipts | Required UUID header; merchant/UUID unique; canonical creation fields and credential presence; HMAC-derived retail credential, stored hash only | UUID advisory lock then owned board/aggregate; one bill, original actor, audit/outbox; secret rotation refuses replacement credential |
| Property/trades invoice creation; phone/desktop terminal | Migrate to concrete creation receipts | Browser persists UUID and original automatically chosen due date; merchant/UUID unique | UUID lock then tenant/client/invoice; replay returns current original aggregate without reapplying old amount or repeating initial dispatch |
| Cash record; retail terminal | Separate audited manual action | Browser UUID; merchant/key unique; exact item/cents and original actor | Merchant/board/command locks; one cash sale/audit/outbox; no claim of provider authorization |
| Cancel retail / void property/trades / external payment | Separate audited manual action | Deterministic lifetime aggregate command; external reference fingerprint; original actor | Query retained owned attempts outside financial locks, then parent/attempt/share CAS; captured money blocks void; retain uncertain attempts; replay original audit/outbox |
| Retail/invoice split configuration | Separate audited aggregate configuration | Deterministic aggregate/count intent; exact share allocation; same configuration reuses | Freeze amount after live/sent/bound attempt; one split audit/outbox; parent, attempts, shares |
| Public quote view / accept / decline / expiry | Migrate to scoped atomic quote storage | Lifetime quote-response choice fingerprint; opposing response conflicts; deterministic view/expiry keys | Client then quote; view cannot overwrite acceptance; one response/deposit/audit/outbox; clock expiry uses internal actor |
| Blocked quote acceptance | Audited refusal | Deterministic notice identity plus rolling 24-hour query under quote lock | No deposit/acceptance; one merchant notice per original throttle window; restart/two instances preserve limit |
| Trades balance; terminal/client invoice actions | Migrate to atomic balance creation | Lifetime deposit/balance identity plus split choice fingerprint | Client, deposit, quote; subtract every nonvoided invoice; one exact remainder/audit/outbox; replay returns original invoice and skips dispatch |
| Subscription card setup; phone/tablet/desktop Billing | Migrate to concrete zero-value attempt | Retained UUID header; subscription/key unique; immutable zero NZD/validate, stable X-ID/context, original actor/status | Subscription then card attempt; send marker before POST; same shared inbox; card domain separate from money; only original explicit restart may initiate after cancellation |
| Subscription activation / paid plan upgrade / cron renewal | Migrate to concrete billing attempt | Stable server billing key; user upgrade UUID freezes original request; cents/plan/card digest/period/context/X-ID | Subscription then billing attempt; persist accepted provider transaction ID before polling; GET only after possible acceptance; one history/period/event/outbox; captured parent drift held for review |
| Subscription plan / cancellation / resume / remove card | Separate audited owner commands | Required retained UUID header; subscription/key unique; action/details fingerprint; original authenticated actor | Subscription row lock; same-key retry cannot undo later owner intent; standalone event has concrete subscription/merchant FK and atomic outbox |
| Subscription cancellation expiry | Audited system transition | Deterministic subscription/period-end UUID | Bounded locked batch with SKIP LOCKED; one cancellation event/outbox; no provider purchase |
| Standalone fake wallet / Tap to Pay | Retired/disabled | Existing tombstones and false-only capability flags | No real wallet processor added; Tap to Pay remains off |
| API v1 webhook delivery request | Unavailable before creation | Existing API-access phase owns complete webhooks; former queue stub cannot claim success | Explicit 503 for requested/default webhook; no bill is created and no fake enqueue occurs |
| Refund creation/completion | R4 dependency, Claude-owned | Existing refund graph records required effects, not proof of R4 completion | Do not merge or overwrite Claude's refund implementation; R3 retains precise independent capture identities |

Unknown acceptance never authorizes another purchase. Expired leases fence work;
they do not discard sent identity. Terminal approval/decline replay reads existing
financial records. A captured payment against a cancelled/externally-paid record
retains both the original owner action and the independent gateway capture.

Payment receipts and updates use immutable per-destination delivery targets. Actual
Resend email passes `taptpay-r3/<target UUID>` to the installed SDK, retries its exact
body/recipient inside the deduplication window, then holds uncertainty. Missing
credentials do not simulate success. An uncertain unkeyed push is held; successful
targets do not repeat because another target failed. Browser SSE and service-worker
push suppress event-ID duplicates. SSE is live/best-effort; reconnect re-reads the
stored payment. This does not claim offline or APNs display exactly-once delivery.

Existing invoice/quote dispatch and scheduled/reminder delivery are retained;
this inventory does not claim the R3 receipt receiver replaced all scheduler jobs.
R6 owns orchestration. Initial creation-command replay itself never repeats its
original dispatch. R5 raw-token contract removal remains separate.

Final recovery details: the exact confirmed unsent-expiry refusal releases only
its matching checkout UUID; unknown acceptance and ordinary conflicts retain it.
Cash replay is explicitly labelled, and an owned conflict names the previously
recorded cash sale and releases the phone's matching key for the merchant's next
explicit action. Declined retail provider IDs remain in attempts/bindings/events,
without populating captured-money fields. Inbox/outbox claims that repeatedly
lose their leases still reach the finite cap before another send/query. Committed
inbox dead-letters emit fixed diagnostic codes. The delivery worker starts for
DB-backed cash/manual events even when provider reconciliation is paused.
