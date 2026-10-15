import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "nz.taptpay.app",
  appName: "TaptPay",
  webDir: "dist/public",
  server: {
    url: "https://taptpay.co.nz/app-login",
    cleartext: false,
    // Keep the existing cookie-bound Apple sign-in in this WebView (see
    // server/apple-sign-in.ts); every other external navigation stays outside it.
    allowNavigation: ["appleid.apple.com"],
  },
  ios: {
    backgroundColor: "#0055FF",
    contentInset: "always",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
};

export default config;
