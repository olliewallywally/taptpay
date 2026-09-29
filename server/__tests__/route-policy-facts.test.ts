import { currentRouteFacts, expandFacts, type RouteFacts } from "../route-facts";
import { ROUTE_POLICY } from "../route-policy";

/**
 * R1-T2 (C10): the facts server/route-policy.ts records for each route are
 * what the route's handler does now. Change what a route checks, parses,
 * calls or answers and this fails until the policy is regenerated, so the
 * change shows in the policy's diff, where a reviewer sees it:
 *
 *   node --import tsx scripts/generate-route-policy.ts
 */
describe("R1-T2 — every route's recorded facts are what its handler does (C10)", () => {
  const current = currentRouteFacts();

  it("has facts for exactly the routes in the policy", () => {
    expect([...current.keys()].sort()).toEqual(Object.keys(ROUTE_POLICY).sort());
  });

  it("records each route's facts as they are now", () => {
    const stale: string[] = [];
    for (const [key, entry] of Object.entries(ROUTE_POLICY)) {
      const now = current.get(key);
      if (!now) continue; // reported by the test above
      const recorded = expandFacts(entry.facts);
      for (const field of Object.keys(now) as Array<keyof RouteFacts>) {
        const was = JSON.stringify(recorded[field]);
        const is = JSON.stringify(now[field]);
        if (was !== is) stale.push(`${key} — ${field}: recorded ${was}, now ${is}`);
      }
    }
    // Regenerate with: node --import tsx scripts/generate-route-policy.ts
    expect(stale).toEqual([]);
  });
});
