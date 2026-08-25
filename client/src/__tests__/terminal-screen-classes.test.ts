import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/* The §7.4 screen-class guard for phase 2b of
 * docs/PLAN-2026-08-17-mobile-responsive-ui.md (contract in §6.6.1).
 *
 * WHY. Two plans lay out the same 31 `.tp-screen` elements. This plan grids the
 * home screens (§6.4); the companion grids the feature screens and reserves the
 * dock (SPEC-2026-08-20). v2 of each plan wrote its grid against bare
 * `.tp-screen` — so whichever landed second would have applied its topology to
 * the other's screens, and to `DockPlaceholder`, which has neither shape. The
 * contradiction was invisible because each plan only ever read its own half.
 *
 * The fix is a class per topology and an ownership rule, and this file is what
 * makes both enforceable:
 *
 *   `.tp-home`     hero + chrome gutter + stack, three rows   — this plan, §6.4
 *   `.tp-feature`  hero + panel, panel takes the remainder    — companion, §3.1
 *   `.tp-plain`    one region, full bleed, no hero            — neither grids it
 *
 * COUNTS, NOT COMPONENTS. Five components return a `.tp-screen` from two
 * different branches (property `SendRentLink`, `ChargeBill`, `MarkExternal`;
 * trades `QuickInvoice`, `MarkExternal`). Class one branch and miss the other
 * and the screen is correct until a merchant reaches the state that renders the
 * other — so the assertion is a count per file, which a half-classified
 * component cannot satisfy (§6.6.1 trap 1).
 */

const SRC = join(__dirname, "..");

/** §6.6.1's inventory. A change here is a change to the contract. */
const SCREEN_FILES = [
  {
    file: "features/terminal/retail/RetailTerminalViewCore.jsx",
    total: 10,
    /* `PendingTerminal` is a second home, not a feature screen (trap 3), and
       `DockPlaceholder` is the only `.tp-plain` in the app. */
    home: 2,
    feature: 7,
    plain: 1,
  },
  {
    file: "features/terminal/property/PropertyTerminalView.tsx",
    total: 12,
    home: 1,
    feature: 11,
    plain: 0,
  },
  {
    file: "features/terminal/trades/TradesTerminalView.tsx",
    total: 9,
    home: 1,
    feature: 8,
    plain: 0,
  },
];

const CLASSES = ["tp-home", "tp-feature", "tp-plain"] as const;
const hasClass = (value: string, className: string): boolean =>
  value.split(/\s+/).includes(className);

/* The three vertical sheets each open with the same authored base rule. It
 * predates both plans, and phases 6 and 8 are what replace it — until then it
 * is frozen exactly as written, so the ownership rule below forbids ADDING to
 * bare `.tp-screen` without failing on what is already there (§6.6.1). */
const FROZEN_BASE = "position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden";

/* What any rule on a bare `.tp-screen` may declare, per the ownership rule:
 * "only `min-height: 0` and scroll containment, agreed across both plans". */
const ALLOWED_ON_BARE = new Set([
  "min-height",
  "overflow",
  "overflow-x",
  "overflow-y",
  "overscroll-behavior",
]);

function walk(dir: string, test: RegExp): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...walk(full, test));
    } else if (test.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every `class="…"` / `className="…"` value in a source file, including the
 *  template-literal form the terminal uses for conditional classes. */
function classAttributes(source: string): string[] {
  const out: string[] = [];
  const re = /\bclassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\})/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/** Flat `selector { declarations }` pairs, descending into `@supports`/`@media`
 *  and skipping `@keyframes`, whose inner blocks are offsets, not selectors. */
function rulesOf(css: string): { selector: string; body: string }[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selector: string; body: string }[] = [];

  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open === -1) break;

    const prelude = src.slice(i, open).trim();

    // Find this block's matching close brace.
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);

    if (/^@keyframes\b/.test(prelude)) {
      // global names, no selectors inside
    } else if (/^@/.test(prelude)) {
      out.push(...rulesOf(body)); // @supports / @media wrap real rules
    } else if (prelude) {
      for (const selector of prelude.split(",").map((s) => s.trim()).filter(Boolean)) {
        out.push({ selector, body });
      }
    }

    i = j;
  }
  return out;
}

const declarationsOf = (body: string): { prop: string; raw: string }[] =>
  body
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => !d.includes("{"))
    .map((d) => ({ prop: d.slice(0, d.indexOf(":")).trim().toLowerCase(), raw: d }));

/** The rightmost compound of a selector — what the rule actually matches. */
const subject = (selector: string): string =>
  selector.trim().split(/\s+|>|\+|~/).filter(Boolean).pop() ?? "";

const normalise = (body: string): string =>
  declarationsOf(body)
    .map(({ raw }) => raw.replace(/\s+/g, "").toLowerCase())
    .join(";");

describe("terminal screen classes (§6.6.1)", () => {
  it("gives every `.tp-screen` exactly one topology class, counted per file", () => {
    for (const spec of SCREEN_FILES) {
      const source = readFileSync(join(SRC, spec.file), "utf8");
      const screens = classAttributes(source).filter((value) =>
        /\btp-screen\b/.test(value),
      );

      const counts = { "tp-home": 0, "tp-feature": 0, "tp-plain": 0 };
      const malformed: string[] = [];

      for (const value of screens) {
        const found = CLASSES.filter((c) => hasClass(value, c));
        if (found.length !== 1) malformed.push(`${found.length} classes: ${value.trim()}`);
        else counts[found[0]]++;
      }

      expect({ file: spec.file, malformed }).toEqual({ file: spec.file, malformed: [] });
      expect({ file: spec.file, total: screens.length }).toEqual({
        file: spec.file,
        total: spec.total,
      });
      expect({ file: spec.file, ...counts }).toEqual({
        file: spec.file,
        "tp-home": spec.home,
        "tp-feature": spec.feature,
        "tp-plain": spec.plain,
      });
    }
  });

  it("uses the three topology classes only on a `.tp-screen`", () => {
    const strays: string[] = [];

    for (const file of walk(SRC, /\.(?:tsx|jsx)$/)) {
      if (file.includes("__tests__")) continue;
      for (const value of classAttributes(readFileSync(file, "utf8"))) {
        const carries = CLASSES.some((c) => hasClass(value, c));
        if (carries && !hasClass(value, "tp-screen")) {
          strays.push(`${file.slice(SRC.length + 1)}: ${value.trim()}`);
        }
      }
    }

    expect(strays).toEqual([]);
  });

  it("declares no new layout on a bare `.tp-screen` selector", () => {
    /* The rule that keeps the two plans from colliding — and the only guard
       that would have caught the contradiction between them. A selector whose
       subject is `.tp-screen` with no topology class matches all 31 screens, so
       it may carry nothing but the agreed shared floor. */
    const offenders: string[] = [];

    const sheets: { name: string; css: string }[] = [];
    for (const file of walk(SRC, /\.css$/)) {
      sheets.push({ name: file.slice(SRC.length + 1), css: readFileSync(file, "utf8") });
    }
    for (const file of walk(SRC, /\.(?:tsx|jsx|ts|js)$/)) {
      if (file.includes("__tests__")) continue;
      const source = readFileSync(file, "utf8");
      if (!/<style[\s>]/.test(source)) continue;
      for (const literal of source.match(/`[^`]*`/g) ?? []) {
        if (!/\.tp-screen/.test(literal)) continue;
        sheets.push({ name: file.slice(SRC.length + 1), css: literal.slice(1, -1) });
      }
    }

    for (const sheet of sheets) {
      for (const { selector, body } of rulesOf(sheet.css)) {
        const s = subject(selector);
        if (!/(^|\.)tp-screen\b/.test(s)) continue;
        // Carries a topology class (or an attribute qualifying one) — owned.
        if (CLASSES.some((c) => s.includes(`.${c}`))) continue;

        if (normalise(body) === FROZEN_BASE) continue; // the frozen authored base

        for (const { prop, raw } of declarationsOf(body)) {
          if (!ALLOWED_ON_BARE.has(prop)) {
            offenders.push(`${sheet.name}: ${selector} { ${raw} }`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
