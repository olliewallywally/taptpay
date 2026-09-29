import fs from "fs";
import path from "path";
import { MATRIX_CALLER_MEANING, ROUTE_MATRIX, describeMatrixRow } from "../route-matrix";

/**
 * R1-T3's check, "Matrix recorded in the inventory": the inventory table (R1-T2-route-inventory-table.md,
 * written by scripts/generate-route-policy.ts) shows, for every route, who it serves and what each
 * refused caller gets (the P2.2 status). The table is the reviewed record; this test fails when the
 * checked-in table and the matrix disagree, so a change to a route's review (and so its matrix row)
 * arrives with the regenerated table, as a new route arrives with its policy entry.
 */

const TABLE_FILE = path.join(process.cwd(), "docs", "evidence", "remediation-v2-2", "r1", "R1-T2-route-inventory-table.md");
const TABLE = fs.readFileSync(TABLE_FILE, "utf8");

/** A markdown section's text, from its heading to the next heading of the same level. */
function section(heading: string): string {
  const start = TABLE.indexOf(`\n## ${heading}\n`);
  if (start === -1) return "";
  const end = TABLE.indexOf("\n## ", start + heading.length + 5);
  return TABLE.slice(start, end === -1 ? undefined : end);
}

/** The Routes table's rows: | Method | `Path` | Line | Principal | Markers | Served | Refused (P2.2) |. */
function routeRows() {
  return section("Routes").split("\n").filter((line) => /^\| [A-Z]+ \| `/.test(line)).map((line) => {
    const cells = line.slice(2, -2).split(" | ");
    return { key: `${cells[0]} ${cells[1].replace(/`/g, "")}`, served: cells[5], refused: cells[6] };
  });
}

describe("R1-T3 — the matrix is recorded in the inventory table", () => {
  it("has a row for every route of the matrix, and for no other", () => {
    expect(routeRows().map((row) => row.key).sort()).toEqual(Object.keys(ROUTE_MATRIX).sort());
  });

  it("shows each route's callers served and refused as the matrix answers them", () => {
    const shown = Object.fromEntries(routeRows().map((row) => [row.key, { served: row.served, refused: row.refused }]));
    const answered = Object.fromEntries(Object.entries(ROUTE_MATRIX).map(([key, row]) => [key, describeMatrixRow(row)]));
    expect(shown).toEqual(answered);
  });

  it("says what each caller is", () => {
    // Whole lines: a meaning cut short must not pass as a prefix of the one written.
    const listed = section("The role and tenant matrix (R1-T3)").split("\n").filter((line) => line.startsWith("- `"));
    expect(listed).toEqual(Object.entries(MATRIX_CALLER_MEANING).map(([caller, meaning]) => `- \`${caller}\`: ${meaning}`));
  });
});
