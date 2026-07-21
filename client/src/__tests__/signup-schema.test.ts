import { publicSignupSchema } from "@shared/schema";

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
  password: "StrongPass1",
  confirmPassword: "StrongPass1",
};

describe("consolidated public signup schema", () => {
  it("accepts a complete four-step signup payload", () => {
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
});
