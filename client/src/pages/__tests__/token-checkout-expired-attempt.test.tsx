/*
 * A payer's page keeps one idempotency key per share until a final outcome. When the server says
 * that key's attempt ended before any session was served (409 PAYMENT_ATTEMPT_EXPIRED), the key can
 * never open a session again: the page replaces it and asks once more. Nothing else rotates it.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import Checkout from "@/pages/checkout";

const token = "t".repeat(43);
jest.mock("wouter", () => ({
  useParams: () => ({ token: "t".repeat(43) }),
  useLocation: () => [`/checkout/t/${"t".repeat(43)}`, jest.fn()],
  useSearch: () => "",
}));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const OLD_KEY = "11111111-1111-4111-8111-111111111111";
const slot = `taptpay:payment-attempt:v1:retail-token:${token}:0`;
const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) => ({
  ok: status < 400, status, headers: { get: () => "application/json" },
  json: async () => body, text: async () => JSON.stringify(body),
}) as unknown as Response;
const EXPIRED = { code: "PAYMENT_ATTEMPT_EXPIRED", message: "This payment attempt ended before any payment was taken. Please try again." };

let keys: string[];
let answer: (key: string) => Response;
let storage: MemoryStorage;

beforeEach(() => {
  keys = [];
  storage = new MemoryStorage();
  storage.setItem(slot, OLD_KEY);
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: storage });
  (window as any).ApplePaySession = { canMakePayments: () => true };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `/api/pay/t/${token}`) return reply({ itemName: "Flat white", price: "5.50", status: "pending", splitEnabled: false, isSplit: false, merchant: {} });
    if (url === "/api/windcave/env") return reply({ env: "uat", applePayMerchantId: "merchant.test", googlePayMerchantId: "", googlePayEnv: "TEST" });
    if (url === `/api/pay/t/${token}/session`) {
      const { idempotencyKey } = JSON.parse(String(init?.body));
      keys.push(idempotencyKey);
      return answer(idempotencyKey);
    }
    return reply({});
  });
});
afterEach(() => { delete (window as any).ApplePaySession; });

function renderCheckout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><Checkout sourceKind="retail-token" /></QueryClientProvider>);
}

test("an expired key is replaced and the session asked for once more", async () => {
  answer = (key) => key === OLD_KEY ? reply(EXPIRED, 409)
    : reply({ sessionId: "s-1", ajaxSubmitApplePayUrl: "https://uat.windcave.com/apple", attemptState: "ready", shareIndex: 0 });
  renderCheckout();
  await waitFor(() => expect(keys.length).toBeGreaterThanOrEqual(2));
  expect(keys[0]).toBe(OLD_KEY);
  expect(keys[1]).toMatch(/^[0-9a-f-]{36}$/);
  expect(keys[1]).not.toBe(OLD_KEY);
  expect(storage.getItem(slot)).toBe(keys[1]);
});

test("'still being reconciled' keeps the key and asks nothing more", async () => {
  answer = () => reply({ message: "The previous payment outcome is still being reconciled" }, 503);
  renderCheckout();
  await waitFor(() => expect(keys.length).toBeGreaterThanOrEqual(1));
  await new Promise(resolve => setTimeout(resolve, 300));
  expect(new Set(keys)).toEqual(new Set([OLD_KEY]));
  expect(storage.getItem(slot)).toBe(OLD_KEY);
});

test("a fresh key refused too is not retried again: no loop", async () => {
  answer = () => reply(EXPIRED, 409);
  renderCheckout();
  await waitFor(() => expect(keys.length).toBeGreaterThanOrEqual(2));
  await new Promise(resolve => setTimeout(resolve, 300));
  expect(keys.length).toBe(2);
});
