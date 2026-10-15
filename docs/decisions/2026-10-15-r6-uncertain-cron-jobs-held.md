# Owner decision — hold uncertain cron jobs for review

October15 2026. Owner answered “Approve holding uncertain jobs for review
(recommended)” to the concrete recovery proposal in
../operations/r6-durable-cron-design.md.

If a started job may have sent a message or partly recorded an effect before
crash/lost ownership, retain a durable hold for that affected job type. Other
job types can continue. A new scheduler slot/restart/lease must not silently
repeat it. Reconciliation must verify completion or safe retry and explicitly
resolve the exact hold. This approves repository route integration of this
policy, not actual resolution of any live hold, provider action or deployment.

D9 entitlement/dunning, R5 release closeout and actual UAT remain separate.
