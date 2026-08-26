import { publicSignupSchema } from "@shared/schema";
import { PLAN_IDS, PLANS } from "@shared/plans";

const validSignup = {
  name: "Jamie Smith",
  email: "jamie@example.com",
  phone: "+64 21 555 0184",
  businessName: "Kauri Studio Limited",
  businessType: "limited-company",
  businessAddress: "18 Kauri Road, Auckland 1023",
  nzbn: "9429041234567",
  gstNumber: "",
  director: "Jamie Smith",
  businessDescription: "Independent design studio.",
  websiteUrl: "https://kauristudio.co.nz",
  estimatedAnnualTurnover: "$150k–$500k",
  planId: "solo",
  password: "StrongPass1",
  confirmPassword: "StrongPass1",
};

describe("consolidated public signup schema", () => {
  it("accepts a complete five-step signup payload", () => {
    expect(publicSignupSchema.safeParse(validSignup).success).toBe(true);
  });

  it("allows NZBN, GST and website to be left blank", () => {
    const result = publicSignupSchema.safeParse({
      ...validSignup,
      nzbn: "",
      gstNumber: "",
      websiteUrl: "",
    });
    expect(result.success).toBe(true);
  });

  it("requires the contact, business and KYC fields", () => {
    const result = publicSignupSchema.safeParse({
      ...validSignup,
      phone: "",
      businessName: "",
      director: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a mismatched password confirmation", () => {
    const result = publicSignupSchema.safeParse({
      ...validSignup,
      confirmPassword: "DifferentPass1",
    });
    expect(result.success).toBe(false);
  });

  it.each(PLAN_IDS)("accepts the %s subscription plan", (planId) => {
    const result = publicSignupSchema.safeParse({ ...validSignup, planId });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.planId).toBe(planId);
  });

  it("rejects a plan outside the shared catalogue", () => {
    expect(publicSignupSchema.safeParse({ ...validSignup, planId: "enterprise" }).success)
      .toBe(false);
  });

  it("defaults legacy callers without a plan to Solo", () => {
    const { planId: _planId, ...legacySignup } = validSignup;
    const result = publicSignupSchema.safeParse(legacySignup);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.planId).toBe("solo");
  });
});

describe("subscription plan catalogue", () => {
  it("keeps the advertised prices and seat limits exact", () => {
    expect(PLANS).toMatchObject({
      solo: { priceCents: 799, seats: 1 },
      team: { priceCents: 899, seats: 5, popular: true },
      crew: { priceCents: 1299, seats: 10 },
    });
  });
});
