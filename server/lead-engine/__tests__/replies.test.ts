import { extractSender } from "../outreach/parse";

describe("extractSender", () => {
  test("reads common inbound-parse payload fields and strips display names", () => {
    expect(extractSender({ from: "Joe Bloggs <joe@x.com>" })).toBe("joe@x.com");
    expect(extractSender({ sender: "bob@y.co.nz" })).toBe("bob@y.co.nz");
    expect(extractSender({ envelope: { from: "amy@z.com" } })).toBe("amy@z.com");
    expect(extractSender({ from_email: "k@w.com" })).toBe("k@w.com");
  });

  test("returns undefined when no sender is present", () => {
    expect(extractSender({})).toBeUndefined();
    expect(extractSender(null)).toBeUndefined();
    expect(extractSender({ from: 123 })).toBeUndefined();
  });
});
