import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "nz.taptpay.app",
  appName: "TaptPay",
  webDir: "dist/public",
  server: {
    url: "https://taptpay.co.nz/app-login",
    cleartext: false,
    // Preserve Apple sign-in cookies and Settings' browser-held billing session.
    // Production HPP host is validated in server/windcave-links.ts; no wildcards.
    allowNavigation: ["appleid.apple.com", "sec.windcave.com"],
  },
  ios: {
    backgroundColor: "#0055FF",
    contentInset: "always",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
};

export default config;
