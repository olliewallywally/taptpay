# Owner answers — finishing R1 (2026-09-29)

Date: 2026-09-29 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `e61fc5fa`). The
owner's direction before the questions, verbatim: "ok we need to finsh R1 so after your done making those
fixes keep going". Asked through the question tool; the answers are the options he chose, verbatim, or his
own words where he wrote one.

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "R1's last sign-in step (phase E) moves the web app's sign-in out of browser storage, where any script on the page could read it, into a secure cookie that scripts can't read, plus a check that stops other websites submitting actions as the user. Everyone is signed out once when it ships. The iPhone app shows the live website, so it gets the same protection. Go ahead with this design?" | **"Yes, follow the plan (Recommended)"** — "I write the detailed design first (how long a sign-in lasts, the cross-site check, the admin area), show it to you, then build it test-first." |
| 2 | "Sign in with Apple (R1-T5) is required by the App Store because the app offers Google sign-in. Parts only you can do: in your Apple Developer account, create a Services ID and a Sign in with Apple key, and give me your team ID; then test on a real iPhone. Should I build the server and app side now, ready for your keys?" | **"Build it now (Recommended)"** — "Server and app code built and tested with stand-ins for Apple. It goes live once you've set up Apple and tried it on an iPhone." |
| 3 | "Businesses upload invoice documents (PDFs and photos) that their tenants and clients then open. They're type-checked, kept private and can't run in the browser, but nothing scans them for viruses. The plan asks for a scan before a document is shown. What should happen?" | **"Add ClamAV on the server"** — "Free, open-source scanner. Uploads wait a moment while scanned; its virus list updates itself. Costs server memory." |
| 4 | "When a business uploads a document but never attaches it to an invoice, the file stays forever. Delete unattached uploads after a while? (Attached ones follow the 7-year rule you set on 2026-09-21.)" | **"KEEP for 12 months"** (his own words; the options were 30 days, 7 days, or keep them) |

The other options were "Not now" (1), "Wait" (2), "Record the risk for now" and "Use a paid scanning
service" (3).

## What this authorizes

- 1: a written design for R1-T4 phase E (server-side sessions, an HttpOnly `__Host-` cookie and a CSRF
  check on the web, the admin area, session lengths, the one-time sign-out, the iPhone app), shown to the
  owner before any code. No code until he approves it.
- 2: R1-T5's server side (Apple's identity token verified against Apple's published keys, stubbed in
  tests; no email-only linking) and its app side, built and tested with stand-ins. Going live needs the
  owner's Apple setup (Services ID, key, team ID) and a real-iPhone check.
- 3: ClamAV scanning for uploaded invoice documents: a document is kept from every reader until the scan
  says it is clean; tests use a stand-in scanner. Running ClamAV where the app runs (its install, its
  memory, its signature updates) is part of the deployment and needs the owner's setup.
- 4: an upload no invoice uses is deleted 12 months after it was uploaded; attached documents are not
  touched by this.
