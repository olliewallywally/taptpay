import { SSEClient } from "./sse-client";

describe("SSEClient merchant authentication failures", () => {
  const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock.mockReset();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  it.each([401, 403])("does not reconnect after a %i response", async (status) => {
    fetchMock.mockResolvedValue({
      status,
      ok: false,
      body: null,
    } as Response);

    const client = new SSEClient();
    client.connectMerchant(42, "revoked-token");
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Merchant SSE authentication expired or was revoked",
    );

    await jest.advanceTimersByTimeAsync(3_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    client.disconnect();
  });
});
