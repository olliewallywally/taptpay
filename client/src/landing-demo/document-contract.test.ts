import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readWorkspaceFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("standalone landing demo document", () => {
  it("has a unique fixed-viewport document and entry marker", () => {
    const html = readWorkspaceFile("client/landing-demo.html");

    expect(html).toContain(
      'data-landing-demo-document="taptpay-landing-demo-v1"',
    );
    expect(html).toContain(
      'data-landing-demo-root="taptpay-landing-demo-v1"',
    );
    expect(html).toContain('content="width=390, initial-scale=1');
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain('name="referrer" content="no-referrer"');
    expect(html).toContain('src="/src/landing-demo/main.tsx"');
    expect(html).not.toContain('src="/src/main.tsx"');
    expect(html).not.toContain("manifest.json");
    expect(html).not.toContain("sw.js");
  });

  it("uses only the fixed local document styles and local fonts", () => {
    const css = readWorkspaceFile(
      "client/src/landing-demo/landing-demo.css",
    );

    expect(css).toMatch(/#root\s*\{[\s\S]*width: 390px;/);
    expect(css).toMatch(/#root\s*\{[\s\S]*height: 844px;/);
    expect(css).toContain('/assets/fonts/Outfit-Regular.otf');
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it("is a second Vite HTML input without changing manual chunks", () => {
    const config = readWorkspaceFile("vite.config.ts");

    expect(config).toContain('main: path.resolve(import.meta.dirname, "client", "index.html")');
    expect(config).toContain('"landing-demo.html"');
    expect(config).toContain("manualChunks(id)");
  });

  it("does not boot the production app, providers, auth, storage, or service worker", () => {
    const source = [
      "client/src/landing-demo/main.tsx",
      "client/src/landing-demo/LandingDemoApp.tsx",
      "client/src/landing-demo/protocol.ts",
    ]
      .map(readWorkspaceFile)
      .join("\n");

    expect(source).not.toMatch(/from\s+["'][^"']*\/App["']/);
    expect(source).not.toMatch(
      /ProtectedRoute|TutorialProvider|NotificationProvider|@tanstack|sseClient|authToken|localStorage|sessionStorage|serviceWorker\.register|PaymentRequest|Windcave/i,
    );
    expect(source).not.toMatch(/fetch\s*\(|apiRequest\s*\(/);
  });
});
