/**
 * Scroll-contract tests for the landing phone demo.
 *
 * The plan's §3.2 scroll requirements are behavioural promises that are easy to
 * break by accident and expensive to check by hand in a browser. Because the
 * controller is pure arithmetic over progress, they can be asserted directly.
 */
import {
  SCENE_ORDER,
  ZONE_COUNT,
  createSceneController,
  finalState,
  resolveState,
  sameState,
  sceneAtProgress,
  stepAtProgress,
} from '@/pages/landing-phone/reducer';
import { SCENES, stepsFor } from '@/pages/landing-phone/scenes/registry';
import { INDUSTRY_SCENE, SCENE_STEPS } from '@/pages/landing-phone/manifest';
import { INDUSTRY_PHONE } from '@/pages/DeferredLandingPhone';
import type { LandingPhoneScene, LandingPhoneState } from '@/pages/landing-phone/types';

const key = (s: LandingPhoneState) => `${s.scene}#${s.step}`;

/** Every state the story passes through, scanning finely enough to miss nothing. */
function scan(from: number, to: number, samples = 20_000): LandingPhoneState[] {
  const out: LandingPhoneState[] = [];
  for (let i = 0; i <= samples; i++) {
    const p = from + ((to - from) * i) / samples;
    const s = resolveState(p, stepsFor);
    if (out.length === 0 || !sameState(out[out.length - 1], s)) out.push(s);
  }
  return out;
}

describe('scene registry', () => {
  it('registers exactly one scene per story zone', () => {
    expect(SCENE_ORDER).toHaveLength(ZONE_COUNT);
    expect(Object.keys(SCENES).sort()).toEqual([...SCENE_ORDER].sort());
  });

  /**
   * manifest.ts duplicates the step counts so landing-page.tsx can size the
   * Industries phone without importing the registry (which would drag all eight
   * scenes into the main chunk). Its docblock has always claimed this test
   * guards the duplication; until now it did not, and the two silently drifted.
   *
   * Drift is not cosmetic: the Industries phone rests on `SCENE_STEPS - 1`, so a
   * stale count leaves a tab sitting on a half-finished workflow.
   */
  it('keeps the landing page manifest in step with the registry', () => {
    for (const id of SCENE_ORDER) {
      expect(SCENE_STEPS[id]).toBe(SCENES[id].steps);
    }
    expect(Object.keys(SCENE_STEPS).sort()).toEqual([...SCENE_ORDER].sort());
  });

  it('points every Industries tab at a registered scene', () => {
    for (const scene of Object.values(INDUSTRY_SCENE)) {
      expect(SCENES[scene]).toBeDefined();
    }
  });

  it('keeps the eager Industries metadata in step with the lazy registry', () => {
    for (const { scene, steps } of Object.values(INDUSTRY_PHONE)) {
      expect(SCENES[scene]).toBeDefined();
      expect(steps).toBe(SCENES[scene].steps);
    }
  });

  it('gives every scene at least one milestone and a matching id', () => {
    for (const id of SCENE_ORDER) {
      const def = SCENES[id];
      expect(def.id).toBe(id);
      expect(def.steps).toBeGreaterThan(0);
      expect(def.label.length).toBeGreaterThan(0);
    }
  });
});

describe('forward scrolling', () => {
  it('visits every scene in story order', () => {
    const scenes = scan(0, 1).map((s) => s.scene);
    const firstSeen: LandingPhoneScene[] = [];
    for (const s of scenes) if (!firstSeen.includes(s)) firstSeen.push(s);
    expect(firstSeen).toEqual([...SCENE_ORDER]);
  });

  it('visits every milestone of every scene, in order and without skipping', () => {
    const seen = scan(0, 1).map(key);
    const expected: string[] = [];
    for (const id of SCENE_ORDER) {
      for (let step = 0; step < SCENES[id].steps; step++) expected.push(`${id}#${step}`);
    }
    expect(seen).toEqual(expected);
  });
});

describe('backward scrolling', () => {
  it('rewinds through exactly the forward states, reversed', () => {
    const forward = scan(0, 1).map(key);
    const backward = scan(1, 0).map(key);
    expect(backward).toEqual([...forward].reverse());
  });
});

describe('zone entry and exit', () => {
  it('starts each zone at its own step 0', () => {
    for (let zone = 0; zone < ZONE_COUNT; zone++) {
      const state = resolveState(zone / ZONE_COUNT, stepsFor);
      expect(state.scene).toBe(SCENE_ORDER[zone]);
      expect(state.step).toBe(0);
    }
  });

  it('finishes each zone on its last milestone', () => {
    for (let zone = 0; zone < ZONE_COUNT; zone++) {
      const endOfZone = (zone + 1) / ZONE_COUNT - 1e-9;
      const state = resolveState(endOfZone, stepsFor);
      expect(state.scene).toBe(SCENE_ORDER[zone]);
      expect(state.step).toBe(SCENES[state.scene].steps - 1);
    }
  });
});

describe('jumping and clamping', () => {
  it('maps any progress to exactly one state', () => {
    for (const p of [0, 0.137, 0.5, 0.625, 0.99, 1]) {
      expect(resolveState(p, stepsFor)).toEqual(resolveState(p, stepsFor));
    }
  });

  it('clamps out-of-range and non-finite progress instead of throwing', () => {
    expect(resolveState(-4, stepsFor)).toEqual({ scene: SCENE_ORDER[0], step: 0 });
    expect(resolveState(Number.NaN, stepsFor)).toEqual({ scene: SCENE_ORDER[0], step: 0 });
    const last = SCENE_ORDER[ZONE_COUNT - 1];
    expect(resolveState(9, stepsFor)).toEqual({ scene: last, step: SCENES[last].steps - 1 });
  });

  it('never returns a step outside its scene', () => {
    for (let i = 0; i <= 5000; i++) {
      const s = resolveState(i / 5000, stepsFor);
      expect(s.step).toBeGreaterThanOrEqual(0);
      expect(s.step).toBeLessThan(SCENES[s.scene].steps);
    }
  });
});

describe('reduced motion and Save-Data', () => {
  it('lands on the finished frame of a scene rather than its build-up', () => {
    for (const id of SCENE_ORDER) {
      expect(finalState(id, stepsFor)).toEqual({ scene: id, step: SCENES[id].steps - 1 });
    }
  });
});

describe('controller', () => {
  it('reports only genuine milestone changes', () => {
    const c = createSceneController(stepsFor);
    const first = c.update(0.0001);
    expect(first).toBeNull(); // already at overview#0

    let emissions = 0;
    for (let i = 0; i <= 4000; i++) if (c.update(i / 4000)) emissions++;

    const distinct = scan(0, 1).length;
    expect(emissions).toBe(distinct - 1); // every change once, no repeats
  });

  it('accepts direct selection for the Industries tabs', () => {
    const c = createSceneController(stepsFor);
    expect(c.set({ scene: 'retail-sale', step: 2 })).toEqual({ scene: 'retail-sale', step: 2 });
    expect(c.set({ scene: 'retail-sale', step: 2 })).toBeNull();
    expect(c.state).toEqual({ scene: 'retail-sale', step: 2 });
  });
});

describe('determinism', () => {
  it('does not depend on the clock', () => {
    const before = resolveState(0.42, stepsFor);
    const realNow = Date.now;
    try {
      Date.now = () => 0;
      expect(resolveState(0.42, stepsFor)).toEqual(before);
      Date.now = () => 4_102_444_800_000; // year 2100
      expect(resolveState(0.42, stepsFor)).toEqual(before);
    } finally {
      Date.now = realNow;
    }
  });
});

describe('primitives of the mapping', () => {
  it('splits a zone into equal milestones', () => {
    expect(stepAtProgress(4, 0)).toBe(0);
    expect(stepAtProgress(4, 0.24)).toBe(0);
    expect(stepAtProgress(4, 0.26)).toBe(1);
    expect(stepAtProgress(4, 1)).toBe(3);
    expect(stepAtProgress(1, 0.9)).toBe(0);
  });

  it('reports local progress within the zone', () => {
    const { scene, local } = sceneAtProgress(1 / ZONE_COUNT + 0.5 / ZONE_COUNT);
    expect(scene).toBe(SCENE_ORDER[1]);
    expect(local).toBeCloseTo(0.5, 5);
  });
});
