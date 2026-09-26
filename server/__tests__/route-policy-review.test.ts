import { expandFacts, type RouteFacts } from "../route-facts";
import { ROUTE_POLICY } from "../route-policy";
import {
  PENDING_CEILING,
  REVIEW_PENDING,
  ROUTE_REVIEW,
  type ReviewedBranch,
  type RouteReview,
} from "../route-review";

/**
 * R1-T2 / R1-T3 (plan C10): every route's reviewed policy (server/route-review.ts)
 * is held to what its handler does (the facts in server/route-policy.ts). Each
 * rule below turns one kind of claim into something the code must show, so a
 * review cannot say more than the code does, and a handler cannot quietly stop
 * doing what its review says.
 */

/** Checks that authenticate a public credential addressing one resource. */
const TOKEN_CHECKS = [
  "resolvePaymentToken",
  "loadTokenReceipt",
  "prepareTokenCompletion",
  "getCheckoutInvoiceByToken",
  "paymentAttempts.resolveReturnState",
  "validateResetToken",
  "resetPassword",
  "storage.getMerchantByToken",
  "storage.getQuoteByToken",
  "storage.getUserByInviteToken",
  "storage.consumeAuthHandoffCode",
  "storage.verifyMerchant",
];

/** Checks that prove a sign-in: a password, or Google's code for a verified email. */
const CREDENTIAL_CHECKS = ["authenticateUser", "checkPasswordEvenly", "verifyGoogleSignInState"];

const UNAUTHENTICATED: ReadonlyArray<ReviewedBranch["principal"]> = [
  "public",
  "public-bearer",
  "provider",
  "cron",
  "api-key",
];

const OWNER_CHECKS = ["checkAccountOwnership", "isAccountOwner"];
/** Both admit the validated platform admin for any business (server/routes.ts). */
const MERCHANT_OWNERSHIP_CHECKS = ["checkMerchantOwnership", "checkAccountOwnership"];

function factsOf(key: string): RouteFacts {
  return expandFacts(ROUTE_POLICY[key].facts);
}

const has = (list: string[], names: string[]) => names.some((name) => list.includes(name));
const comparesMerchant = (facts: RouteFacts) =>
  facts.authChecks.some((check) => check.startsWith("compares ") && /merchantId/.test(check));
/** The route compares the caller's role with "admin": to admit the admin, or to refuse it. */
const comparesAdminRole = (facts: RouteFacts) =>
  facts.authChecks.some((check) => check.startsWith("compares ") && /\brole\b/.test(check) && /["']admin["']/.test(check));

/** Every way one review disagrees with its route's facts, in words. */
function problemsWith(key: string, review: RouteReview): string[] {
  const facts = factsOf(key);
  const problems: string[] = [];
  const say = (message: string) => problems.push(`${key}: ${message}`);
  const authenticates = facts.middleware.includes("authenticateToken") || facts.authChecks.includes("authenticateToken");

  if (review.branches.length === 0) say("has no branch");
  if (review.branches.length > 1 && review.branches.some((branch) => !branch.when)) {
    say("has several branches, but not every one says when it applies");
  }

  for (const branch of review.branches) {
    const label = branch.when ? `the ${branch.principal} branch (${branch.when})` : `the ${branch.principal} branch`;
    switch (branch.principal) {
      case "merchant":
        if (!authenticates) say(`${label} is a signed-in merchant, but the route never calls authenticateToken`);
        if (!branch.roles || branch.roles.length === 0) say(`${label} names no roles`);
        if (branch.roles && !branch.roles.includes("member") && !has(facts.authChecks, OWNER_CHECKS)) {
          say(`${label} is owner-only, but the route calls neither checkAccountOwnership nor isAccountOwner`);
        }
        if (
          branch.platformAdmin &&
          !has(facts.authChecks, ["isValidatedPlatformAdmin", ...MERCHANT_OWNERSHIP_CHECKS]) &&
          !comparesAdminRole(facts)
        ) {
          say(`${label} admits the platform admin, but the route has no check that admits it`);
        }
        if (!branch.platformAdmin && has(facts.authChecks, MERCHANT_OWNERSHIP_CHECKS) && !comparesAdminRole(facts)) {
          say(`${label} calls an ownership check that admits the platform admin, but does not say the admin is admitted`);
        }
        break;
      case "platform-admin":
        if (!facts.middleware.includes("authenticateAdmin") && !facts.authChecks.includes("isValidatedPlatformAdmin")) {
          say(`${label} is the platform admin, but the route uses neither authenticateAdmin nor isValidatedPlatformAdmin`);
        }
        break;
      case "cron":
        if (!facts.authChecks.includes("authorizeCronRequest")) say(`${label} is cron, but the route never calls authorizeCronRequest`);
        break;
      case "api-key":
        if (!facts.middleware.includes("authenticateApiKey")) say(`${label} is an API key, but authenticateApiKey is not its middleware`);
        break;
      case "public-bearer":
        if (!has(facts.authChecks, TOKEN_CHECKS)) say(`${label} holds a credential, but the route calls no credential check`);
        break;
      default:
        break;
    }
    if (branch.principal !== "merchant" && (branch.roles || branch.platformAdmin)) {
      say(`${label} names merchant roles, but is not a merchant branch`);
    }

    switch (branch.tenant) {
      case "path-merchant":
        if (!has(facts.authChecks, MERCHANT_OWNERSHIP_CHECKS)) {
          say(`${label} takes its merchant from the path, but the route calls no merchant ownership check`);
        }
        break;
      case "resource":
        if (!comparesMerchant(facts) && !facts.storageMethods.some((method) => branch.tenantRule.includes(method))) {
          say(`${label} holds a resource to the caller, but the route compares no merchant id and the rule names none of its storage reads`);
        }
        break;
      case "token":
        if (!["public-bearer", "provider"].includes(branch.principal) || !has(facts.authChecks, TOKEN_CHECKS)) {
          say(`${label} is addressed by a credential, but is not a credential holder's branch calling a credential check`);
        }
        break;
      case "board":
        if (!comparesMerchant(facts)) say(`${label} is a board's page, but the route compares no merchant id`);
        break;
      case "number":
        // A guessable number that anyone may use stays visible until it is retired.
        if (branch.principal !== "public") say(`${label} is addressed by a guessable number, but is not a public branch`);
        if (!review.findings?.length) say(`${label} is addressed by a guessable number, which must be a finding`);
        break;
      case "provider-session":
        if (branch.principal !== "provider") say(`${label} is selected by a provider's reference, but is not the provider`);
        break;
      case "key":
        if (branch.principal !== "api-key") say(`${label} acts for an API key's merchant, but is not an API key`);
        break;
      case "any-merchant":
        if (branch.principal !== "platform-admin") say(`${label} acts across merchants, but is not the platform admin`);
        break;
      case "system":
        if (branch.principal !== "cron") say(`${label} is a scheduled run, but is not cron`);
        break;
      case "credentials":
        if (branch.principal !== "public") say(`${label} is selected by credentials, but is not a public branch`);
        if (!has(facts.authChecks, CREDENTIAL_CHECKS)) say(`${label} is selected by credentials, but the route calls no password or Google check`);
        break;
      case "mailbox":
        // Anyone may name any address: without a limit, the server emails it on their say-so.
        if (branch.principal !== "public") say(`${label} acts by emailing an address, but is not a public branch`);
        if (facts.rateLimits.length === 0) say(`${label} emails an address the caller names, but calls no rate limit`);
        break;
      default:
        break;
    }
    if (!branch.tenantRule.trim()) say(`${label} has no tenant rule`);
  }

  // authenticateAdmin lets nobody but the validated platform admin through.
  if (facts.middleware.includes("authenticateAdmin") && review.branches.some((branch) => branch.principal !== "platform-admin")) {
    say("sits behind authenticateAdmin, so every branch must be the platform admin");
  }

  // Every caller without a session: authenticity, replay and rate, stated.
  const unauthenticated = review.branches.some((branch) => UNAUTHENTICATED.includes(branch.principal));
  if (unauthenticated && !review.controls) say("serves a caller without a session but states no controls");
  if (review.controls) {
    for (const field of ["authenticity", "replay", "rate"] as const) {
      if (!review.controls[field].trim()) say(`controls.${field} is empty`);
    }
    if (facts.rateLimits.length === 0 && !/^none\b/i.test(review.controls.rate)) {
      say(`calls no rate limit, so controls.rate must start with "none" (it says "${review.controls.rate}")`);
    }
  }

  // Every value read without a strict parser is explained.
  for (const read of [...facts.params, ...facts.query]) {
    if (!/\braw\b/.test(read)) continue;
    const name = read.split(":")[0];
    if (!new RegExp(`\\b${name}\\b`).test(review.input)) say(`reads ${name} raw, and the input review does not mention it`);
  }

  // Every error text that reaches a response is accounted for.
  const disclosure = review.errorDisclosure;
  if (disclosure.length === 0) say("names no error disclosure");
  if (disclosure.includes("fixed") && (disclosure.length > 1 || facts.errorTextInResponse.length > 0)) {
    say(`claims fixed messages only, but puts ${facts.errorTextInResponse.join(", ")} into a response`);
  }
  for (const text of facts.errorTextInResponse) {
    const isInputIssue = /\.(errors|issues)$/.test(text) || /\.errors\.map\(/.test(text);
    const covered = isInputIssue
      ? disclosure.includes("input-issues")
      : disclosure.includes("domain-errors") || disclosure.includes("provider-text");
    if (!covered) say(`puts ${text} into a response, which its error disclosure does not account for`);
  }
  if (disclosure.includes("provider-text") && !(review.findings?.length)) {
    say("shows a provider's error text, which must also be a finding");
  }

  // Gates and effects: named in the review if and only if the code shows them,
  // unless the review says which module holds one the route file cannot show.
  const gatePairs: Array<[string, string | null, string[]]> = [
    ["capability", review.capability, facts.capabilityGates],
    ["entitlement", review.entitlement, facts.entitlementGates],
    ["sideEffects", review.sideEffects, facts.sideEffects],
  ];
  for (const [field, stated, found] of gatePairs) {
    if (found.length > 0 && !stated) say(`the code shows ${found.join(", ")}, but the review's ${field} is empty`);
    if (stated && found.length === 0 && !/server\/[\w-]+\.ts/.test(stated)) {
      say(`the review's ${field} is set, but the route shows none: name the module that holds it`);
    }
  }

  if (facts.dtos.length > 0 && !facts.dtos.some((dto) => review.successDto.includes(dto))) {
    say(`returns ${facts.dtos.join(", ")}, and the success DTO review names none of them`);
  }
  if (!review.idempotency.trim()) say("states no idempotency");
  if (!review.successDto.trim()) say("states no success DTO");
  if (!review.input.trim()) say("states no input review");
  return problems;
}

describe("R1-T2 / R1-T3 — every route's reviewed policy holds against its handler (C10)", () => {
  it("reviews only routes that exist, and leaves none both reviewed and pending", () => {
    const routes = new Set(Object.keys(ROUTE_POLICY));
    expect(Object.keys(ROUTE_REVIEW).filter((key) => !routes.has(key))).toEqual([]);
    expect(REVIEW_PENDING.filter((key) => !routes.has(key))).toEqual([]);
    expect(REVIEW_PENDING.filter((key) => key in ROUTE_REVIEW)).toEqual([]);
  });

  it("has every route either reviewed or pending review", () => {
    const pending = new Set(REVIEW_PENDING);
    const neither = Object.keys(ROUTE_POLICY).filter((key) => !(key in ROUTE_REVIEW) && !pending.has(key));
    // A new route arrives reviewed: add its entry to server/route-review.ts.
    expect(neither).toEqual([]);
  });

  it("only ever shrinks the pending list", () => {
    expect(new Set(REVIEW_PENDING).size).toBe(REVIEW_PENDING.length);
    expect(REVIEW_PENDING.length).toBeLessThanOrEqual(PENDING_CEILING);
  });

  it("holds every review to its route's facts", () => {
    const problems = Object.entries(ROUTE_REVIEW).flatMap(([key, review]) => problemsWith(key, review));
    expect(problems).toEqual([]);
  });

  describe("the rules themselves", () => {
    const base: RouteReview = {
      branches: [
        { principal: "merchant", roles: ["owner"], platformAdmin: true, tenant: "path-merchant", tenantRule: "path id is the session's merchant" },
      ],
      input: "id: strict",
      capability: null,
      entitlement: null,
      idempotency: "a PUT of the same value",
      sideEffects: null,
      successDto: "ownerMerchantDto",
      errorDisclosure: ["input-issues"],
    };
    const theme = "PUT /api/merchants/:id/theme";

    it("accept a review that matches its route", () => {
      expect(problemsWith(theme, base)).toEqual([]);
    });

    it("accept the platform admin admitted through the ownership check, and refuse silence about it", () => {
      // checkMerchantOwnership and checkAccountOwnership let the validated platform
      // admin through for any business, so a review must say the admin is admitted.
      expect(problemsWith(theme, base)).toEqual([]);
      const silent: RouteReview = { ...base, branches: [{ ...base.branches[0], platformAdmin: undefined }] };
      expect(problemsWith(theme, silent).join("\n")).toContain(
        "calls an ownership check that admits the platform admin, but does not say the admin is admitted",
      );
    });

    it("accept silence about the platform admin on a route that compares the role to refuse it", () => {
      const clear = "POST /api/merchants/:id/clear-transactions";
      const review: RouteReview = {
        ...base,
        branches: [{ principal: "merchant", roles: ["owner"], tenant: "path-merchant", tenantRule: "the owner's own business; the admin is refused" }],
      };
      expect(problemsWith(clear, review).join("\n")).not.toContain("platform admin");
    });

    it("refuse any principal but the platform admin on a route behind authenticateAdmin", () => {
      const list = "GET /api/admin/merchants";
      const asMerchant: RouteReview = {
        ...base,
        branches: [{ principal: "merchant", roles: ["owner", "member"], tenant: "session", tenantRule: "the session's own business" }],
        successDto: "adminMerchantSummaryDto",
        sideEffects: "an audit log line",
        errorDisclosure: ["fixed"],
        input: "nothing",
      };
      expect(problemsWith(list, asMerchant).join("\n")).toContain("sits behind authenticateAdmin, so every branch must be the platform admin");
      expect(problemsWith(list, ROUTE_REVIEW[list])).toEqual([]);
    });

    it("refuse an unauthenticated principal for a signed-in route's branch without controls", () => {
      const review: RouteReview = { ...base, branches: [{ principal: "public", tenant: "none", tenantRule: "none" }] };
      expect(problemsWith(theme, review).join("\n")).toContain("states no controls");
    });

    it("refuse an owner-only claim on a route with no owner check", () => {
      const splitEnabled = "PATCH /api/transactions/:id/split-enabled";
      const review: RouteReview = {
        ...base,
        branches: [{ principal: "merchant", roles: ["owner"], tenant: "resource", tenantRule: "compares the sale's merchant" }],
        successDto: "ownerTransactionDto",
        errorDisclosure: ["fixed"],
        sideEffects: "a live update",
      };
      expect(problemsWith(splitEnabled, review).join("\n")).toContain("owner-only");
    });

    it("refuse 'fixed messages' on a route that puts validation issues into a response", () => {
      expect(problemsWith(theme, { ...base, errorDisclosure: ["fixed"] }).join("\n")).toContain("claims fixed messages only");
    });

    it("refuse a guessable-number route without a finding", () => {
      const read = "GET /api/transactions/:id";
      const review: RouteReview = {
        branches: [{ principal: "public", tenant: "number", tenantRule: "the sale number" }],
        input: "id: strict",
        capability: null,
        entitlement: null,
        idempotency: "read-only",
        sideEffects: null,
        successDto: "publicTransactionDto",
        errorDisclosure: ["fixed"],
        controls: { authenticity: "anyone", replay: "read-only", rate: "none" },
      };
      expect(problemsWith(read, review).join("\n")).toContain("must be a finding");
    });

    it("refuse a sign-in by credentials on a route that checks no password and asks Google nothing", () => {
      const start = "GET /api/auth/google";
      const review: RouteReview = {
        branches: [{ principal: "public", tenant: "credentials", tenantRule: "the login the email names" }],
        input: "nothing",
        capability: null,
        entitlement: null,
        idempotency: "starts a sign-in",
        sideEffects: null,
        successDto: "302",
        errorDisclosure: ["fixed"],
        controls: { authenticity: "a password", replay: "harmless", rate: "none" },
      };
      expect(problemsWith(start, review).join("\n")).toContain("calls no password or Google check");
      const signedIn: RouteReview = {
        ...review,
        branches: [{ principal: "merchant", roles: ["owner"], tenant: "credentials", tenantRule: "the login" }],
      };
      expect(problemsWith(start, signedIn).join("\n")).toContain("is selected by credentials, but is not a public branch");
    });

    it("refuse a route that emails an address the caller names without a rate limit", () => {
      const status = "GET /api/merchants/:id/qr"; // any route with no rate limit
      const review: RouteReview = {
        branches: [{ principal: "public", tenant: "mailbox", tenantRule: "the address named" }],
        input: "id: strict",
        capability: null,
        entitlement: null,
        idempotency: "read-only",
        sideEffects: null,
        successDto: "{ emailVerified }",
        errorDisclosure: ["fixed"],
        controls: { authenticity: "the mailbox", replay: "read-only", rate: "none" },
      };
      expect(problemsWith(status, review).join("\n")).toContain("emails an address the caller names, but calls no rate limit");
    });

    it("refuse a sign-up link or Google's one-time code held without its credential check", () => {
      // The checks that make these routes a credential holder's are recorded (route-facts.ts).
      for (const key of ["POST /api/auth/google/session", "POST /api/auth/confirm-email"]) {
        const facts = factsOf(key);
        expect(facts.authChecks.filter((check) => TOKEN_CHECKS.includes(check))).toHaveLength(1);
      }
    });

    it("refuse a silent rate limit, an unexplained raw value, and a missing gate", () => {
      const notification = "ALL /api/windcave/notification";
      const review = ROUTE_REVIEW[notification];
      const problems = problemsWith(notification, {
        ...review,
        input: "the provider's id",
        capability: null,
        controls: { ...review.controls!, rate: "fine" },
      }).join("\n");
      expect(problems).toContain('controls.rate must start with "none"');
      expect(problems).toContain("reads sessionId raw");
      expect(problems).toContain("review's capability is empty");
    });
  });
});
