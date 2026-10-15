/*
 * R1-T4 phase E. Every way the app calls its own API signs the request in by the session cookie (sent by
 * the browser itself with a same-origin request) and carries the page's CSRF token on a change. None
 * reads a token from storage or sends an Authorization header.
 */
import { apiRequest, getQueryFn } from "../queryClient";
import { propFetch, propHeaders } from "../property-api";
import { tradesFetch, tradesHeaders } from "../trades-api";
import { CSRF_HEADER, holdSession, releaseSession } from "../session";

const fetchMock = global.fetch as jest.Mock;
const reply = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body),
  clone() { return this; },
});
const sent = (index = 0) => {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit | undefined];
  const headers = new Headers(init?.headers);
  return {
    url, method: init?.method ?? "GET", credentials: init?.credentials,
    csrf: headers.get(CSRF_HEADER), authorization: headers.get("Authorization"), contentType: headers.get("Content-Type"),
  };
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(reply(200, { ok: true }));
  localStorage.clear();
  // A token left in storage from before the switch must never be sent.
  localStorage.setItem("authToken", "left.from.before");
  localStorage.setItem("adminAuthToken", "left.from.before.admin");
  releaseSession("business");
  releaseSession("admin");
  holdSession("business", { id: 7, email: "owner@example.test", merchantId: 22, role: "owner" }, "business-token");
  holdSession("admin", { id: 1, email: "admin@example.test", merchantId: 0, role: "admin" }, "admin-token");
});

describe("apiRequest", () => {
  it("a change carries the page's CSRF token and its JSON body; no token from storage", async () => {
    await apiRequest("PUT", "/api/merchants/22/theme", { themeId: "classic" });
    expect(sent()).toEqual({
      url: "/api/merchants/22/theme", method: "PUT", credentials: "same-origin",
      csrf: "business-token", authorization: null, contentType: "application/json",
    });
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe(JSON.stringify({ themeId: "classic" }));
  });

  it("a change in the admin area carries the admin session's token", async () => {
    await apiRequest("POST", "/api/admin/merchants/22/resend-verification");
    expect(sent()).toMatchObject({ method: "POST", csrf: "admin-token", authorization: null });
  });

  it("a read carries no token of any kind", async () => {
    await apiRequest("GET", "/api/subscription");
    expect(sent()).toMatchObject({ method: "GET", credentials: "same-origin", csrf: null, authorization: null });
  });
});

describe("the shared query function", () => {
  const read = (on401: "returnNull" | "throw") =>
    getQueryFn<unknown>({ on401 })({ queryKey: ["/api/admin/merchants"] } as never);

  it("reads with the session cookie and no token", async () => {
    await expect(read("throw")).resolves.toEqual({ ok: true });
    expect(sent()).toMatchObject({ url: "/api/admin/merchants", method: "GET", credentials: "same-origin", csrf: null, authorization: null });
  });

  it("a refusal is null or an error, as asked", async () => {
    fetchMock.mockResolvedValue(reply(401, { message: "Access token required" }));
    await expect(read("returnNull")).resolves.toBeNull();
    await expect(read("throw")).rejects.toThrow(/401/);
  });
});

describe.each([
  ["propFetch", propFetch, propHeaders, "/api/property/tenants"],
  ["tradesFetch", tradesFetch, tradesHeaders, "/api/trades/clients"],
] as const)("%s", (_name, fetcher, headers, path) => {
  it("a change carries the page's CSRF token; a read carries none; neither a token from storage", async () => {
    await fetcher(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    await fetcher(path);
    expect(sent(0)).toEqual({ url: path, method: "POST", credentials: "same-origin", csrf: "business-token", authorization: null, contentType: "application/json" });
    expect(sent(1)).toMatchObject({ method: "GET", credentials: "same-origin", csrf: null, authorization: null });
  });

  it("its header helper gives the page's CSRF token and nothing else", () => {
    expect(headers()).toEqual({ [CSRF_HEADER]: "business-token" });
    releaseSession("business");
    expect(headers()).toEqual({});
  });
});
