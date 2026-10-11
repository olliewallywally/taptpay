import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { inertAttributeValue, inertWhen } from "./inert-when";

describe("inertWhen", () => {
  it("uses the value each React major renders as a present inert attribute", () => {
    // React 18 drops a boolean `inert` (an unknown attribute) but keeps "";
    // React 19 types `inert` as a boolean and reads "" as false.
    expect(inertAttributeValue("18.3.1")).toBe("");
    expect(inertAttributeValue("19.0.0")).toBe(true);
    expect(inertAttributeValue("20.1.0")).toBe(true);
  });

  it("renders inert only while collapsed with the installed React", () => {
    const { container, rerender } = render(<div {...inertWhen(true)} />);
    expect(container.firstElementChild).toHaveAttribute("inert");
    rerender(<div {...inertWhen(false)} />);
    expect(container.firstElementChild).not.toHaveAttribute("inert");
  });

  it("is the only place React markup spells the inert attribute", () => {
    const root = path.resolve(__dirname, "../..");
    const helper = path.join(__dirname, "inert-when.ts");
    const sources = (directory: string): string[] =>
      fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(absolute);
        return /\.(tsx|jsx|ts)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) ? [absolute] : [];
      });
    // A JSX `inert={...}` or an `inert: ''` props object breaks silently on a React upgrade.
    const offenders = sources(root)
      .filter((file) => file !== helper)
      .filter((file) => /\binert\s*=\s*\{|\binert\s*:\s*(['"])\1/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });
});
