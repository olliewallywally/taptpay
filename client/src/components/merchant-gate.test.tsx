import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { getCurrentMerchantId } from "@/lib/auth";
import { MerchantGate } from "./merchant-gate";

jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: jest.fn() }));
const signedIn = getCurrentMerchantId as jest.Mock;

/** A page with local state, so a remount is visible as that state resetting. */
function Page({ merchantId }: { merchantId: number }) {
  const [clicks, setClicks] = useState(0);
  return <button onClick={() => setClicks(clicks + 1)}>merchant {merchantId}, {clicks} clicks</button>;
}

function mount(redirect?: "route" | "document", fallback?: React.ReactNode) {
  const location = memoryLocation({ path: "/settings", record: true });
  const ui = () => (
    <Router hook={location.hook}>
      <MerchantGate redirect={redirect} fallback={fallback}>
        {(merchantId) => <Page merchantId={merchantId} />}
      </MerchantGate>
    </Router>
  );
  const view = render(ui());
  return { location, rerender: () => view.rerender(ui()), unmount: view.unmount };
}

let consoleErrors: unknown[][];
beforeEach(() => {
  consoleErrors = [];
  jest.spyOn(console, "error").mockImplementation((...args) => { consoleErrors.push(args); });
});
afterEach(() => jest.restoreAllMocks());
const jsdomNavigations = () =>
  consoleErrors.filter((args) => String(args[0]).includes("Not implemented: navigation")).length;

describe("MerchantGate (R1-T8)", () => {
  it("renders the page with the signed-in merchant's id", () => {
    signedIn.mockReturnValue(22);
    mount();
    expect(screen.getByRole("button")).toHaveTextContent("merchant 22, 0 clicks");
    expect(consoleErrors).toEqual([]);
  });

  it("unmounts the page, without an error, when the session ends while it is open", () => {
    signedIn.mockReturnValue(22);
    const view = mount();
    signedIn.mockReturnValue(null);
    expect(() => view.rerender()).not.toThrow();
    expect(screen.queryByRole("button")).toBeNull();
    expect(view.location.history).toEqual(["/settings", "/login"]);
    expect(consoleErrors).toEqual([]);
  });

  it("never renders the page without a merchant, and leaves for the login page", () => {
    signedIn.mockReturnValue(null);
    const view = mount(undefined, <p>Redirecting to login...</p>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Redirecting to login...")).toBeInTheDocument();
    expect(view.location.history).toEqual(["/settings", "/login"]);
  });

  it("can leave with a full page load instead of in-app navigation", () => {
    signedIn.mockReturnValue(null);
    const view = mount("document");
    // jsdom implements no document navigation; it reports the attempt instead.
    expect(jsdomNavigations()).toBe(1);
    expect(view.location.history).toEqual(["/settings"]);
  });

  it("remounts the page when the signed-in merchant changes, so no state carries across", () => {
    signedIn.mockReturnValue(22);
    const view = mount();
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button")).toHaveTextContent("merchant 22, 1 clicks");
    signedIn.mockReturnValue(23);
    view.rerender();
    expect(screen.getByRole("button")).toHaveTextContent("merchant 23, 0 clicks");
    expect(view.location.history).toEqual(["/settings"]);
    expect(consoleErrors).toEqual([]);
  });

  it("does not navigate again when the app is already on /login", () => {
    // Sign-out: the page removes the token and navigates to /login itself; the
    // page transition then re-renders the outgoing page, and the gate must not
    // push a second /login (a full-page redirect would reload the login page).
    signedIn.mockReturnValue(22);
    const view = mount("document");
    signedIn.mockReturnValue(null);
    act(() => view.location.navigate("/login"));
    view.rerender();
    expect(view.location.history).toEqual(["/settings", "/login"]);
    expect(jsdomNavigations()).toBe(0);
    expect(consoleErrors).toEqual([]);
  });

  it("redirects once, and not after it has unmounted", () => {
    signedIn.mockReturnValue(null);
    const view = mount();
    view.rerender();
    view.unmount();
    expect(view.location.history).toEqual(["/settings", "/login"]);
  });
});
