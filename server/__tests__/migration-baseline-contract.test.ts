import {
  BASELINE_EFFECT_REQUIREMENTS,
  FIND_MISSING_BASELINE_EFFECTS_SQL,
  findMissingBaselineEffects,
} from "../migration-baseline-contract";
import { defaultMigrationsDir, listMigrationFiles } from "../migrate";

describe("migration baseline effect contract", () => {
  test("every checked-in migration has an explicit observable contract", () => {
    const covered = new Set(BASELINE_EFFECT_REQUIREMENTS.map((item) => item.migration));
    expect([...covered].sort()).toEqual(listMigrationFiles(defaultMigrationsDir()).sort());
  });

  test("unknown migrations can never be silently baselined", async () => {
    const query = jest.fn();
    await expect(
      findMissingBaselineEffects({ query } as any, ["0099_unknown.sql"]),
    ).resolves.toEqual(["0099_unknown.sql: no baseline verification contract"]);
    expect(query).not.toHaveBeenCalled();
  });

  test("reports each database effect that is absent", async () => {
    const query = jest.fn(async () => ({
      rows: [{
        migration: "0001_add_email_verified.sql",
        kind: "column",
        relationName: "merchants",
        objectName: "email_verified",
      }],
    }));

    await expect(
      findMissingBaselineEffects({ query } as any, ["0001_add_email_verified.sql"]),
    ).resolves.toEqual([
      "0001_add_email_verified.sql: missing column email_verified",
    ]);
    expect(query).toHaveBeenCalledWith(
      FIND_MISSING_BASELINE_EFFECTS_SQL,
      [expect.any(String)],
    );
  });
});
