import "./support/test-env";

// The real wrapper and client; only the network is stubbed. Payments must be configured
// for the client to call anything (R2-T1).
jest.mock("../config", () => {
  const actual = jest.requireActual("../config");
  return {
    ...actual,
    config: {
      ...actual.config,
      paymentMode: "uat",
      publicOrigin: "https://app.example.test",
      windcave: { ...actual.config.windcave, endpoint: actual.UAT_WINDCAVE_ENDPOINT, username: "SyntheticUser", apiKey: "synthetic-key" },
    },
  };
});

import { createWindcaveRefund } from "../windcave";
import * as securityAuditLog from "../security-audit-log";

/** R4-T1: the wrapper's result for the routes, and its sanitized event on a mismatch. */

const REQUEST = { xId: "0f3c6a1e9b2d4c7f8a5e1d3b6c9f2a4e", originalTransactionId: "0000000a0123456b", amount: "2.50", merchantReference: "REFUND-1-1" };
const reply = (over: Record<string, unknown>) => new Response(JSON.stringify({
  id: "0000000a0999999r", authorised: true, type: "refund", amount: "2.50", currency: "NZD", merchantReference: "REFUND-1-1", ...over,
}), { status: 201 });

beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => undefined));

it("a verified refund is a success with the provider's refund ID", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(reply({}));
  await expect(createWindcaveRefund(REQUEST)).resolves.toEqual({
    success: true, refundTransactionId: "0000000a0999999r", outcome: { kind: "refunded", refundTransactionId: "0000000a0999999r" },
  });
});

it("a mismatch is a failure with a code, and a sanitized security event naming only the field", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(reply({ amount: "25.00" }));
  const audit = jest.spyOn(securityAuditLog, "writeSecurityAuditEvent").mockImplementation(() => undefined);
  await expect(createWindcaveRefund(REQUEST)).resolves.toEqual({
    success: false, error: "mismatch_amount", outcome: { kind: "mismatch", field: "amount" },
  });
  expect(audit).toHaveBeenCalledWith("PROVIDER_OUTCOME_MISMATCH", { field: "amount" });
});

it.each<[string, Response | Error, string]>([
  ["a decline", reply({ authorised: false }), "declined"],
  ["a refusal", new Response("{\"message\":\"no\"}", { status: 400 }), "rejected_400"],
  ["a server error", new Response("boom", { status: 500 }), "unknown_server_error"],
])("%s is a failure with a fixed code", async (_label, response, code) => {
  jest.spyOn(global, "fetch").mockResolvedValue(response as Response);
  await expect(createWindcaveRefund(REQUEST)).resolves.toMatchObject({ success: false, error: code });
});
