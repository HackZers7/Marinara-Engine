// ──────────────────────────────────────────────
// Pure cadence math for NoodleR per-creator automatic posting.
// Intensity 1/3/6 = about that many automatic posts per day on average (±25% jitter).
// ──────────────────────────────────────────────
import type { NoodleAutoPostingIntensity } from "@marinara-engine/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

// ponytail: fixed ±25% uniform jitter around the base interval. Widen or make it
// per-intensity only if real usage shows bunching; a knob now would be dead config.
const JITTER = 0.25;

/** Base gap between automatic posts for an intensity (24h / posts-per-day). */
export function autoPostIntervalMs(intensity: NoodleAutoPostingIntensity): number {
  return DAY_MS / intensity;
}

/**
 * Next automatic run = now + base interval with ±25% jitter. The lower jitter bound
 * (base * 0.75) doubles as the anti-burst floor: a reschedule/retry can never land a
 * run sooner than that, so a claim-before-generate loop cannot hot-post. Used for both
 * the seeded first run and each subsequent advance. `rng` defaults to Math.random.
 */
export function nextAutoPostRunAt(
  intensity: NoodleAutoPostingIntensity,
  now: Date = new Date(),
  rng: () => number = Math.random,
): string {
  const base = autoPostIntervalMs(intensity);
  const jittered = base * (1 + (rng() * 2 - 1) * JITTER);
  const spaced = Math.max(base * (1 - JITTER), jittered);
  return new Date(now.getTime() + spaced).toISOString();
}
