# R1-T4 phase C follow-ups — the password rule and even sign-in timing (2026-09-23)

Owner decision: [2026-09-23 answers](../../../decisions/2026-09-23-r1-t4-phase-c-owner-answers.md) to the
three questions in the [phase C report](R1-T4-phase-C-throttling-2026-09-22.md) §6. Q1 (keep the
slow-down numbers): yes, nothing changed. Q2: new passwords need 8+ characters, a capital, and a
number or symbol. Q3: fix the sign-in timing leak. Commit `f6c62f50`, local, not pushed.
**Not independently reviewed yet.** The review brief is at the end.

**Recovery first.** "You crashed again" was a container restart at 23:13 UTC. It came 33 minutes after
phase C's turn had ended cleanly at 22:40 (the transcript's last line is `turn_duration`), so the
owner never saw that report. Before relaying it, this session re-ran every phase C claim and got
the same numbers:
- tsc clean; client 70/616, server 69/1347;
- PostgreSQL 24/24; browser 12/12.

The restart had put `e60e90c0` live in dev, so that was checked too. `GET /` answered 200. A sign-in
with a made-up email answered 401 through the real Neon driver: 0.95 s cold, then 31–48 ms. This
closes phase C's open item 6.

## 1. The defects (verified in the code, 2026-09-23)

**Passwords: six schemas held three different rules, and two routes checked nothing.**

| Where a password is set | Rule before |
|---|---|
| Sign-up, team invite, admin-created account, (unused) verification schema | 8 characters, upper and lower case, and a digit; a symbol did not count |
| Password reset (`resetPasswordSchema`), change (`changePasswordSchema`) | 6 characters, nothing else |
| `POST /api/merchants/verify`, `POST /api/admin/merchants/:id/activate` | **no schema**: any non-empty value, even a non-string |

The sign-up and invite pages each held a hand-copied rule. The admin form's hint said
"Minimum 6 characters". Each route refused in its own words: "Invalid reset data", "Validation
failed", "Invalid invite details", "Invalid input". So the desktop change-password box would have
said only "Validation failed".

**Sign-in timing told which emails have logins.** `authenticateUser` returned before checking any
password when:
- the email had no login;
- the login was not active;
- the business was not verified or active.

A real login paid for a bcrypt check. Admin sign-in checked a password only for the admin's email.
Measured on the unchanged code (`4b496104`, §4): a wrong password took **5 ms** for an email with
no login and **~280 ms** for a login.

**The obvious fix would not have been enough.** Most logins in dev store an older, cheaper hash. A
read-only count of hash prefixes found:
- users: 3 × `$2b$10$`, 2 × `$2b$12$`;
- `merchants.password_hash`: mixed the same way.

At cost 10 a check takes ~67 ms, against 272 ms at cost 12. One stand-in check at cost 12 for
unknown emails would have left those accounts *faster* than "no login": the leak, still there for
most real merchants. bcrypt 6.0.0 also answers a malformed hash in ~0.1 ms, which is another tell.

## 2. The fix

**One rule** — `shared/password-rule.ts:9`, `:11`:
- A new password must be **8+ characters** (code points), include a **capital letter**
  (`\p{Lu}`, so `É` counts), and include **a number or symbol** (`[\p{N}\p{P}\p{S}]`; a space is
  not a symbol).
- The module has no imports. The sign-up page loads with the app (`App.tsx` imports it eagerly),
  and `@shared/schema` would have pulled the drizzle table definitions into every first load.
- `newPasswordSchema` (`shared/schema.ts:431`) is used by all six schemas (`:447`, `:462`, `:492`,
  `:501`, `:525`, `:575`). Reset's confirmation field now needs only to be present; it must still
  match.
- Every route that sets a password now applies the rule and answers with its words:
  - reset (`server/routes.ts:902`), change (`:3729`), invite (`:6984`) and admin-created accounts
    (`:5516`) answer with the first problem's message;
  - verification (`:5110`) and admin activation (`:3641`) now parse `newPasswordSchema` and hash
    the parsed value;
  - public sign-up already answered this way.
- A rejected new password is refused before change-password's attempt counter, so it costs no
  attempt.
- Pages: sign-up and invite use the shared rule (`merchant-signup.tsx:84`, `accept-invite.tsx:49`).
  Reset and admin-create show the schema's message. The admin hint now reads "8+ characters"
  (`create-merchant.tsx:250`). Desktop change-password shows the server's message, which is now
  the rule.
- **Sign-in does not apply the rule.** A `demo123`-era password still signs in (tested).

**Even timing** — `server/auth.ts`:
- `checkPasswordEvenly` (`:186`) always spends the work of one check at `PASSWORD_HASH_COST` (12,
  `:158`, the cost every hash the app writes uses).
- With no usable hash, it makes one stand-in check at cost 12 and answers false.
- A hash at cost *c* < 12 gets its own check plus stand-ins at *c*, *c*+1, …, 11. Work doubles per
  step of cost, so 2^c + 2^c + 2^(c+1) + … + 2^11 = 2^12.
- A stand-in is `bcrypt.genSaltSync(c) + "."×31` (`:171`): a fresh salt with a result no password
  produces. It costs exactly what a real hash does and needs nothing hashed to make.
- Measured: synthetic-12 272.9 ms, real-12 271.8, real-10 66.8, real-10 plus stand-ins at 10 and 11
  273.3.
- `authenticateUser` (`:213`) looks the email up, then checks the password for every attempt,
  before any other gate. The demo-account block in production now also pays the check.
- Admin sign-in (`server/routes.ts:984`) uses the same check, with a budget of
  `max(12, the admin hash's cost)` (`passwordCheckBudget`, `auth.ts:176`). Any email costs what the
  admin's does.

## 3. Tests first

Every new test was run against the unchanged code first.

- `server/__tests__/password-rule.test.ts` (20) and `server/__tests__/sign-in-timing.test.ts` (8):
  **23 of 28 failed**, each for its own reason.
  - Timing: the work added up from a `bcrypt.compare` spy (Σ 2^cost) was 0 for an unknown email, a
    disabled login, a business not yet active and an unreadable hash. It was 16 for a cost-4 login.
    Admin: 16 for the admin's email, 0 for any other.
  - Schemas: old messages; `Password!`, `PASSWORD1` and `Élan-vital` refused; reset and change took
    `Sh0rt!`.
  - Routes: reset and change took `password1` (200); verify and activate took `password` (200);
    sign-up answered "must contain at least one uppercase letter"; invite and admin-create answered
    "Invalid invite details" / "Invalid input".
  - The 5 that passed are meant to pass on both sides: the baseline (a real login, wrong password,
    one full check), the admin signs in, reset and change allow the rule-meeting examples, and a
    `demo123`-era password signs in.
- Pages: 6 of 9 failed.
  - `accept-invite.test.tsx`: old words; `Password!` blocked.
  - `merchant-signup.test.tsx`: old words.
  - `password-rule-forms.test.tsx`: reset submitted `abcdef`; admin hint "Minimum 6 characters";
    old words.

## 4. Verified (2026-09-23)

- `tsc` clean. Server 71 files / **1,375** (1,347 + 28); client 71 / **623** (616 + 7). No older
  test set a password the rule refuses.
- **Timing, the real routes**: `node --import tsx scripts/measure-sign-in-timing.ts`.
  - In-memory storage, a clean child environment, admin hash at cost 10.
  - Cases taken in turn (round-robin) so warm-up and load fall on all alike; each email used once.
  - Median of 9 per case; the admin's email n=5 (its five free attempts). Two runs each.

  | Refused sign-in (wrong password) | old `4b496104` | new |
  |---|---|---|
  | merchant, email with no login | **5 / 5 ms** | 275 / 281 ms |
  | merchant, login at cost 12 | 282 / 279 | 276 / 278 |
  | merchant, login at cost 10 (older accounts) | **77 / 74** | 281 / 277 |
  | admin, the admin's email | **73 / 73** | 295 / 284 |
  | admin, any other email | **4 / 4** | 278 / 283 |

  New-code ranges overlap (e.g. 267–312 against 270–297 ms).
- **Real browser**: `node scripts/verify-password-rule-browser.mjs <dir>`: **9/9**. It uses the real
  pages and routes, in Chromium, via the phase C probe server.
  - Sign-up at desktop and phone size shows the rule for `password1`, stays on the step and sends
    nothing.
  - `Password!` moves on to the plans, and the server accepts the finished sign-up (200).
  - The phone invite page shows the rule and sends nothing.
  - The same check on `4b496104` (worktree): **6 FAIL**. The 3 "sends nothing" checks pass there too,
    because the old pages also refused, in other words.
  - Screenshots: [sign-up, desktop](r1-t4-password-rule-2026-09-23/signup-rule-desktop.png),
    [sign-up, phone](r1-t4-password-rule-2026-09-23/signup-rule-phone.png),
    [invite, phone](r1-t4-password-rule-2026-09-23/invite-rule-phone.png). The longer message wraps
    to two lines in the half-width field; the layout holds.

## 5. Not done / open — for the owner

1. **Sign-up says outright which emails have accounts.** `POST /api/merchants/signup` answers 409
   "Email already registered" (`server/routes.ts:5382`), so the timing fix
   alone does not stop someone working out which emails are merchants.
   - Options: keep it, as many products do; or always answer "check your email" and email the
     existing owner a note ("someone tried to sign up with your address") instead.
   - The second is a product change: new wording, a new email.
2. **Forgot-password has the same timing leak.** The reply waits for the reset link to be saved and
   the email to be sent, but only when the email has a login. With a real email provider that is
   likely a few hundred milliseconds; not measured, since that would send real email. Options:
   - **reply first, send after** — the standard fix. But the deployment is Replit **Autoscale**,
     where work after the reply may be slowed or cut off, so reset emails could be delayed or lost;
   - **always reply no sooner than a fixed time** (e.g. 1 s) — every request is a little slower, and
     it leaks only when a send takes longer than that;
   - leave it.
3. **Existing passwords are not forced to meet the rule.** They keep working until changed. A
   "set a new password" prompt at next sign-in is possible; not built.
4. **The leaked-password check** in the question was not in the answer, so it was not built.
5. **One rule replaced three.** Sign-up, invites, verification and admin-created accounts no longer
   require a lowercase letter, and a symbol counts in place of a number. Reversible in one line
   (`shared/password-rule.ts`).
6. **Seen, not touched:** the team-invite page's heading "Set up your login" is white (`#fff`,
   `.signup-step-heading h1`, designed for sign-up's dark card) on the cream page background,
   nearly invisible ([screenshot](r1-t4-password-rule-2026-09-23/invite-rule-phone.png)). It
   predates this work (`c350644a`).
7. **Timing, what remains:**
   - a stored hash dearer than cost 12 would still take longer (the code writes none);
   - admin sign-in with `ADMIN_PASSWORD_HASH` unset still answers 500 for the admin's email only
     (a configuration error, as before).
8. **Independent review** (plan §21.1).

## Handoff (plan §21.2)

```text
Phase / release:        R1-T4 phase C follow-ups (owner answers 2026-09-23): the password rule and
                        even sign-in timing; code complete; not merged, not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ f6c62f50 (local)
Scope completed:        one password rule (8+, a capital, a number or symbol) in all six schemas and
                        at every route that sets a password; clear refusals; sign-in unchanged;
                        every merchant and admin sign-in spends one cost-12 check's work
Files changed:          `git show --stat f6c62f50`
Migrations:             none
Commands run:           tsc; jest server 71/1375, client 71/623; measure-sign-in-timing (old leaks
                        5 ms vs 280 ms; new 275–295 ms throughout); verify-password-rule-browser 9/9
                        (old commit: 6 FAIL)
Negative tests:         old code red in 23 of 28 server and 6 of 9 page tests, each for its reason
Provider/UAT activity:  none (email simulated; browser loopback-only); dev database: one read-only
                        count of hash-cost prefixes
Security/privacy:       nothing new stored; stand-in hashes never match (and a stand-in check always
                        answers false); refusal texts are the same for every email
Rollback:               revert the commit; nothing is stored differently and sign-in applies no
                        rule, so every password set meanwhile keeps working
Approvals:              owner 2026-09-23 (Q1–Q3); §21.1 review owed
Next phase:             B (trusted proxy + address-keyed limits), then the R1-T9 rollout — unless the
                        owner picks items 1–2 above first
```

## Independent review — brief

**Range:** `4b496104..f6c62f50` (one code commit), local only.

Paste-ready prompt:

> You are the independent security reviewer for TaptPay, a payment-terminal SaaS. Review commit
> `f6c62f50` on branch `remediation/r1-continuation-20260907` (range `4b496104..f6c62f50`):
> the owner's 2026-09-23 follow-ups to R1-T4 phase C. First, every new password must have 8+
> characters, a capital letter and a number or symbol. Second, sign-in must not take longer when
> the email has a login. Start from
> `docs/evidence/remediation-v2-2/r1/R1-T4-password-rule-and-sign-in-timing-2026-09-23.md`; treat it
> as claims and re-derive everything from the code. Attack especially:
> - Is there any path that sets or changes a password without `newPasswordSchema`? Think of
>   storage writes reached from routes, admin tools, the Google callback's random password, and
>   seeds.
> - Does any sign-in path still answer faster, or differently, for an email with no login? Check
>   `authenticateUser`, admin sign-in, the throttle ahead of both, and any early return added or
>   left.
> - Can `checkPasswordEvenly` ever answer true for a stand-in, or false for a correct password at
>   any cost from 4 to 31?
> - Is the work-equalising arithmetic right, and does it hold under concurrency (bcrypt runs on
>   libuv's thread pool)?
> - Does the rule reject or accept anything surprising: Unicode letters, emoji, spaces, very long
>   input (bcrypt uses only the first 72 bytes)?
> - Did any refusal message or status change leak something new?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1
> (`docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`) and end with Approve / Do not approve
> naming the commit range.

Reproduce:
- `npm run check`
- `npx jest --selectProjects client`
- `npx jest --selectProjects server --runInBand`
- `node --import tsx scripts/measure-sign-in-timing.ts`
- `node scripts/verify-password-rule-browser.mjs <screenshot dir>` (needs port 5055 free).
