import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("landing-demo document serving contract", () => {
  test("development and production serve the unique document before SPA fallback", () => {
    const source = read("server/vite.ts");
    const devRoute = source.indexOf('app.get("/landing-demo.html"');
    const devFallback = source.indexOf('app.use("*"');
    const prodRoute = source.lastIndexOf('app.get("/landing-demo.html"');
    const staticMiddleware = source.indexOf("app.use(express.static(distPath))");

    expect(devRoute).toBeGreaterThan(-1);
    expect(devRoute).toBeLessThan(devFallback);
    expect(prodRoute).toBeGreaterThan(devRoute);
    expect(prodRoute).toBeLessThan(staticMiddleware);
    expect(source).toContain('"landing-demo.html"');
    expect(source).toContain('res.status(404).type("text/plain")');
    expect(source).toContain('const entry = "/src/landing-demo/main.tsx"');
  });

  test("only the demo document receives the same-origin frame policy", () => {
    const source = read("server/index.ts");
    const scopedBlock = source.slice(
      source.indexOf('if (req.path === "/landing-demo.html")'),
      source.indexOf("// Gzip compression"),
    );

    expect(scopedBlock).toContain('"X-Frame-Options": "SAMEORIGIN"');
    expect(scopedBlock).toContain('"X-Robots-Tag": "noindex, nofollow"');
    expect(scopedBlock).toContain('"X-Content-Type-Options": "nosniff"');
    expect(scopedBlock).toContain('"Cache-Control": "private, no-store"');
    expect(source).toContain('"frame-ancestors \'self\'"');
    expect(source).toContain("if (!isProduction)");
    expect(source).toContain("registerLandingDemoRoutes(app)");
    expect(source).toContain("req.path.startsWith('/api/landing-demo/')");
  });
});
