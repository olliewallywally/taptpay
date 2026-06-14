/**
 * conversion.ts — close the loop: when a lead becomes a TaptPay merchant, mark
 * it converted and stop outreach.
 *
 * Detection is decoupled from the signup flow: a cron sweep matches in-flight
 * lead emails against existing merchant emails. Marking converted also suppresses
 * the email, so the scheduler's compliance gate auto-stops any active enrollment.
 * (A manual convert is also exposed for cases where the signup email differs.)
 */
import { storage } from "../storage";
import { normalizeEmail } from "./normalize";

export async function markLeadConverted(leadId: number): Promise<boolean> {
  const lead = await storage.getLead(leadId);
  if (!lead || lead.status === "converted") return false;
  await storage.updateLead(leadId, { status: "converted" });
  if (lead.email) {
    await storage.addSuppression({ type: "email", value: lead.email, reason: "converted", notes: "became a merchant" });
  }
  // Stop any in-flight sequences for this lead (so they don't show as merely
  // "unsubscribed" once the suppression takes effect on the next tick).
  for (const e of await storage.getEnrollmentsByLead(leadId)) {
    if (e.status === "active" || e.status === "paused") {
      await storage.updateEnrollment(e.id, { status: "completed", note: "converted", nextSendAt: null });
    }
  }
  return true;
}

export interface ConversionPassResult {
  checked: number;
  converted: number;
}

// Statuses still "in flight" — worth checking for conversion. Terminal states
// (converted/suppressed/rejected) are skipped.
const IN_FLIGHT = new Set(["new", "enriching", "enriched", "ready", "enrolled", "contacted", "replied"]);

export async function runConversionPass(): Promise<ConversionPassResult> {
  const merchants = await storage.getAllMerchants();
  const merchantEmails = new Set(
    merchants.map((m) => (m.email || "").toLowerCase().trim()).filter(Boolean),
  );
  if (merchantEmails.size === 0) return { checked: 0, converted: 0 };

  const leads = await storage.listLeads();
  let converted = 0;
  for (const lead of leads) {
    const email = normalizeEmail(lead.email);
    if (!email || !IN_FLIGHT.has(lead.status)) continue;
    if (merchantEmails.has(email) && (await markLeadConverted(lead.id))) converted++;
  }
  return { checked: leads.length, converted };
}
