import { queryWindcaveSession } from "../windcave";

/**
 * C10 route review, batch 3a (2026-09-26): a split invoice's completion hands
 * the session id the customer's page sent to queryWindcaveSession, which put it
 * into the provider's URL as it came. "../transactions/123" then asked the
 * provider for a different resource, with the platform's credentials. The id is
 * now one encoded path segment, as queryStoredCardSession already does.
 */

function providerReply(): Response {
  return {
    status: 200,
    ok: true,
    json: async () => ({ transactions: [{ authorised: false, id: "provider-tx" }] }),
  } as unknown as Response;
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

it.each([
  ["a parent-directory path", "../transactions/123", "..%2Ftransactions%2F123"],
  ["a query string", "abc?format=xml", "abc%3Fformat%3Dxml"],
  ["a fragment", "abc#x", "abc%23x"],
])("keeps %s inside the one session it names", async (_label, sessionId, encoded) => {
  const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(providerReply());

  await queryWindcaveSession(sessionId);

  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(String(fetchSpy.mock.calls[0][0])).toMatch(new RegExp(`/sessions/${encoded.replace(/[.%]/g, "\\$&")}$`));
});

it("asks for an ordinary session id unchanged", async () => {
  const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(providerReply());

  await queryWindcaveSession("00001200030255390bbd02ba0dbcf0e7");

  expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/sessions\/00001200030255390bbd02ba0dbcf0e7$/);
});
