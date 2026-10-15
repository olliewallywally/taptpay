import { SSEClient } from "./sse-client";

test('financial event replay does not invoke the same listener twice after reconnect',()=>{
  sessionStorage.clear();const id='11111111-1111-4111-8111-111111111111',callback=jest.fn(),message=JSON.stringify({type:'transaction_updated',eventId:id});
  const first=new SSEClient();first.subscribe('transaction_updated',callback);(first as any).dispatch(message);(first as any).dispatch(message);
  const reloaded=new SSEClient();reloaded.subscribe('transaction_updated',callback);(reloaded as any).dispatch(message);
  expect(callback).toHaveBeenCalledTimes(1);sessionStorage.clear();
});

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
    client.connectMerchant(42);
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
