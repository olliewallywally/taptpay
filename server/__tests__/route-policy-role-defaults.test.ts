import "./support/test-env";

// Refund initiation is gated by a money capability flag; enabling one
// requires enforce mode (server/config.ts's moneyFlagEnabled check).
process.env.FEATURE_REFUND_INITIATION = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

import jwt from "jsonwebtoken";
import request from "supertest";
import {
  signedIn,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
} from "./support/http-harness";
import { ADMIN_COOKIE, BUSINESS_COOKIE } from "./support/session-browser";
import { config } from "../config";

// A minimal buffer that passes this route's PNG magic-byte check
// (89 50 4E 47 0D 0A 1A 0A) without needing a real decodable image — the
// tests here are about the role gate, not image handling.
const PNG_MAGIC_ONLY = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

describe("R1-T3 safe-default role gates — owner-only merchant configuration", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("a member cannot change the theme; the owner can", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const memberAttempt = await request(app)
      .put(`/api/merchants/${owner.merchantId}/theme`)
      .set(signedIn(member))
      .send({ themeId: "midnight" });
    expect(memberAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .put(`/api/merchants/${owner.merchantId}/theme`)
      .set(signedIn(owner))
      .send({ themeId: "midnight" });
    expect(ownerAttempt.status).toBe(200);
  });

  it("a member cannot change the daily goal; the owner can", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const memberAttempt = await request(app)
      .put(`/api/merchants/${owner.merchantId}/daily-goal`)
      .set(signedIn(member))
      .send({ dailyGoal: "750.00" });
    expect(memberAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .put(`/api/merchants/${owner.merchantId}/daily-goal`)
      .set(signedIn(owner))
      .send({ dailyGoal: "750.00" });
    expect(ownerAttempt.status).toBe(200);
  });

  it("a member cannot upload the merchant logo; the owner can", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const memberAttempt = await request(app)
      .post(`/api/merchants/${owner.merchantId}/logo`)
      .set(signedIn(member))
      .attach("logo", PNG_MAGIC_ONLY, "logo.png");
    expect(memberAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .post(`/api/merchants/${owner.merchantId}/logo`)
      .set(signedIn(owner))
      .attach("logo", PNG_MAGIC_ONLY, "logo.png");
    expect(ownerAttempt.status).toBe(200);
  });

  it("a member cannot delete the merchant logo; the owner can", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const memberAttempt = await request(app)
      .delete(`/api/merchants/${owner.merchantId}/logo`)
      .set(signedIn(member));
    expect(memberAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .delete(`/api/merchants/${owner.merchantId}/logo`)
      .set(signedIn(owner));
    expect(ownerAttempt.status).not.toBe(403);
  });

  it("a member cannot initiate a refund; the owner clears the role gate (a 404 on the made-up transaction id proves it, not a 403)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const memberAttempt = await request(app)
      .post("/api/transactions/999999/refunds")
      .set(signedIn(member))
      .send({ refundAmount: "1.00", refundReason: "test", refundMethod: "original_payment_method" });
    expect(memberAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .post("/api/transactions/999999/refunds")
      .set(signedIn(owner))
      .send({ refundAmount: "1.00", refundReason: "test", refundMethod: "original_payment_method" });
    expect(ownerAttempt.status).not.toBe(403);
  });
});

/**
 * R1-T3 domain 5 (Settings, Uploads & Exports), finding UPL-1: the logo
 * route registered multer (`logoUpload.single('logo')`) BEFORE
 * `checkAccountOwnership` ran inside the handler body, so an unauthorized
 * caller's multipart body was fully parsed/buffered (and multer's own
 * fileFilter/size checks ran) before authorization was ever evaluated. A
 * caller whose file fails multer's own checks (wrong mimetype here) got a
 * multer-error 500 instead of a same-shaped 403 — proof multer ran first.
 * Fixed by moving the id-parse + ownership check into a plain middleware
 * ahead of `logoUpload.single('logo')` in the route registration.
 */
describe("R1-T3 UPL-1 — logo upload authorizes before multer parses the body", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("a non-owner's upload is refused with 403 even when the file itself would fail multer's own checks", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    // A body multer's fileFilter would itself reject (non-PNG mimetype, forced
    // via an explicit contentType so supertest doesn't infer one from the
    // ".png" extension). Before the fix this never reaches the ownership
    // check: multer's fileFilter callback errors out first, past the route
    // handler entirely, into the global error handler's generic 500. Under
    // the fixed ordering, authorization is decided before multer ever runs,
    // so the caller gets the same 403 regardless of what the body contains.
    const res = await request(app)
      .post(`/api/merchants/${owner.merchantId}/logo`)
      .set(signedIn(member))
      .attach("logo", Buffer.from("not a png"), { filename: "logo.png", contentType: "image/jpeg" });

    expect(res.status).toBe(403);
  });

  it("a cross-tenant caller's upload is refused with 403 even when the file itself would fail multer's own checks", async () => {
    const { app } = await createTestApp();
    const ownerA = await createOwnerPrincipal();
    const ownerB = await createOwnerPrincipal();

    const res = await request(app)
      .post(`/api/merchants/${ownerA.merchantId}/logo`)
      .set(signedIn(ownerB))
      .attach("logo", Buffer.from("not a png"), { filename: "logo.png", contentType: "image/jpeg" });

    expect(res.status).toBe(403);
    // Confirms the rejection happened before any write: the target merchant's
    // upload row was never created.
    const served = await request(app).get(`/uploads/logos/merchant-${ownerA.merchantId}.png`);
    expect(served.status).toBe(404);
  });

  it("an owner's own bad-mimetype upload still gets a real response (sanity: the route runs)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app)
      .post(`/api/merchants/${owner.merchantId}/logo`)
      .set(signedIn(owner))
      .attach("logo", Buffer.from("not a png"), { filename: "logo.png", contentType: "image/jpeg" });

    // Not asserting a specific status here (multer's own fileFilter error
    // shape is a pre-existing, separate concern from UPL-1's ordering bug) —
    // only that the true owner reaching this route doesn't 403, proving the
    // ownership-first reordering doesn't block a legitimate caller.
    expect(res.status).not.toBe(403);
  });
});

describe("R1-T3 safe-default role gates — admin requires the admin area's own session, not a claim", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("rejects a token that claims to be the admin, however well it is signed", async () => {
    const { app } = await createTestApp();

    // Each is signed with the server's own secret. The first claims an email that is not the admin's.
    // The second is the very token the server once issued to the admin: R1-T4 phase E3 retired it, and
    // the sign-in to the admin area is the admin's session cookie and nothing else.
    for (const email of ["not-the-real-admin@harness.test", config.admin.email]) {
      const claimed = jwt.sign(
        { principal: "admin", userId: 1, email, merchantId: 0, role: "admin" },
        config.jwtSecret,
        { expiresIn: "1h" },
      );

      const response = await request(app).get("/api/admin/merchants").set({ Authorization: `Bearer ${claimed}` });

      expect({ email, status: response.status }).toEqual({ email, status: 401 }); // 401 since 2026-09-27 (R1-T3, P2.2, owner decision): a sign-in that is invalid, expired or disabled was 403.
    }
  });

  it("rejects a business owner's session on an admin-only route: it is no sign-in to the admin area", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const response = await request(app).get("/api/admin/merchants").set(signedIn(owner));

    // The admin area reads only its own cookie (R1-T4 phase E), so the business's session is not
    // looked at there: 401, as for anyone not signed in to the admin area. (The owner's token, which
    // every route read, was answered 403.)
    expect(response.status).toBe(401);
  });

  it("rejects a business owner's session presented under the admin's cookie name, and leaves it as it was", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const asAdmin = { cookie: owner.cookie.replace(`${BUSINESS_COOKIE}=`, `${ADMIN_COOKIE}=`), csrf: owner.csrf };
    expect(asAdmin.cookie.startsWith(`${ADMIN_COOKIE}=`)).toBe(true);

    const response = await request(app).get("/api/admin/merchants").set(signedIn(asAdmin));

    expect(response.status).toBe(401);
    expect((await request(app).get("/api/auth/me").set(signedIn(owner))).status).toBe(200);
  });
});

/**
 * R1-T3's safe default is explicit: "Password change: move to
 * /api/account/password, or prove the path merchant equals the authenticated
 * account. Never ignore a path ID."
 *
 * The superseded version of this block asserted the opposite contract — that a
 * cross-tenant path id returns 200 because only the caller's own login changes.
 * That is the behaviour the plan names as wrong, and its assertions are quoted
 * verbatim in docs/evidence/remediation-v2-2/r1/R1-T3-password-path-contract-2026-09-11.md.
 * The route is not moved: its only caller builds the URL from the caller's own
 * JWT, so enforcing equality has an empty client blast radius.
 */
describe("R1-T3 safe-default: password change proves the path merchant is the caller's", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("refuses a cross-tenant path id and changes nobody's password", async () => {
    const { app } = await createTestApp();
    const ownerA = await createOwnerPrincipal();
    const ownerB = await createOwnerPrincipal();

    const response = await request(app)
      .put(`/api/merchants/${ownerB.merchantId}/change-password`)
      .set(signedIn(ownerA))
      .send({ currentPassword: "Harness123", newPassword: "NewHarness456", confirmPassword: "NewHarness456" });

    expect(response.status).toBe(403);

    // Zero side effects: both accounts keep their original password, and the
    // password the attacker tried to set works for neither.
    for (const owner of [ownerA, ownerB]) {
      const stillOld = await request(app)
        .post(`/api/auth/login`)
        .send({ email: owner.user.email, password: "Harness123" });
      expect(stillOld.status).toBe(200);

      const attemptedNew = await request(app)
        .post(`/api/auth/login`)
        .send({ email: owner.user.email, password: "NewHarness456" });
      expect(attemptedNew.status).toBe(401);
    }
  });

  it("still changes an owner's own password when the path id is their own", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const response = await request(app)
      .put(`/api/merchants/${owner.merchantId}/change-password`)
      .set(signedIn(owner))
      .send({ currentPassword: "Harness123", newPassword: "NewHarness456", confirmPassword: "NewHarness456" });

    expect(response.status).toBe(200);

    const oldFails = await request(app)
      .post(`/api/auth/login`).send({ email: owner.user.email, password: "Harness123" });
    expect(oldFails.status).toBe(401);
    const newWorks = await request(app)
      .post(`/api/auth/login`).send({ email: owner.user.email, password: "NewHarness456" });
    expect(newWorks.status).toBe(200);
  });

  it("still lets a member change their own password on their own merchant", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const response = await request(app)
      .put(`/api/merchants/${owner.merchantId}/change-password`)
      .set(signedIn(member))
      .send({ currentPassword: "Harness123", newPassword: "NewHarness456", confirmPassword: "NewHarness456" });

    expect(response.status).toBe(200);

    // The teammate's own login rotated; the owner's did not.
    const memberNew = await request(app)
      .post(`/api/auth/login`).send({ email: member.user.email, password: "NewHarness456" });
    expect(memberNew.status).toBe(200);
    const ownerUntouched = await request(app)
      .post(`/api/auth/login`).send({ email: owner.user.email, password: "Harness123" });
    expect(ownerUntouched.status).toBe(200);
  });

  it("rejects a malformed path id before anything else", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const response = await request(app)
      .put(`/api/merchants/1abc/change-password`)
      .set(signedIn(owner))
      .send({ currentPassword: "Harness123", newPassword: "NewHarness456", confirmPassword: "NewHarness456" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid id");
  });
});

/**
 * R1-T3 domain 5, finding UPL-6: theme/daily-goal/logo/change-password already
 * had cross-tenant or role-based regression coverage in this file; details,
 * business-details, the general PUT, and sector did not, despite sharing the
 * identical checkAccountOwnership/checkMerchantOwnership guard already
 * exercised above. These close that gap, following the exact
 * cross-tenant + zero-side-effect pattern change-password already uses (the
 * business-details one went with its route on 2026-09-26).
 */
describe("R1-T3 UPL-6 — cross-tenant regression coverage for the remaining settings routes", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("PUT /api/merchants/:id/details refuses a cross-tenant caller and changes nothing", async () => {
    const { app } = await createTestApp();
    const ownerA = await createOwnerPrincipal();
    const ownerB = await createOwnerPrincipal();

    const attack = await request(app)
      .put(`/api/merchants/${ownerB.merchantId}/details`)
      .set(signedIn(ownerA))
      .send({
        businessName: "Hijacked Business",
        contactEmail: "hijacked@harness.test",
        contactPhone: "021 000 0000",
        businessAddress: "1 Hijacked St",
      });
    expect(attack.status).toBe(403);

    const bProfile = await request(app).get(`/api/merchants/${ownerB.merchantId}/profile`).set(signedIn(ownerB));
    expect(bProfile.status).toBe(200);
    expect(bProfile.body.businessName).not.toBe("Hijacked Business");

    const legit = await request(app)
      .put(`/api/merchants/${ownerB.merchantId}/details`)
      .set(signedIn(ownerB))
      .send({
        businessName: "B's Real Business",
        contactEmail: "b@harness.test",
        contactPhone: "021 111 1111",
        businessAddress: "2 Real St",
      });
    expect(legit.status).toBe(200);
  });

  // PUT /api/merchants/:id/business-details was removed on 2026-09-26 with the old
  // /business-details page (owner decision; c10-batch-3-retired-routes.test.ts).

  it("PUT /api/merchants/:id (general) refuses a cross-tenant caller and changes nothing", async () => {
    const { app } = await createTestApp();
    const ownerA = await createOwnerPrincipal();
    const ownerB = await createOwnerPrincipal();

    const attack = await request(app)
      .put(`/api/merchants/${ownerB.merchantId}`)
      .set(signedIn(ownerA))
      .send({ businessName: "Hijacked Business" });
    expect(attack.status).toBe(403);

    const bProfile = await request(app).get(`/api/merchants/${ownerB.merchantId}/profile`).set(signedIn(ownerB));
    expect(bProfile.status).toBe(200);
    expect(bProfile.body.businessName).not.toBe("Hijacked Business");

    const legit = await request(app)
      .put(`/api/merchants/${ownerB.merchantId}`)
      .set(signedIn(ownerB))
      .send({ businessName: "B's Real Business" });
    expect(legit.status).toBe(200);
  });

  // PUT /api/merchants/:merchantId/sector was removed on 2026-09-27 (owner decision, C10 batch 6a):
  // c10-batch-6-business.test.ts holds it to "registered nowhere".
});

/**
 * R1-T3 domain 5, finding UPL-7: the three export/analytics routes
 * (analytics/export, export/csv, export/pdf) already gate on
 * checkMerchantOwnership and query storage by the caller's own merchantId
 * (the §8.5-preferred scoped idiom), but — like UPL-6's routes — had no
 * committed cross-tenant regression test. These close that gap.
 */
describe("R1-T3 UPL-7 — cross-tenant regression coverage for the export/analytics routes", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  // GET /api/merchants/:id/analytics/export and /export/csv were removed on 2026-09-27 (owner
  // decision, C10 batch 6b): only a page mounted nowhere called them. The PDF report stays.

  it("GET /api/merchants/:id/export/pdf refuses a cross-tenant caller", async () => {
    const { app } = await createTestApp();
    const ownerA = await createOwnerPrincipal();
    const ownerB = await createOwnerPrincipal();

    const attack = await request(app)
      .get(`/api/merchants/${ownerB.merchantId}/export/pdf`)
      .set(signedIn(ownerA));
    expect(attack.status).toBe(403);

    const legit = await request(app)
      .get(`/api/merchants/${ownerB.merchantId}/export/pdf`)
      .set(signedIn(ownerB));
    expect(legit.status).toBe(200);
  });
});
