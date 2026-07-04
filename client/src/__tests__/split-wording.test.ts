import fs from "fs";
import path from "path";

// These files are customer-facing or shared across verticals, so their split
// copy must never reintroduce property-specific "flatmate" language.
const files = [
  "client/src/pages/checkout.tsx",
  "client/src/pages/property/property-terminal.tsx",
];

describe("split wording is vertical-neutral", () => {
  test.each(files)("%s contains no 'flatmate' references", (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(src).not.toMatch(/flatmate/i);
  });
});
