# Gap 11 — pacing: land C0/C1 now, schedule C2-C5 separately

Date: 2026-09-14 UTC
Owner: Oliver
Execution lineage: `remediation/r1-continuation-20260907`.

Shown the six-step sequence in
[gap11-split-session-single-use-design](2026-09-13-gap11-split-session-single-use-design.md)
§4 (`C0` preflight, `C1` additive partial unique indexes, `C2` compare-and-set
finaliser, `C3` migrate onto the `payment_attempts` engine, `C4`
callback/notification reconciliation by session, `C5` durable inbox), Oliver
answered: **"Land the safe pieces now, schedule the rest."**

**Effect:** `C0`+`C1` were implemented and independently re-verified this
session — see
[R1-T7-gap11-c0-preflight-c1-index-2026-09-14](../evidence/remediation-v2-2/r1/R1-T7-gap11-c0-preflight-c1-index-2026-09-14.md)
(committed `5318496b`). `C2`-`C5` — the actual replay-mechanism fix — remain
**not started**, separately scheduled, and are gap 11's real close condition;
the two indexes landed are defense in depth only and do not stop the replay
described in the design memo's §1.
