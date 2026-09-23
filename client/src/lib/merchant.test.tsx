/*
 * The business details stamp every report and export: the business name, and the
 * GST settings that decide the GST lines. The hook took the merchant from a
 * "merchantId" storage key that only Google sign-in wrote, so after a password
 * sign-in it never ran, and exports printed "TaptPay" with GST in the default
 * mode. It now follows the session token, as every other page does.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { useMerchantProfile } from "./merchant";

const fetchMock = global.fetch as jest.Mock;
const sessionToken = (payload: object) => `h.${btoa(JSON.stringify(payload))}.s`;
const PROFILE = { id: 77, businessName: "Kauri Plumbing", tradeGstMode: "exclusive" };

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) =>
    url === "/api/merchants/77/profile"
      ? ({ ok: true, status: 200, json: async () => PROFILE } as Response)
      : ({ ok: false, status: 403, json: async () => ({ message: "Access denied" }) } as Response),
  );
  localStorage.clear();
});

describe("useMerchantProfile", () => {
  it("loads the signed-in merchant's details after a password sign-in (a session token, no merchantId key)", async () => {
    localStorage.setItem("authToken", sessionToken({ userId: 5, merchantId: 77 }));
    const { result } = renderHook(() => useMerchantProfile(), { wrapper });

    await waitFor(() => expect(result.current.data?.businessName).toBe("Kauri Plumbing"));
    expect(fetchMock).toHaveBeenCalledWith("/api/merchants/77/profile", expect.anything());
  });

  it("follows the session, not a merchantId left behind by an earlier sign-in", async () => {
    localStorage.setItem("merchantId", "12");
    localStorage.setItem("authToken", sessionToken({ userId: 5, merchantId: 77 }));
    const { result } = renderHook(() => useMerchantProfile(), { wrapper });

    await waitFor(() => expect(result.current.data?.tradeGstMode).toBe("exclusive"));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/merchants/77/profile"]);
  });

  it("shares its cache entry with the pages that read the same profile", async () => {
    localStorage.setItem("authToken", sessionToken({ userId: 5, merchantId: 77 }));
    const { result } = renderHook(() => useMerchantProfile(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(["/api/merchants", 77, "profile"])).toEqual(PROFILE);
  });

  it("signed out, asks for nothing", async () => {
    localStorage.setItem("merchantId", "77");
    const { result } = renderHook(() => useMerchantProfile(), { wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
