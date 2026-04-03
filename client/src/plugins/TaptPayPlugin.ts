import { registerPlugin } from "@capacitor/core";
import type { TaptPayBridgeOptions, TaptPayBridgeResult } from "@/lib/native";

// Register the native Capacitor plugin by its jsName ("TaptPay").
// Capacitor maps this string to the Swift class whose `jsName` property
// equals "TaptPay" (see src/plugins/TapToPayPlugin.swift).
//
// In a native iOS build this returns a real bridge proxy that calls
// TapToPayPlugin.startTapToPay(_:) on the main thread.
//
// In browser / web builds, registerPlugin() returns a no-op stub — the
// DEV simulation fallback in the terminal components handles that case.
const TaptPayPlugin = registerPlugin<{
  startTapToPay(opts: TaptPayBridgeOptions): Promise<TaptPayBridgeResult>;
}>("TaptPay");

// Expose as window.TaptPay for direct access in terminal component bridge checks.
// The native.ts canTapToPay() guard confirms the platform is iOS before use.
if (typeof window !== "undefined") {
  (window as any).TaptPay = TaptPayPlugin;
}

export { TaptPayPlugin };
