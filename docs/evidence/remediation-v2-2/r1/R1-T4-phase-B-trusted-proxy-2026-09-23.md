# R1-T4 phase B — the visitor's real address, and limits per address (2026-09-23)

[Plan](../../../PLAN-2026-09-21-r1-t4-sign-in-security.md) phase B: "Set Express's `trust proxy` to
Replit's exact depth; tests with spoofed `X-Forwarded-For`, host and protocol."

Owner decisions:
- [2026-09-21, Q4](../../../decisions/2026-09-21-r1-t4-t9-owner-answers.md): the check happens on the
  live deployment when the owner next opens the site; until then phase B ships the setting off by
  default, with its tests.
- Phase C moved its address-keyed limits here.
- "then start phase B" ([2026-09-23](../../../decisions/2026-09-23-r1-t4-enumeration-owner-answers.md)).

Commit `ce3c13de`, local, not pushed. **Not independently reviewed yet.** Review brief at the end.

## 1. What was found (verified in the code, 2026-09-23)

1. **No `trust proxy` anywhere** (plan finding 6). Behind Replit's proxy, `req.ip` is the proxy for
   every visitor. Nine `req.ip` uses in `server/routes.ts` depend on it:
   - the sign-in security logs;
   - the in-memory `checkRateLimit` (sign-up, the payment return, NFC capabilities, live events);
   - `paymentTokenRateLimiter`.
2. **`getBaseUrl` believed forwarded headers no matter who sent them.** With no public address
   configured it built links from raw `X-Forwarded-Proto` and `X-Forwarded-Host`. A stranger asking
   for a merchant's password reset with `X-Forwarded-Host: evil.test` had the link emailed as
   `https://evil.test/reset-password?token=…` (reproduced, §3): reset-link poisoning. Production
   requires `PUBLIC_ORIGIN`, so this was a development-only exposure.
3. **No limit per address anywhere**, since phase C removed the old in-memory one, which was one
   bucket for everyone.

## 2. The fix

- **`TRUST_PROXY_HOPS`** (`server/config.ts:175`, `.env.example`), parsed strictly. Anything else
  stops the app starting.

  | Value | Meaning |
  |---|---|
  | unset (the default) | not known: no forwarded header is believed, no address limit applies |
  | `0` | no proxy: the connection's own address is the visitor's |
  | `1`–`9` | trust that many proxy hops |

- **`trust proxy`** is set to that number when it is 1 or more (`server/routes.ts:464`). It is set
  in `registerRoutes`, so the real server, the test harness and the probes all get it.
- **The visitor's address for limits** (`server/client-address.ts:14`):
  - null while the setting is unset, otherwise Express's `req.ip`;
  - an IPv4-mapped address is unwrapped;
  - IPv6 is grouped by its /64 network, because a home or phone is usually given a whole /64
    (`limitAddress`, `:24`).
- **Per-address limits** (`server/auth-throttle.ts:56`–`70`, `:209`–`224`). HMAC-keyed like the
  others, so no address is stored. None applies while addresses are unknown.

  | Door | Free | Then | Cap | Forgotten after |
  |---|---|---|---|---|
  | Sign-in, per address (merchant and admin apart) | 50 | 30 s, doubling | 15 min | 1 h untouched |
  | Forgot-password, per address | 10 | 1 min, doubling | 30 min | 1 h untouched |
  | Google callback, per address | 20 | 30 s, doubling | 15 min | 1 h untouched |

  - **Sign-in** (`:839`, merchant and admin): an attempt counts against its address as well as its
    email or device.
    - A device that already knows the email is never counted against the address, so phase C's
      promise holds: no one else's guesses keep a merchant's own device out.
    - A success gives its address try back (`void`, `:880`, `:1070`) and never clears the
      address's count.
  - **Forgot-password** (`:917`): both counts are checked before any link is made.
  - **Google callback** (`:653`): counted after the state check, only when it will ask Google. A
    success gives its count back (`:767`). Cancels and failed state checks are never counted.
- **`getBaseUrl`'s fallback** (`server/url-utils.ts:26`) uses `req.protocol` and the Host header.
  `req.protocol` believes `X-Forwarded-Proto` only from a trusted proxy. Raw `X-Forwarded-*`
  headers are never used.
- **`GET /api/admin/request-origin`** (`server/routes.ts:1001`), admin-only and `no-store`. It shows
  how the caller's own request arrived:
  - the forwarded chain, the connection address, and the address and protocol the app takes;
  - for each possible hop count, which address it would take.

  It is the tool for the live check below, and the tests' way to observe what the app believes.
- **Route inventory regenerated** (223 registrations, 0 unclassified).
  - `POST /api/auth/google/session` joins `PUBLIC_PATH_ALLOWLIST`. A fresh generation had called it
    "unclassified" since phase A: phase A had set "public" in the generated file by hand.
  - The callback's stale reason ("ISSUES the JWT") is corrected.
  - The documentation table had drifted since its last generation and is regenerated too.

## 3. Tests first

On `fa0b0230` (unchanged code), **20 failed**, each for its reason:
- **Config** (`config.test.ts`, 12): no `trustProxyHops`; nothing refused.
- **Diagnostic** (`trusted-proxy.test.ts`, `trusted-proxy-off.test.ts`, 3): 404.
- **Sign-in and admin sign-in:** 401 where the 51st attempt from one address should wait.
- **Forgot-password:** 200 at the 11th.
- **Google:** the 21st callback still asked Google.
- **Reset link** (`forwarded-host-links.test.ts`): `https://evil.test/reset-password?token=…`.
- **Guards passing on both sides:** cancels and bad states are never counted; with the setting off,
  25 callbacks from one address all reach Google.

New since: `client-address.test.ts` (address folding, 14).

## 4. Verified (2026-09-23)

- The phase B and route-inventory suites: 149/149.
- `tsc` clean; server 76 files / **1,420** (1,384 + 36); client 71 / **623**.
- With one trusted hop, the diagnostic takes `203.0.113.9` from `X-Forwarded-For:
  198.51.100.7, 203.0.113.9`: the entry the visitor wrote is ignored, and `X-Forwarded-Proto: https`
  is believed from the trusted proxy.
- With the setting off, the same forged headers change nothing: the connection's address, and
  `http`.
- The sign-in sequence from one address:
  - 49 wrong tries;
  - the merchant signs in (given back);
  - the 50th wrong try answers 401;
  - the 51st waits, `Retry-After: 30`;
  - the merchant's own device still signs in (200);
  - another address answers 401.
- No storage code changed (the per-address counters use phase C's all-or-nothing take, already
  verified on PostgreSQL across two instances), so no PostgreSQL rerun was needed.

## 5. The live check (owner item Q4), step by step

1. Deploy this code as it is. The setting stays unset: nothing changes for anyone.
2. Sign in to the admin area on the live site. Open the browser's console (F12 → Console) and
   paste:

   ```js
   fetch('/api/admin/request-origin', { headers: { Authorization: 'Bearer ' + localStorage.getItem('adminAuthToken') } }).then(r => r.json()).then(r => { console.table(r.candidates); console.log(r); })
   ```

3. Look up your own public address (search "what is my IP"). Find the row showing it: its `hops`
   is the value to set as `TRUST_PROXY_HOPS` in the deployment's secrets. Redeploy.
4. Paste the line again. `clientAddress` should now be your own address, and `addressLimits` "on".

Once it is on:
- the in-memory limiters in §1.1 also become per visitor (today they are one bucket for everyone);
- the security log records visitors' real addresses, as it was always meant to.

## 6. Not done / open — for the owner

1. **The live check** above.
2. **The older in-memory limiters stay as they are.** They are `checkRateLimit`, 100 a minute per
   address, on sign-up, the payment return, NFC capabilities and live events; and the payment-token
   limiter.
   - They become per visitor once the setting is on.
   - They are still per server instance, not shared, and with the setting off still one bucket for
     everyone. Moving them to the shared counters is possible; not done.
3. **Sign-up and the confirmation resend have no per-address limit** (per-address-asked limits
   only). With the setting on, sign-up's old `checkRateLimit` covers it.
4. **Independent review** (plan §21.1).

## Handoff (plan §21.2)

```text
Phase / release:        R1-T4 phase B: TRUST_PROXY_HOPS (off by default), per-address limits for
                        sign-in, forgot-password and the Google callback; not merged, not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ ce3c13de (local)
Migrations:             none
Commands run:           tsc; jest server 76/1420, client 71/623; phase B suites 149/149; red 20 first
Provider/UAT activity:  none (Google replaced by a stub; email captured by a mocked client)
Security/privacy:       no forwarded header believed unless configured; no address stored (HMAC
                        keys); once on, the security log holds real visitor addresses
Rollback:               revert the commit; with the setting unset the app behaves as before, except
                        that getBaseUrl's no-origin fallback no longer reads raw forwarded headers
Approvals:              owner 2026-09-21 (Q4) and 2026-09-23; §21.1 review owed
Next phase:             the owner's live check (§5), then the R1-T9 rollout
```

## Independent review — brief

**Range:** `fa0b0230..ce3c13de`, local only.

> You are the independent security reviewer for TaptPay. Review commit `ce3c13de` on branch
> `remediation/r1-continuation-20260907` (range `fa0b0230..ce3c13de`): R1-T4 phase B. It adds
> the trusted-proxy setting (off by default) and limits per visitor address for sign-in,
> forgot-password and the Google callback. Start from
> `docs/evidence/remediation-v2-2/r1/R1-T4-phase-B-trusted-proxy-2026-09-23.md`; treat it as claims.
> Attack especially:
> - With the setting off, can any header a visitor writes change the address, protocol or host the
>   app acts on?
> - With it on, can a visitor pick their own bucket, or someone else's?
> - Can the per-address limits keep a merchant out: through a shared address (office, carrier NAT),
>   through the admin realm, or around the known-device exemption?
> - Is the IPv6 /64 grouping right?
> - Is the diagnostic endpoint safe to leave in place?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1 and end with Approve / Do not
> approve naming the commit range.

Reproduce: `npm run check`; `npx jest --selectProjects server`; `npx jest --selectProjects client`;
`npx jest server/__tests__/trusted-proxy.test.ts server/__tests__/trusted-proxy-off.test.ts
server/__tests__/forwarded-host-links.test.ts --selectProjects server`.
