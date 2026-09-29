import { apiErrorMessage, apiErrorStatus } from "./api-error";

describe("api request errors", () => {
  it("extracts the safe JSON message and HTTP status", () => {
    const error = new Error('409: {"message":"Remove two team logins before downgrading."}');
    expect(apiErrorStatus(error)).toBe(409);
    expect(apiErrorMessage(error, "Plan change failed")).toBe(
      "Remove two team logins before downgrading.",
    );
  });

  it("uses readable text or a fallback for non-standard failures", () => {
    expect(apiErrorMessage(new Error("503: Service unavailable"), "Try again")).toBe("Service unavailable");
    expect(apiErrorStatus(new Error("Network error"))).toBeNull();
    expect(apiErrorMessage(null, "Try again")).toBe("Try again");
  });
});
