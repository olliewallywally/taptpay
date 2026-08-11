#!/usr/bin/env node
/** Static safety gate for the landing phone demo boundary. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const featureRoot = resolve(root, "client/src/pages/landing-phone");
const files = ["LandingPhoneDemo.tsx", "LandingPhoneMount.tsx", "LandingPhoneViewport.tsx", "LandingDemoFrame.tsx", "protocol.ts"]
  .filter((name) => existsSync(resolve(featureRoot, name)));
const forbiddenImport = [
  /(?:^|[\\/])demo-terminal(?:\.|[\\/])/i,
  /(?:^|[\\/])merchant-terminal-mobile-v2(?:\.|[\\/])/i,
  /(?:^|[\\/])SmartTransitions(?:\.|[\\/])/i,
  /@tanstack[\\/]react-query/i, /sseClient/i, /(?:^|[\\/])native(?:\.|[\\/])/i,
  /(?:^|[\\/])checkout(?:\.|[\\/])/i,
];
const forbiddenRuntime = [
  /(?:^|["'`])\/api\/(?!landing-demo)/,
  /localStorage\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*["'`]authToken/i,
  /(?:window\.|document\.)open\s*\(/, /navigator\.clipboard/,
  /(?:windcave|stripe|googlepay|applepay|tap.to.pay)/i,
];
const errors = [];
for (const file of files) {
  const lines = readFileSync(resolve(featureRoot, file), "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/^\s*import\s/.test(line) && forbiddenImport.some((p) => p.test(line))) errors.push(`${file}:${index + 1}: forbidden production import`);
    if (forbiddenRuntime.some((p) => p.test(line))) errors.push(`${file}:${index + 1}: forbidden external/auth/payment side effect`);
  });
}
if (errors.length) {
  console.error("landing demo boundary gate failed:"); errors.forEach((e) => console.error(`  ${e}`)); process.exitCode = 1;
} else console.log(`landing demo boundary gate passed (${files.length} landing feature files inspected)`);
