#!/usr/bin/env node
/* Run an existing fixture-based browser gate on localhost without loading the
   application server, database or provider. Built screens are real; API replies
   remain the gate's intercepted synthetic fixtures. P0 requires --dev to retain
   its existing /src/ module assertions. */
import express from "express";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

const argv = process.argv.slice(2);
const dev = argv[0] === "--dev";
const source = argv.shift();
const gate = argv.shift();
if (!source || !gate || (!dev && !existsSync(join(resolve(source), "index.html")))) {
  throw new Error("usage: run-fixture-browser-gate.mjs <built client dir>|--dev <gate script> [gate args]");
}
if (gate.endsWith("verify-desktop-p0.mjs") && !dev) throw new Error("desktop P0 needs --dev for its /src/ assertions");
const app = express();
const server = createServer(app);
// This public boolean is outside the historical layout fixtures' scope.
app.get("/api/auth/apple/available", (_req, res) => res.json({ available: false }));
app.use("/api", (_req, res) => res.status(404).json({ message: "No browser fixture for this API" }));
let vite;
if (dev) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } }, appType: "spa" });
  app.use(vite.middlewares);
} else {
  const built = resolve(source);
  app.use(express.static(built));
  app.use("*", (_req, res) => res.sendFile(join(built, "index.html")));
}
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
console.log(`Fixture gate ${gate} at ${baseUrl} (${dev ? "Vite source" : "built client"})`);
try {
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve(gate), ...argv], {
      stdio: "inherit", env: { ...process.env, DESKTOP_SHOT_BASE_URL: baseUrl, P0_BASE_URL: baseUrl },
    });
    child.on("error", reject);
    child.on("exit", (exitCode, signal) => done(exitCode ?? (signal ? 1 : 0)));
  });
  process.exitCode = code;
} finally {
  if (vite) await vite.close();
  await new Promise((done) => server.close(done));
}
