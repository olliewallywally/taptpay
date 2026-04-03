export interface TaptPayBridgeOptions {
  amount: number;
  currency: string;
  merchantName: string;
}

export interface TaptPayBridgeResult {
  approved: boolean;
  token?: string;
  cancelled?: boolean;
  error?: string;
}

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      getPlatform: () => string;
    };
    TaptPay?: {
      startTapToPay(opts: TaptPayBridgeOptions): Promise<TaptPayBridgeResult>;
    };
  }
}

export function isNativeApp(): boolean {
  return window.Capacitor?.isNativePlatform() === true;
}

export function isNativeIOS(): boolean {
  return isNativeApp() && window.Capacitor?.getPlatform() === "ios";
}

export function canTapToPay(): boolean {
  return isNativeIOS() && typeof window.TaptPay?.startTapToPay === "function";
}
