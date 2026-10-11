import { createHash } from 'node:crypto';

// Read-only observations from navigation onward, including short entrances.
// Persist timing and property names only; never keyframe values or DOM text.
export function installMotionProbe() {
  const seen = new WeakSet(), records = [];
  window.__motionAudit = records;
  const sample = () => {
    for (const animation of document.getAnimations()) {
      if (seen.has(animation) || !animation.effect) continue;
      seen.add(animation);
      const timing = animation.effect.getTiming();
      const properties = [...new Set(animation.effect.getKeyframes().flatMap(frame => Object.keys(frame)))].filter(key => !['offset', 'computedOffset', 'easing', 'composite'].includes(key));
      const el = animation.effect.target;
      records.push({ duration: typeof timing.duration === 'number' ? timing.duration : null, delay: timing.delay, iterations: Number.isFinite(timing.iterations) ? timing.iterations : 'infinite', properties, tag: el?.tagName?.toLowerCase() ?? null, classes: el?.classList ? [...el.classList] : [] });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}
export const MOTION_PROBE_SHA256 = createHash('sha256').update(installMotionProbe.toString()).digest('hex');
export async function settledMotionEnvironment(page) {
  const sample = () => ({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    running: document.getAnimations().filter(a => a.playState === 'running').length });
  // A style/layout read can start the preference's 0.01ms transitions. Observe
  // an atomic settled sample; never cancel animations or change their timing.
  try {
    const result = await page.waitForFunction(() => {
      const environment = { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        running: document.getAnimations().filter(a => a.playState === 'running').length };
      return environment.running === 0 ? environment : false;
    }, undefined, { polling: 'raf', timeout: 1000 });
    try { return await result.jsonValue(); } finally { await result.dispose(); }
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    return page.evaluate(sample);
  }
}
export async function auditMotion(page) {
  const records = await page.evaluate(() => window.__motionAudit ?? []);
  const motions = records.filter(record => record.properties.some(key => /transform|translate|rotate|scale|width|height|left|right|top|bottom|clipPath/i.test(key)));
  const faults = motions.filter(record => record.iterations === 'infinite' || record.duration > 150 || record.delay > 150).map((_, i) => `motion ${i + 1} exceeds reduced-motion timing`);
  return { probeSHA256: MOTION_PROBE_SHA256, records, faults };
}
