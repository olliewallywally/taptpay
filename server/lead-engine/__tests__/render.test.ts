import { renderMerge, renderStepContent } from "../outreach/render";

const lead: any = {
  businessName: "Joe's Cafe",
  contactName: "Joe Bloggs",
  suburb: "Newtown",
  city: "Wellington",
  segment: "hospitality",
  draftStatus: "approved",
  draftSubject: "Hi Joe",
  draftBody: "Body here",
};

describe("render", () => {
  test("renderMerge substitutes known fields and blanks unknown", () => {
    expect(renderMerge("Hi {{businessName}} ({{firstName}}) in {{suburb}}", lead)).toBe("Hi Joe's Cafe (Joe) in Newtown");
    expect(renderMerge("x {{nope}} y", lead)).toBe("x  y");
  });

  test("lead_draft step uses the approved draft; missing/unapproved → null", () => {
    expect(renderStepContent({ source: "lead_draft" } as any, lead)).toEqual({ subject: "Hi Joe", body: "Body here" });
    expect(renderStepContent({ source: "lead_draft" } as any, { ...lead, draftStatus: "draft" })).toBeNull();
  });

  test("template step renders merge fields; missing body → null", () => {
    expect(renderStepContent({ source: "template", subject: "S {{businessName}}", body: "B {{suburb}}" } as any, lead))
      .toEqual({ subject: "S Joe's Cafe", body: "B Newtown" });
    expect(renderStepContent({ source: "template", subject: "x" } as any, lead)).toBeNull();
  });
});
