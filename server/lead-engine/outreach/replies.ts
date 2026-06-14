/**
 * replies.ts — inbound reply handling. When a prospect replies, pause their
 * active sequences so we never email someone who already responded.
 *
 * Wired to POST /api/outreach/inbound (secret-gated), which an ESP inbound-parse
 * / email-forwarding route posts to. `extractSender` is pure (testable);
 * `markRepliedByEmail` matches the sender to a lead and pauses its enrollments.
 */
import { storage } from "../../storage";
import { normalizeEmail } from "../normalize";

// Pure parser lives in ./parse so it stays unit-testable without the storage graph.
export { extractSender } from "./parse";

/** Mark a reply from `fromEmail`: pause the matching lead's active/paused
 *  sequences and set the lead to "replied". Returns enrollments paused. */
export async function markRepliedByEmail(fromEmail: string | undefined | null): Promise<number> {
  const email = normalizeEmail(fromEmail);
  if (!email) return 0;
  let paused = 0;
  for (const lead of await storage.listLeads({ q: email })) {
    if ((lead.email ?? "").toLowerCase() !== email) continue;
    for (const e of await storage.getEnrollmentsByLead(lead.id)) {
      if (e.status === "active" || e.status === "paused") {
        await storage.updateEnrollment(e.id, { status: "replied", nextSendAt: null, note: "inbound reply" });
        paused++;
      }
    }
    if (lead.status !== "replied" && lead.status !== "converted") {
      await storage.updateLead(lead.id, { status: "replied" });
    }
  }
  return paused;
}
