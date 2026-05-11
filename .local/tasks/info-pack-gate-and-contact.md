# Info Pack Lead Gate & Mobile Contact

## What & Why
Gate the info pack PDF behind a name + email form so Oliver can capture leads who view the info pack. Also add Oliver's contact details to the mobile footer.

## Done looks like
- Visiting `/info` shows a branded gate screen asking for the user's name and email before the info pack content is revealed
- On both mobile and desktop, submitting the form unlocks the info pack for the current visit and stores the submission in localStorage so returning visitors skip the gate
- Each new submission is saved to a new `info_pack_leads` DB table (name, email, created_at) and a notification email is sent to oliverleonard@taptpay.co.nz with the submitter's details
- The gate matches the existing page's style (dark blue / teal palette)
- On mobile, a contact block appears at the bottom of the page showing: **Oliver Leonard**, **021 209 4672** (tel: link), **oliverleonard@taptpay.co.nz** (mailto: link)
- The desktop view is unchanged apart from the gate

## Out of scope
- Admin UI to browse leads (future work)
- CSV export of leads
- Requiring re-submission after a set time period

## Tasks
1. **Schema & storage** — Add `infoPackLeads` table to `shared/schema.ts` with id, name, email, createdAt. Add `createInfoPackLead` method to the storage interface and MemStorage implementation.

2. **API route** — Add `POST /api/info-pack-leads` route that validates name + email, saves the lead, and sends a notification email to oliverleonard@taptpay.co.nz via the existing SendGrid email service.

3. **Gate UI** — Replace the immediate content reveal on `/info` with a gate screen (name + email form). On successful submit call the new API, store a `infoPackUnlocked` flag in localStorage, then show the normal page content. On page load, if the flag is already set, skip the gate.

4. **Mobile contact footer** — Add Oliver's name, phone, and email as tappable links in the mobile footer of the info page, above the existing copyright line.

## Relevant files
- `client/src/pages/info.tsx`
- `shared/schema.ts`
- `server/storage.ts`
- `server/routes.ts`
- `server/email-service.ts`
