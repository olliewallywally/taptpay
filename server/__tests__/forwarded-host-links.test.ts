import "./support/test-env";
import { restoreOriginEnv } from "./support/no-public-origin-env";
import "./support/resend-capture-env";

import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage } from "./support/http-harness";

/**
 * R1-T4 phase B: forwarded headers are believed only from a trusted proxy. With no public
 * address configured, links in emails are built from the request, and `getBaseUrl` used to
 * read `X-Forwarded-Host` and `X-Forwarded-Proto` as any visitor wrote them. So a stranger
 * could ask for a merchant's password reset with `X-Forwarded-Host: evil.test` and have the
 * link mailed pointing at their own site: the classic reset-link poisoning. Production sets
 * PUBLIC_ORIGIN, so this was a development-only exposure; now it is none.
 */

type Sent = { to: string | string[]; subject: string; html?: string; text?: string };
const mockSent: Sent[] = [];
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn(async (message: Sent) => {
        mockSent.push(message);
        return { data: { id: "captured" }, error: null };
      }),
    },
  })),
}));

afterAll(restoreOriginEnv);
beforeEach(() => {
  resetTestStorage();
  mockSent.length = 0;
});

it("builds a reset link from the request's own host and protocol, never from a forwarded header the visitor wrote", async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();

  const res = await request(app).post("/api/auth/forgot-password")
    .set({ Host: "shop.harness.test", "X-Forwarded-Host": "evil.test", "X-Forwarded-Proto": "https" })
    .send({ email: owner.user.email });

  expect(res.status).toBe(200);
  expect(mockSent).toHaveLength(1);
  expect(mockSent[0].html).toContain("http://shop.harness.test/reset-password?token=");
  expect(`${mockSent[0].html}${mockSent[0].text}`).not.toContain("evil.test");
});
