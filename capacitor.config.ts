import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "nz.taptpay.app",
  appName: "TaptPay",
  webDir: "dist/public",
  server: {
    url: "https://taptpay.co.nz/app-login",
    cleartext: false,
    allowNavigation: [
      "*.taptpay.co.nz",
      "*.replit.app",
      "*.repl.co",
      "*.windcave.com",
      "pay.google.com",
      "apple.com",
      "*.apple.com",
    ],
  },
  ios: {
    backgroundColor: "#0055FF",
    contentInset: "always",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
};

export default config;
