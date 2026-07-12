export interface SSEMessage {
  type: string;
  transaction?: any;
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  connect(merchantId: number, stoneId?: number | null, token?: string | null) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    // EventSource can't send an Authorization header, so an authenticated merchant
    // passes its JWT in the query string to unlock the full event payload. The
    // anonymous customer payment page connects without a token and receives a
    // redacted view (server strips fee/margin internals for unauthenticated subs).
    const params = new URLSearchParams();
    if (stoneId) params.set('stoneId', String(stoneId));
    if (token) params.set('token', token);
    const qs = params.toString();
    console.log(`Connecting to SSE for merchant ${merchantId}${stoneId ? ` and stone ${stoneId}` : ''}`);
    this.eventSource = new EventSource(`/api/merchants/${merchantId}/events${qs ? `?${qs}` : ''}`);
    
    this.eventSource.onopen = () => {
      console.log(`SSE connection opened for merchant ${merchantId}`);
    };
    
    this.eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data);
        console.log('SSE message received:', message);
        const callbacks = this.listeners.get(message.type) || [];
        callbacks.forEach(callback => callback(message));
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      console.log('SSE readyState:', this.eventSource?.readyState);
    };
  }

  subscribe(eventType: string, callback: (data: any) => void) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(callback);
  }

  unsubscribe(eventType: string, callback: (data: any) => void) {
    const callbacks = this.listeners.get(eventType) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.listeners.clear();
  }
}

export const sseClient = new SSEClient();
