/*
 * R1-T8. React requires every hook to run in the same order on every render.
 * Seven merchant pages returned early — "no merchant, redirect" — before most of
 * their hooks, so when the session ended while one was open (logout, a 401
 * clearing the token) its next render ran fewer hooks and React threw
 * "Rendered fewer hooks than expected". The lint rule that catches this is
 * configured, but lint is not a gate here (plan §15.2), so it never stopped a
 * violation. This test makes that one rule a gate, over the whole client.
 *
 * Uses ESLint's Linter with an inline config: no config file, no dynamic import.
 */
import fs from "node:fs";
import path from "node:path";
import v8 from "node:v8";

// The client project runs in jsdom (its shared setup needs `window`), which does
// not expose Node's structuredClone; ESLint clones rule options with it.
globalThis.structuredClone ??= <T>(value: T): T => v8.deserialize(v8.serialize(value));

const { Linter } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const reactHooks = require("eslint-plugin-react-hooks");

const clientSource = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(full);
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

it("calls every React hook unconditionally, in the same order on every render", () => {
  const linter = new Linter({ configType: "flat", cwd: clientSource });
  const config = [{
    files: ["**/*.ts", "**/*.tsx"],
    // Inline comments are ignored: no file can switch this rule off for itself.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error" },
  }];
  const files = sourceFiles(clientSource);
  expect(files.length).toBeGreaterThan(100); // the walk really reached the client

  const findings: string[] = [];
  for (const file of files) {
    for (const message of linter.verify(fs.readFileSync(file, "utf8"), config, file)) {
      // This rule, or a file that fails to parse (which would hide a violation).
      // Not the notices that ignored inline comments produce.
      if (message.ruleId !== "react-hooks/rules-of-hooks" && !message.fatal) continue;
      findings.push(`${path.relative(clientSource, file)}:${message.line} ${message.message}`);
    }
  }
  expect(findings).toEqual([]);
}, 180_000);
