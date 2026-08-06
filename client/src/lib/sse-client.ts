export interface SSEMessage {
  type: string;
  transaction?: any;
  addressingMode?: "legacy-no-board" | "board";
  stoneId?: number;
  [key: string]: any;
}

type Listener = (data: SSEMessage) => void;

export class SSEClient {
  private eventSource: EventSource | null = null;
  private abortController: AbortController | null = null;
  private listeners = new Map<string, Listener[]>();

  private closeTransport() {
    this.eventSource?.close();
    this.eventSource = null;
    this.abortController?.abort();
    this.abortController = null;
  }

  private dispatch(raw: string) {
    try {
      const message: SSEMessage = JSON.parse(raw);
      const callbacks = this.listeners.get(message.type) || [];
      callbacks.forEach((callback) => callback(message));
    } catch (error) {
      console.error("Failed to parse SSE message:", error);
    }
  }

  connectCustomer(merchantId: number, stoneId?: number | null) {
    this.closeTransport();
    const params = new URLSearchParams();
    if (stoneId !== undefined && stoneId !== null) params.set("stoneId", String(stoneId));
    const query = params.toString();
    this.eventSource = new EventSource(
      `/api/merchants/${merchantId}/events${query ? `?${query}` : ""}`,
    );
    this.eventSource.onmessage = (event) => this.dispatch(event.data);
    this.eventSource.onerror = (error) => {
      console.error("Customer SSE connection error:", error);
    };
  }

  connectMerchant(merchantId: number, token: string) {
    this.closeTransport();
    const controller = new AbortController();
    this.abortController = controller;
    void this.consumeMerchantStream(merchantId, token, controller.signal);
  }

  // Compatibility for anonymous customer callers while call sites migrate to
  // the explicit method. Authenticated streams must use connectMerchant.
  connect(merchantId: number, stoneId?: number | null) {
    this.connectCustomer(merchantId, stoneId);
  }

  private async consumeMerchantStream(merchantId: number, token: string, signal: AbortSignal) {
    const decoder = new TextDecoder();
    while (!signal.aborted) {
      try {
        const response = await fetch(`/api/merchants/${merchantId}/events`, {
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          cache: "no-store",
          signal,
        });
        if (response.status === 401) {
          console.error("Merchant SSE authentication expired");
          return;
        }
        if (!response.ok || !response.body) {
          throw new Error(`SSE request failed with ${response.status}`);
        }

        const reader = response.body.getReader();
        let buffer = "";
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (data) this.dispatch(data);
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch (error) {
        if (signal.aborted) return;
        console.error("Merchant SSE connection error:", error);
      }

      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 1_500);
        signal.addEventListener("abort", () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
    }
  }

  subscribe(eventType: string, callback: Listener) {
    if (!this.listeners.has(eventType)) this.listeners.set(eventType, []);
    this.listeners.get(eventType)!.push(callback);
  }

  unsubscribe(eventType: string, callback: Listener) {
    const callbacks = this.listeners.get(eventType) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
  }

  disconnect() {
    this.closeTransport();
    this.listeners.clear();
  }
}

export const sseClient = new SSEClient();
