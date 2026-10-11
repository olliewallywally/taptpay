import { SSEClient } from '@/lib/sse-client';

test('merchant stream closes on page departure and reconnects after a persisted page restoration', async () => {
  const signals: AbortSignal[] = [];
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    const signal = options!.signal as AbortSignal;
    signals.push(signal);
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const client = new SSEClient();
  try {
    client.connectMerchant(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pagehide'));
    expect(signals[0].aborted).toBe(true);
    const restored = new Event('pageshow');
    Object.defineProperty(restored, 'persisted', { value: true });
    window.dispatchEvent(restored);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[1].aborted).toBe(false);
    client.disconnect();
    window.dispatchEvent(restored);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[1].aborted).toBe(true);
  } finally {
    client.disconnect(); fetchMock.mockRestore();
  }
});

test('a real merchant stream failure still reports the error', async () => {
  jest.useFakeTimers();
  const failure = new Error('connection failed');
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(failure);
  const report = jest.spyOn(console, 'error').mockImplementation(() => {});
  const client = new SSEClient();
  try {
    client.connectMerchant(1);
    await Promise.resolve();
    expect(report).toHaveBeenCalledWith('Merchant SSE connection error:', failure);
  } finally {
    client.disconnect(); fetchMock.mockRestore(); report.mockRestore(); jest.useRealTimers();
  }
});
