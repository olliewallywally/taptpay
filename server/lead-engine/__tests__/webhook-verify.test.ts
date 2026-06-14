import { createHmac } from "crypto";
import { verifyWebhookSignature } from "../outreach/webhook-verify";

function sign(secretB64: string, id: string, ts: string, body: string): string {
  const sig = createHmac("sha256", Buffer.from(secretB64, "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  return `v1,${sig}`;
}

describe("verifyWebhookSignature", () => {
  const secretB64 = Buffer.from("supersecretkey-supersecretkey32!").toString("base64");
  const secret = "whsec_" + secretB64;
  const body = JSON.stringify({ type: "email.bounced", data: { to: "x@y.com" } });
  const now = 1_700_000_000_000;
  const ts = String(Math.floor(now / 1000));
  const id = "msg_123";
  const headers = () => ({ "svix-id": id, "svix-timestamp": ts, "svix-signature": sign(secretB64, id, ts, body) });

  test("accepts a valid signature", () => {
    expect(verifyWebhookSignature(body, headers(), secret, 300, now)).toBe(true);
  });

  test("rejects a tampered body", () => {
    expect(verifyWebhookSignature(body + "x", headers(), secret, 300, now)).toBe(false);
  });

  test("rejects a stale timestamp (replay protection)", () => {
    expect(verifyWebhookSignature(body, headers(), secret, 300, now + 10 * 60 * 1000)).toBe(false);
  });

  test("rejects a missing secret or missing headers", () => {
    expect(verifyWebhookSignature(body, headers(), "", 300, now)).toBe(false);
    expect(verifyWebhookSignature(body, {}, secret, 300, now)).toBe(false);
  });
});
