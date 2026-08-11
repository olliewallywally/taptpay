#!/usr/bin/env node
/** Static safety gate for the isolated landing-demo boundary and shared views. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const files = [];

const addFile = (path) => {
  const absolute = resolve(root, path);
  if (existsSync(absolute)) files.push(absolute);
};

const addTree = (path) => {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory()) addTree(relative(root, child));
    else if (
      sourceExtensions.has(extname(entry.name)) &&
      !/\.(?:test|spec)\.[jt]sx?$/.test(entry.name)
    ) files.push(child);
  }
};

addTree("client/src/landing-demo");
addFile("client/src/pages/landing-phone/LandingDemoFrame.tsx");
addFile("client/src/pages/landing-phone/LandingPhoneViewport.tsx");
addFile("client/src/features/terminal/retail/RetailTerminalView.tsx");
addFile("client/src/features/terminal/retail/RetailTerminalViewCore.jsx");
addTree("client/src/features/terminal/property");
addTree("client/src/features/terminal/trades");
addTree("client/src/features/checkout");
addTree("client/src/features/dashboard");
addTree("client/src/features/navigation");

const forbiddenClientImport = [
  /(?:^|[\/])demo-terminal(?:\.|[\/])/i,
  /(?:^|[\/])merchant-terminal-mobile-v2(?:\.|[\/])/i,
  /(?:^|[\/])SmartTransitions(?:\.|[\/])/i,
  /(?:^|[\/])App(?:\.|[\/])/,
  /@tanstack[\/]react-query/i,
  /sse-client|sseClient/i,
  /(?:^|[\/])auth(?:\.|[\/])/i,
  /(?:^|[\/])native(?:\.|[\/])/i,
  /(?:^|[\/])qr-code-display(?:\.|[\/])/i,
  /(?:^|[\/])checkout(?:\.|[\/])/i,
  /(?:^|[\/])split-payment(?:\.|[\/])/i,
  /wouter|framer-motion|@react-pdf/i,
];
const forbiddenClientRuntime = [
  /(?:^|["'])\/api\/(?!landing-demo(?:\/|["']))/,
  /\b(?:localStorage|sessionStorage)\b/,
  /document\s*\.\s*cookie/,
  /window\s*\.\s*parent\s*\.\s*(?:document|localStorage|sessionStorage|location)/,
  /(?:window\.|document\.)open\s*\(/,
  /navigator\s*\.\s*clipboard/,
  /\b(?:PaymentRequest|ApplePaySession|WindcaveSession|GooglePayClient|startTapToPay|canTapToPay)\b/,
];

const errors = [];
for (const absolute of files) {
  const file = relative(root, absolute);
  const lines = readFileSync(absolute, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/^\s*import\s/.test(line) && forbiddenClientImport.some((pattern) => pattern.test(line))) {
      errors.push(file + ":" + (index + 1) + ": forbidden production import");
    }
    if (forbiddenClientRuntime.some((pattern) => pattern.test(line))) {
      errors.push(file + ":" + (index + 1) + ": forbidden auth/network/provider/storage side effect");
    }
  });
}

const serverFiles = [
  "server/landing-demo-service.ts",
  "server/landing-demo-routes.ts",
  "server/landing-demo-schema.ts",
].filter((file) => existsSync(resolve(root, file)));
const forbiddenServerImport =
  /(?:database|storage|auth|windcave|payment-attempt|subscription|sendgrid|nodemailer|whatsapp|web-push|webhook|pdf|upload|receipt|sse)/i;
for (const file of serverFiles) {
  const lines = readFileSync(resolve(root, file), "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/^\s*import\s/.test(line) && forbiddenServerImport.test(line)) {
      errors.push(file + ":" + (index + 1) + ": forbidden production service import");
    }
  });
}

if (files.length < 3 || serverFiles.length < 3) {
  errors.push("boundary inventory incomplete: " + files.length + " client files, " + serverFiles.length + " server files");
}

if (errors.length) {
  console.error("landing demo boundary gate failed:");
  errors.forEach((error) => console.error("  " + error));
  process.exitCode = 1;
} else {
  console.log("landing demo boundary gate passed (" + files.length + " client files, " + serverFiles.length + " server files)");
}
