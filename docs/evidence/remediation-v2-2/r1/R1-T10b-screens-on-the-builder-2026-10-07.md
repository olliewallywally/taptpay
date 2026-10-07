# R1-T10b — the other screens onto the route builder

Exact branch `remediation/r1-continuation-20260907`.
[Plan, method and preflight](../../../PLAN-2026-10-06-r1-t10-acceptance-matrix.md)
("T10b preflight"). T10b moves the screens the app renders onto the builder T10a made,
in seven batches, each its own commit. **All seven are code-complete; independent
review is owed for every one. R1-T10 is not complete**: the device, tutorial and
accessibility matrix (T10c to T10e) and what only the owner can close (T10f) remain.

| Batch | Code | Base | Files | Spelled addresses moved |
|---|---|---|---|---|
| 1. Settings, and the builder's additions | `997c28ad` | `5339b08b` | 4 | 76 |
| 2. Retail | `a07c5072` | `997c28ad` | 12 | 110 |
| 3. Property, and no built address made longer | `cda1988b` | `a07c5072` | 7 | 65 |
| 4. Trades, and a cache key names a GET | `2c796135` | `cda1988b` | 10 | 101 |
| 5. What a customer opens: pay, split, checkout, receipt | `ffa4a544` | `2c796135` | 8 | 48 |
| 6. The shell (app, tutorial, onboarding, push, live updates) | `633eebb1` | `ffa4a544` | 6 | 33 |
| 7. The admin area, and the guard turned round | `7f62a6b0` | `633eebb1` | 4 | 24 |

**No file the app loads spells an API address any more.** The audit counted 463 spelled
addresses in the 52 files the app renders: **457 are moved**, and six were never API
addresses (the admin area has a page of its own at the address `/api`; they stay). The
app's source now names 160 of the 178 listed routes, in 63 files.

What still spells an address is 14 files the app never loads (118 addresses), left as
they are and held by the test. They are listed for the owner at the end.

**One existing test was changed, on purpose, in batch 5** (below). No other client test
changed in any batch.

## How each batch is checked

The move is mechanical, so it is done and checked by tools kept apart from each other,
and the hand is kept for what a tool cannot place.

1. **Red first.** The batch's files are added to the guard's list before they are
   touched: the contract test fails and lists every address they spell.
2. **The rewrite** (`t10b/codemod.ts`, scratch) matches each spelled address to exactly
   one listed route by its shape and by the method its call says, and writes the builder
   in its place. What it cannot place with certainty it leaves and lists.
3. **The proof** (`t10b/proof.ts`, scratch, written apart from the rewrite) reads each
   file on the commit before and now: every address must pair one for one with a built
   one, with the same text pieces, the same values between them, the same query tail and
   the same method wherever the old call said one; and with those expressions cut out of
   both, and the builder's import removed, **the rest of the file must be the same
   text**.
4. **A place changed by hand** is named to the proof by its exact text on each side. It
   is cut out of both, and the rest of that file is held to the proof like any other.
   The place itself is read, and run side by side with the old expression.
5. **The proof is itself tried** on planted mistakes (a neighbouring route, another
   method, another value, two values swapped, a tail dropped, a label for a route,
   anything else changed, a hand place that is not the text named): it must fail on each.
6. The type check holds every name to the list and every value to its type; the
   contract test reads every name and method from the source; the existing client tests
   must pass.
7. A mutation check on scratch copies, the production build, the server tests that read
   client source, both generators (no route changed, so nothing may drift), then the
   commit, then the full client and server suites on an archived copy of the commit.

**The proof was tightened once, in batch 4.** Tried on a planted mistake it missed one:
a list's address named for the POST route of the same path, in a call that does not say
its method (the address is handed to a helper). It had passed either. It now **fails**
where a call says no method and more than one listed route has that path, unless the
method read from the helper by hand is given to it; the first word of a cache key is a
GET by rule. All four batches then moved were run through it again and pass.

## Batch 1 — Settings, and what the builder gained (`997c28ad`)

**The builder changed in one respect from T10a, and from this batch's own preflight.**
T10a's builder refused, by throwing, a value it could not use. The preflight kept that
and planned a second, non-throwing builder (`apiPathOrNull`) for the two places an
address is worked out while a page is drawn. Building it showed that was the wrong way
round: an address worked out while drawing is ordinary (the checkout page does it), a
throw there is a blank screen, and pages show a failed request's own words to the
person, which a thrown refusal's are not. So there is one builder and **it never
throws**. It writes into the path only what the server could read as that parameter (a
positive whole number, or text percent-encoded into one segment) and otherwise leaves
the parameter's own name there (`/api/merchants/:id/profile`). The server's parsers
refuse that exactly as they refused `undefined` or `NaN` before. A wrong value still
never becomes the address of something else, and nothing it was handed is repeated in
the address. `apiPathOrNull` was not built.

Also new in `shared/api-path.ts`, each with tests written first:

- **A value the page may not have yet** (null, undefined) is allowed by a parameter's
  type; its place in the path keeps the parameter's name. A parameter left out, an
  extra one, a route the server does not have, or text for a whole number still does
  not typecheck.
- **`wholeNumber(text)`**: a whole-number id that reached the page as text is read
  exactly as the server's own parser reads one (`"22"`, never `"022"`, `"22.0"`, `" 22"`
  or `"2e1"`), otherwise null. Tested against that parser over 29 texts.
- **Five cache labels** as named constants (`MERCHANTS_KEY` and four others). A label is
  the first word of a cached entry's name where that word is not itself an address.
  **Every cache key keeps its value.**

**The contract test now reads the client's syntax tree** rather than its text (28 tests
became 36): every route name is written out where it is used and is a listed one; a
method said beside a built address (`fetch` and its wrappers, `apiRequest`,
`EventSource`, through a query tail or a choice of two) is the route's own, and one
that cannot be read at the call is refused; a label is only ever the first word of a
key, each is the start of a listed route's path and none can itself be fetched; a moved
file spells no address (a comment that mentions one is not one).

**Moved:** `pages/settings`, `desktop/DesktopSettingsPage`,
`hooks/use-billing-card-return`, `lib/merchant`. 76 spelled addresses became 67 uses of
24 route names and 9 uses of a label.

Verification:

- Red first: with the final test file on an archived copy of `5339b08b`, **24 of 36
  fail** (the builder's new behaviour, `wholeNumber`, the labels, the guard). On the
  tree before the four files moved, 5 of 36.
- The proof: **4 files, 76 addresses paired, none differs**, and nothing else in the
  four files changed. Tried on 14 planted mistakes: 14 caught.
- Contract test **36 pass**. No client test file is in the commit.
- Mutation check: **59 of 59 planted defects caught** on the final code: 22 in building
  an address, 10 in `wholeNumber`, 10 in the labels, 17 in what the contract test reads
  from the pages. The first run caught 58; the one survivor showed a condition in the
  builder that could not change its answer, which was removed, and the builder's 22 and
  the other 37 were run again on the final code.
- The server tests that read client source: 5 suites / 110 tests. Typecheck, production
  build and whitespace pass. Generators: 194 registrations / 0 unclassified / 0 gaps;
  266 storage contracts; 178 browser routes; no drift.
- **Full client: 117 suites / 1,420 tests pass** (42.843 seconds) and **full server:
  180 suites / 4,472 tests pass** (798.079 seconds), both exit 0, on an archived copy of
  `997c28ad`. The server's count is T10a's 4,464 plus the contract suite's 8 new tests.

## Batch 2 — Retail (`a07c5072`)

**Moved:** the phone and desktop retail terminals, the desktop home, analytics and
stock, the phone stock, transactions and dashboard pages, the retail reports button,
the board builder, the QR display and the payment stack: twelve files. 110 spelled
addresses became 54 uses of 20 route names and 56 uses of the merchants label. The
rewrite placed all 110.

Two ids reach their page as text where the server reads a whole number, and now go
through `wholeNumber()`: the board chosen in the board builder (a select's value, always
the text of a board's own number) and a refund's transaction on the phone terminal
(typed as text or a number). Text written as the server reads a whole number builds the
address it always did; anything else leaves the parameter's name for the server to
refuse, as it refused it before.

Verification:

- Red first: on the tree with the twelve files listed and not yet moved, the guard lists
  **110 spelled addresses**. With the final test file on an archived copy of
  `997c28ad`, 5 of 36 fail (the guard and the floors below).
- The proof: **12 files, 110 addresses paired, none differs**; 2 values now read through
  `wholeNumber()`; nothing else in the twelve files changed. Tried on 23 planted
  mistakes in the retail files, with an untouched control: 23 caught.
- Contract test **36 pass**. Its floors follow the moved files: 28 files listed, at least
  140 uses of the builder read from the source, 60 methods checked beside a built
  address, 60 uses of a label (the tree has 147, 65 and 65).
- Mutation check: **30 of 30 caught**: each of the twelve files spelling an address
  again, a different way each time (14: plain, a template, single quotes, a joined
  string, the bare prefix, a label, an image's own text, inside a slot of a built
  address); a route called by another method on retail's own call shapes (8); a name the
  server does not have, or from a variable (4); a label used as part of an address (4).
- Full client 117 suites / 1,420 tests on the tree; the server tests that read client
  source 5 / 110; typecheck, production build and whitespace pass; generators unchanged.
- **Full client: 117 suites / 1,420 tests pass** (45.557 seconds) and **full server:
  180 suites / 4,472 tests pass** (803.803 seconds), both exit 0, on an archived copy of
  `a07c5072`.

Found on the way, left as it is: the phone terminal builds a refund request and hands
it to a view that never calls it (`onRefund` is declared and never used there). The
desktop analytics page and the phone transactions page are where a refund is made.

## Batch 3 — Property, and no built address made longer (`cda1988b`)

**Moved:** the phone and desktop property terminals, the tenant directory and profile,
the lists they share (`lib/property-data`), the desktop tenants page and the desktop
profile panel: seven files. 65 spelled addresses became 67 uses of 21 route names.

The rewrite placed all 65, four of them with a method decided by hand because the call
does not say one where the address is written: two lists loaded through a helper that
only ever gets, and the profile panel's two list addresses, which are the first word of
its cache key.

**The desktop profile panel was then changed by hand.** It kept one of two list
addresses in a variable and added `/<id>/events` to it for its request, so it called
two routes it never named. It now names them (`GET /api/trades/clients/:id/events` and
`GET /api/property/tenants/:id/events`). Its cache key is unchanged.

**That file showed a way round the guard.** With its two list addresses built, it
spelled nothing, and still made addresses no check had read. So the contract test gains
a check over every client file (36 tests became 38): **nothing is added to a built
address but a query or a fragment**, whether written beside it, joined with a plus, or
through a name the file gave it. A longer address is another route, and has its own
name. The check follows a plain constant within one file; an address carried in an
object's member, or through another file, is beyond it.

Every id in these routes is one the server reads as a UUID (12 of the 12 routes with a
parameter). The builder writes a text id into one path segment, which leaves a UUID as
it is; text holding a slash, a question mark or a hash now reaches the server as one
id, which it refuses, instead of as another path.

Verification:

- Red first: on the tree with the seven files listed and not yet moved, the guard lists
  **65 spelled addresses**. **The new check failed on real code**: after the rewrite and
  before the hand change it named the profile panel's two requests, with the guard
  itself satisfied. With the final test file on an archived copy of `a07c5072`, 4 of 38
  fail.
- The proof, with the panel's two hand-changed places cut out of both sides: **7 files,
  65 addresses paired, none differs**; 18 text ids now written by the builder into one
  segment; nothing else in the seven files changed.
- The panel's two places, read and then run side by side
  (`t10b/b3-profile-panel-check.ts`): for ten ids of the kinds the server issues, in
  both verticals, the same cache key and the same address as before. Where it differs
  is where it was meant to: text that is not one path segment, and no id at all (the
  request is not made then).
- Contract test **38 pass**. Floors: 35 files listed, at least 205 uses of the builder,
  95 methods checked (the tree has 214 and 100).
- Mutation check: **34 of 34 caught**: each of the seven files spelling an address
  again (12); a built address made longer in the real files, six ways, each caught by
  the new check alone; a route called by another method on property's call shapes (5);
  a name the server does not have (1); and ten breakages of the new check's own
  reading, each caught by the examples written beside it.
- Full client 117 suites / 1,420 tests on the tree; the server tests that read client
  source 5 / 112; typecheck, production build and whitespace pass; generators unchanged.
- **Full client: 117 suites / 1,420 tests pass** (48.387 seconds) and **full server:
  180 suites / 4,474 tests pass** (815.351 seconds), both exit 0, on an archived copy of
  `cda1988b`. The server's count is 4,472 plus the contract suite's 2 new tests.

## Batch 4 — Trades, and a cache key names a GET (`2c796135`)

**Moved:** the phone and desktop trades terminals, the client directory and profile,
recurring schedules, the trades dashboard and analytics, the trades reports button, the
desktop lists (`desktop/data/trades-data`) and the desktop clients page: ten files. 101
spelled addresses became 102 uses of 25 route names and one use of the merchants label.

The rewrite placed 96. Six of them are lists loaded through a helper, where the call
does not say a method and both a GET and a POST route have that path: GET, read from
each helper by hand.

**Five were placed by hand, in three files**, because the old code chose part of the
request when it ran:

- the phone terminal's job action chose its last path segment (`send-balance` or
  `complete`): it now chooses between the two routes;
- the desktop terminal's schedule action chose its method (DELETE or PUT): it now takes
  method and address together from one of the two routes;
- recurring schedules handed one mutation an address and a method from three callers:
  each caller now hands it a route's method and address together.

**The contract test gains a check** (38 tests became 40): wherever a built address is
the first word of a cached entry's name, it is a GET route's. Nothing is said beside a
key, so the method check never reached one, and a key named for the POST route of the
same path is the same text. This is the kind of mistake the proof missed (above), held
by a test in the one place a test can hold it. An address handed to a helper is still
beyond the contract test: nothing there says how it will be called.

Every text id in these routes is one the server reads as a UUID (13 of 13), which the
builder writes as it is.

Verification:

- Red first: on the tree with the ten files listed and not yet moved, the guard lists
  **101 spelled addresses**. With the final test file on an archived copy of
  `cda1988b`, 5 of 40 fail.
- The proof, with the six hand-changed places cut out of both sides and the six methods
  read by hand given to it: **10 files, 96 addresses paired, none differs**; 12 text ids
  now written by the builder; 48 first words of a cache key, each a GET. Tried on 16
  planted mistakes, with three untouched controls: 16 caught. (Before it was tightened,
  13 of the 14 then planted; two more of the missed kind were added.)
- The six hand-changed places, run side by side with the old expressions
  (`t10b/b4-hand-places-check.ts`): 21 results, none different.
- Contract test **40 pass**. Floors: 45 files listed, at least 305 uses of the builder,
  135 methods checked, 95 keys (the tree has 316, 143 and 102).
- Mutation check: **30 of 30 caught**: each of the ten files spelling an address again
  (13); a key named for a route that is not a GET (4), each caught by the new check
  alone; a route called by another method on trades' call shapes (5); a name the server
  does not have, or from a variable, in the hand-changed places (2); a built address
  made longer (2); four breakages of the new check's own reading.
- Full client 117 suites / 1,420 tests on the tree; the server tests that read client
  source 5 / 114; typecheck, production build and whitespace pass; generators unchanged.
- **Full client: 117 suites / 1,420 tests pass** (40.926 seconds) and **full server:
  180 suites / 4,476 tests pass** (815.967 seconds), both exit 0, on an archived copy of
  `2c796135`. The server's count is 4,474 plus the contract suite's 2 new tests.

## Batch 5 — What a customer opens (`ffa4a544`)

**Moved:** the helpers that work out a payment's addresses (`lib/payment-addressing`),
checkout, the board pay page, the split page, the receipt, the result and bank-return
pages, and the info page's lead form: eight files. 48 spelled addresses became 38 uses
of 29 route names and 13 uses of a label.

The rewrite placed 45. In 16 of them the call does not say a method where the address
is written (14 are a helper returning it); each of those paths has one listed route, so
there was nothing to decide.

**Three were placed by hand, in one function.** `checkoutCompletionEndpoint` chose its
last path segment (`hosted-fields-complete` or `googlepay-complete`) when it ran, for
each of three kinds of sale. It now chooses between the two routes of each kind: six
names.

**Because these are the addresses money is taken at, the helpers were also run against
themselves** (`t10b/b5-hand-places-check.ts`): the module as it was on `2c796135`,
loaded from the commit, beside the module as it is now; every helper; for ids and tokens
of the kinds the server issues, and for text it never issues. **297 results, none
different.** What does differ is what the app never hands a helper, because its own
check refuses it first: an id of zero and an empty token now leave the parameter's own
name for the server to refuse.

Every token in these addresses is URL-safe base64 (a sale link's and a bank-return
state's are 43 characters; an invoice's or a quote's is 20 random bytes), which the
builder writes as it is. Five addresses on the checkout page wrote an invoice's or a
quote's token into the path without encoding it; text holding a slash, a question mark
or a hash now reaches the server as one token, which it does not find, instead of as
another path. The helpers already encoded theirs.

**One existing test changed, on purpose.**
`client/src/__tests__/split-payment-view-boundary.test.tsx` reads the split page's
source and expected the two legacy addresses as they were spelled
(`` `/api/transactions/${txnId}/split` `` and `.../pay`). It now expects them as they
are named (`apiPath("POST /api/transactions/:id/split", { id: txnId })` and the pay
one). What it holds is the same: the page still calls both. Two lines changed.

Verification:

- Red first: on the tree with the eight files listed and not yet moved, the guard lists
  **48 spelled addresses**. On an archived copy of `2c796135`, the final contract test
  fails 5 of 40 and the changed client test fails 1 of 6.
- The proof, with the hand-changed place cut out of both sides: **8 files, 45 addresses
  paired, none differs**; 5 text values now written by the builder (the checkout
  tokens above). Tried on 13 planted mistakes, with three untouched controls: 13 caught.
- The old module beside the new, as above: 297 the same. That check was itself tried on
  15 mistakes planted in a copy of the module: 15 caught. (14 at first: a token encoded
  twice in one helper was not reached by its cases for text no server issues. They were
  widened to every helper that takes a token, which is where 297 comes from.)
- Contract test **40 pass**. Floors: 53 files listed, at least 345 uses of the builder,
  150 methods checked, 75 uses of a label (the tree has 354, 159 and 79; 103 keys).
- Mutation check: **26 of 26 caught**: each of the eight files spelling an address
  again (11); a built address made longer (4); a route called by another method (5); a
  key named for a POST route (1); a label used as part of an address or as a later word
  (2); a name the server does not have, from a variable, or made from pieces (3).
- Full client 117 suites / 1,420 tests on the tree, with the one changed test; the
  server tests that read client source 5 / 114; typecheck, production build and
  whitespace pass; generators unchanged.
- **Full client: 117 suites / 1,420 tests pass** (45.295 seconds) and **full server:
  180 suites / 4,476 tests pass** (808.996 seconds), both exit 0, on an archived copy of
  `ffa4a544`.

## Batch 6 — The shell (`633eebb1`)

**Moved:** the app's own probe of who is signed in (`App`), the tutorial, onboarding,
the push hook and the push device helper, and the live-updates client: six files. 33
spelled addresses became 33 uses of 18 route names.

The rewrite placed 32. **One was placed by hand:** the customer's live-updates address
had its query written straight after the path, which the rewrite does not read. Run
side by side with the old expression (`t10b/b6-hand-places-check.ts`), for three
business ids with and without a board: 15 results, none different.

The push hook is handed a fetch to call, under the name `request`. The contract test
now reads a call by that name as it reads `fetch`, so the method said beside those two
addresses is checked like any other.

Verification:

- Red first: on the tree with the six files listed and not yet moved, the guard lists
  **33 spelled addresses**. With the final test file on an archived copy of `ffa4a544`,
  5 of 40 fail.
- The proof, with the hand-changed place cut out of both sides: **6 files, 32 addresses
  paired, none differs**; one text value now written by the builder (a tutorial page's
  key, one of 20 fixed words that encoding leaves as they are). Tried on 12 planted
  mistakes, with three untouched controls: 12 caught.
- Contract test **40 pass**. Floors: 59 files listed, at least 380 uses of the builder,
  165 methods checked, 105 keys (the tree has 387, 174 and 112).
- Mutation check: **21 of 21 caught**: each of the six files spelling an address again
  (9); a route called by another method, among them the fetch handed in as `request`
  and the stream opened on a POST route (6); a key named for a POST route (2); a built
  address made longer (2); a name the server does not have, or from a variable (2).
- Full client 117 suites / 1,420 tests on the tree; the server tests that read client
  source 5 / 114; typecheck, production build and whitespace pass; generators unchanged.
- **Full client: 117 suites / 1,420 tests pass** (46.688 seconds) and **full server:
  180 suites / 4,476 tests pass** (800.318 seconds), both exit 0, on an archived copy of
  `633eebb1`.

## Batch 7 — The admin area, and the guard turned round (`7f62a6b0`)

**Moved:** the admin's home, analytics, business list and business page: four files.
24 spelled addresses became 24 uses of 13 route names; the rewrite placed all 24. The
business page takes its id from its own address, as text; it is now read as the server
reads a whole number (`wholeNumber`), in five places. The admin frame
(`AdminDashboard`) is unchanged: all it spells is its page address.

**The guard, turned round.** Until this batch the contract test held a list of moved
files, and only those. It now holds **every source file of the client**: none may spell
an API address, whoever imports it, with two named exceptions (40 tests became 43).

- **Fourteen files the app never loads.** Each is held to the number of addresses it
  spells today (118 in all) and must stay unloaded. The test reads what the app can
  load from its entry (`client/src/main.tsx`), through imports, re-exports and
  `import()`; a page declared for lazy loading and never mentioned again is never asked
  for. Any doubt reads as loaded.
- **The admin area's page at `/api`**, in the two files that go to it, held to six
  uses, with the admin's own router having a route there and the server none.

The list of moved files is gone: there is nothing left for it to say.

**Found by it:**

- **The test read only `.ts` and `.tsx` files.** The client has two plain JavaScript
  files (`components/Stepper.jsx` and `features/terminal/retail/RetailTerminalViewCore.jsx`,
  1,561 lines, the retail terminal's own view). Neither spells an address or makes a
  request, and both are now read.
- **`pages/admin-login.tsx`, moved onto the builder with the sign-in pages in T10a, is a
  page nothing imports.** The admin signs in through the login page. It is named in the
  test as moved and never loaded, and joins the list for the owner.

Verification:

- Red first: with the guard turned round and the admin files not yet moved, it lists
  their **24 addresses** and not the six page addresses. With the final test file on an
  archived copy of `633eebb1`, 5 of 43 fail.
- **Replayed on the commit before T10b's first batch (`5339b08b`), the final guard lists
  457 spelled addresses**: the 463 the audit counted, less the six. Two readings written
  a day apart, by different code, agree.
- The proof, told that `/api` alone is a page's address: **5 files, 24 addresses paired,
  none differs**; 5 ids now read through `wholeNumber()`; the six page addresses left
  where they were; nothing else in the files changed. Tried on 11 planted mistakes,
  with three untouched controls: 11 caught.
- Contract test **43 pass**. Floors: 63 files on the builder, at least 405 uses of it,
  175 methods checked, 120 keys, 245 source files read, 180 loaded (the tree has 411,
  183, 127, 252 and 186).
- Mutation check: **33 of 33 caught**: an address spelled in each admin file, in a page
  moved earlier, in a loaded file that was never on any list, in a file nothing loads
  that is not one of the fourteen, and in a plain JavaScript file (8); a listed file
  spelling one more or one fewer, a declared page being rendered, a listed file
  imported or asked for by a loaded page (5); the page address spelled once more, once
  fewer, in another file, or as the start of an API address (6); methods, a key, a
  longer address and a name on the admin's call shapes (5); and nine breakages of the
  reading of what the app loads, each caught by its own examples or counts.
- Full client 117 suites / 1,420 tests on the tree; the server tests that read client
  source 5 / 117; typecheck, production build and whitespace pass; generators unchanged.
- **The built client** holds 158 route names and nothing of the list itself. The source
  names 160: the other two are in a receipt helper no page calls, which the build
  leaves out.
- **Full client: 117 suites / 1,420 tests pass** (55.714 seconds) and **full server:
  180 suites / 4,479 tests pass** (825.415 seconds), both exit 0, on an archived copy of
  `7f62a6b0`. The server's count is 4,476 plus the contract suite's 3 new tests.
  That client run printed one warning, a test worker slow to exit, while a browser check
  was running beside it. Run again on the same code with nothing beside it: 117 suites /
  1,420 tests pass (43.263 seconds) and no warning.

## For the owner: the files the app never loads

Fifteen files. Nothing in the running app can reach them, and they cost nothing when
it runs. Fourteen still spell API addresses, and every call to a route the server no
longer has is in one of them, so a search for an address finds answers that are not
true of the app. **Deleting them is his decision; nothing is deleted here.**

| File | Addresses it spells | Why it is never loaded |
|---|---|---|
| `components/digital-wallet-buttons.tsx` | 3 | nothing imports it |
| `components/native-payment-buttons.tsx` | 4 | nothing imports it |
| `pages/admin-api.tsx` | 7 | nothing imports it |
| `pages/admin-dashboard.tsx` | 6 | nothing imports it |
| `pages/admin-merchant.tsx` | 9 | nothing imports it |
| `pages/admin-merchant-broken.tsx` | 9 | nothing imports it |
| `pages/admin-revenue.tsx` | 1 | nothing imports it |
| `pages/admin/WebsiteAnalytics.tsx` | 2 | nothing imports it |
| `pages/exports.tsx` | 4 | nothing imports it |
| `pages/merchant-terminal-mobile.tsx` | 17 | nothing imports it |
| `pages/settings-simple.tsx` | 3 | nothing imports it |
| `pages/merchant-terminal.tsx` | 22 | `App` declares it for lazy loading and never renders it |
| `pages/demo-terminal.tsx` | 28 | `App` declares it for lazy loading and never renders it |
| `pages/create-merchant.tsx` | 3 | `App` declares it for lazy loading and never renders it |
| `pages/admin-login.tsx` | 0 (moved in T10a) | nothing imports it |

"Never loaded" is read from the source: static imports, re-exports and `import()`,
starting from the app's entry. The client has no other way of loading a file
(`import.meta.glob` and `require` do not occur). The same reading finds 48 more files
the app never loads that spell nothing, mostly unused interface components; they are
not part of this task and are not listed here.

## Phase handoff record

- Scope/files: `git show --stat 997c28ad a07c5072 cda1988b 2c796135 ffa4a544 633eebb1 7f62a6b0`.
- Migrations/target: none. No database of any kind was contacted.
- Commands/logs: under `.local/claude-scratch/` (git-ignored). Tools in
  `session-2026-10-06/t10b/`: `audit.ts`, `reach.ts`, `codemod.ts`, `proof.ts`, the
  proof's self-tests (`proof-selftest*.sh`), each batch's file list (`batch1.txt` to
  `batch7.txt`), hand-changed places (`hand-b3.json` to `hand-b6.json`) and methods read
  by hand (`decisions-b3.txt`, `decisions-b4.txt`); and
  `session-2026-10-06/mutate-t10b1.py` to `mutate-t10b7.py`. Logs: batch 1 in
  `session-2026-10-06/t10b/` (`b1-*`); batches 2 to 7 and every full run in
  `session-2026-10-07/` (`t10b/b2-*` to `t10b/b7-*`, `full-*-t10b1.log` to
  `full-*-t10b7.log`).
- Negative/effect proof: every moved address is paired with the one it replaced; the
  proof, the side-by-side runs and the contract test's two new checks are each shown to
  fail on planted mistakes.
- Provider/UAT, devices, external actions, deploy: none. **No browser was driven in
  these batches.** That a page still asks for the same address rests on the proof above,
  on the side-by-side runs, and on the pages' existing tests where they have them; the
  device matrix is T10c.
- Security/privacy: no request, response or stored value changes. An id or a token that
  is not one path segment can no longer reach another path. A value the builder cannot
  use is never repeated in the address.
- Generated files: running the generator rewrites the first line of
  `server/route-policy.ts` and of the two inventory tables with the commit and date.
  No route changed, so those three are left as they were.
- In-flight: none.
- Rollback/constraints: each batch is one commit and can be reverted alone; keys keep
  their values, so a reverted batch still shares its cache with the others. The guard's
  list would then lose those files, which is a reviewed change.
- Approvals/stops: the T10b preflight and separate reread approve this scope. Three
  departures from the preflight are recorded above and in the plan: one builder that
  never throws, instead of a second builder; two checks added to the contract test; one
  existing test changed. No application, provider or production gate was crossed.
- Deferred/next: T10c, the device matrix as one gate. For the owner when he wants: the
  fifteen files the app never loads, above.
