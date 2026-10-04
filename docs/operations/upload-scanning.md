# Scanning uploaded invoice documents

Owner decision 2026-09-29: every invoice document a business uploads is scanned for
malware, and nobody can open one until a scan has said it is clean (R1-T7 S6a).

## What the app needs

A ClamAV daemon (`clamd`) the app can reach over TCP, and two settings:

| Setting | Meaning |
|---|---|
| `CLAMAV_HOST` | Where `clamd` listens. Not set means there is no scanner. |
| `CLAMAV_PORT` | Its port. Defaults to `3310`. |
| `UPLOAD_SCANNER` | `clamav` (the default) or `simulation`. See below. |

On the daemon's side: `TCPSocket 3310`, `TCPAddr` set to an address only the app can
reach (never a public one: `clamd` has no authentication), and `StreamMaxLength` at
least `20M`, the app's own upload limit (ClamAV's default is 25M). Keep `freshclam`
running so its signature list stays current. Expect it to hold roughly 1–2 GB of
memory.

The app sends each document straight down the connection (ClamAV's `INSTREAM`); the
daemon needs no shared disk and keeps nothing.

## What happens when

| Situation | What the business sees | What is stored |
|---|---|---|
| The scan says clean | The upload succeeds | The document and its verdict, together |
| The scan finds something | "This file was blocked because it may be harmful." | Nothing. A log line `INVOICE_DOCUMENT_BLOCKED_BY_SCAN` names the business and what was found |
| No `CLAMAV_HOST`, the daemon is down or slow (30 seconds), or it answers something else | "Document scanning is temporarily unavailable. Please try again." | Nothing. A log line `[INVOICE_DOC_SCAN_UNAVAILABLE]` |

A document with no clean verdict on record is treated as not there: its business,
the person paying the invoice and the platform admin all get "not found", the payment
page shows no document link, and it cannot be attached to an invoice or quote. That
includes every document uploaded before scanning existed, until the scheduled pass
below has scanned it.

## Documents from before scanning, and old unused uploads

Two things happen at the end of every scheduler run (`POST /api/internal/cron`), and
its reply reports them as `uploadScans` and `uploadRetention`:

- **Earlier documents get their verdict.** Up to five documents that have no scan on
  record are scanned per run. Clean ones become readable again. One the scanner
  blocks stays "not found" for everyone; its bytes are kept, unreadable, and a log
  line `INVOICE_DOCUMENT_BLOCKED_BY_SCAN` (with `pass: "earlier-documents"`) names
  the business and what was found. If the scanner is not reachable the pass stops and
  changes nothing (`scannerAvailable: false`, or `noVerdict: 1`).
- **Uploads no invoice uses are deleted after 12 months.** Only documents that no
  property invoice, trades quote or trades invoice names, uploaded more than 12
  calendar months ago. Never a logo, never an attached document. At most 50 per run;
  a log line `UNATTACHED_UPLOADS_DELETED` gives the count. Deletion is permanent.

## The stand-in, for development and tests only

`UPLOAD_SCANNER=simulation` uses a built-in stand-in instead of ClamAV. It calls
every file clean except the standard antivirus test file (EICAR), which it blocks so
the refusal can be seen. Its verdicts are recorded under the name `simulation`. The
app refuses to start with it in staging or production.

## The database

Verdicts live in `uploaded_file_scans` (migration `0032`), one row per scanned file,
removed with its file. Until `0032` is applied to a database, document upload,
document reads and the logo upload fail there.

## Checking it works

Upload a normal PDF to an invoice: it attaches. Upload a file containing the EICAR
test string (search "EICAR test file"; it is harmless by design): it is blocked and
the log line appears. Stop `clamd` and upload again: the "temporarily unavailable"
message appears and nothing is stored.
