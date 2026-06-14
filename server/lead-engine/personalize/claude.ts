/**
 * claude.ts — Claude-backed draft generation.
 *
 * Uses the cheapest current model (Haiku) and asks for a strict JSON object
 * ({subject, body}), parsed defensively. Degrades to null when no
 * ANTHROPIC_API_KEY is set or generation fails — callers fall back to a
 * template. Cost control: cheapest model + a tight max_tokens (short emails).
 */
import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt, type PersonalizeContext } from "./prompts";

export const AI_MODEL = process.env.LEAD_AI_MODEL || "claude-haiku-4-5";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY || process.env.LEAD_AI_ENABLED === "false") return null;
  if (!client) client = new Anthropic();
  return client;
}

/** True when an API key is present and AI hasn't been explicitly disabled. */
export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.LEAD_AI_ENABLED !== "false";
}

/** Pull a {subject, body} object out of the model's text, tolerating stray
 *  prose or code fences around the JSON. */
function parseDraft(text: string): { subject: string; body: string } | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  else {
    const brace = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (brace > 0 && end > brace) raw = raw.slice(brace, end + 1);
  }
  try {
    const parsed = JSON.parse(raw) as { subject?: unknown; body?: unknown };
    if (typeof parsed.subject === "string" && typeof parsed.body === "string" && parsed.subject.trim() && parsed.body.trim()) {
      return { subject: parsed.subject.trim().slice(0, 250), body: parsed.body.trim() };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function generateDraftWithClaude(
  ctx: PersonalizeContext,
): Promise<{ subject: string; body: string; model: string } | null> {
  const c = getClient();
  if (!c) return null;
  const { system, user } = buildPrompt(ctx);
  try {
    const response = await c.messages.create({
      model: AI_MODEL,
      max_tokens: 600, // a short email — keeps the bill to a fraction of a cent
      system,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const draft = parseDraft(text);
    if (!draft) return null;
    return { ...draft, model: response.model || AI_MODEL };
  } catch (err: any) {
    console.error("[lead-ai] draft generation failed:", err?.message || err);
    return null;
  }
}
