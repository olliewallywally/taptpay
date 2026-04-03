declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      getPlatform: () => string;
    };
  }
}

export function isNativeApp(): boolean {
  return window.Capacitor?.isNativePlatform() === true;
}

export function isNativeIOS(): boolean {
  return isNativeApp() && window.Capacitor?.getPlatform() === "ios";
}
