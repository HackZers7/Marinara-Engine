import assert from "node:assert/strict";
import {
  noodleAccountSchedulerPatchSchema,
  noodleAutoPostingSettingsSchema,
} from "../../packages/shared/src/schemas/noodle.schema.js";
import {
  autoPostIntervalMs,
  nextAutoPostRunAt,
} from "../../packages/server/src/services/noodle/noodle-autopost-cadence.js";
import { normalizeScheduler } from "../../packages/server/src/services/storage/noodle.storage.js";

const now = new Date("2026-07-23T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

// Interval = 24h / posts-per-day.
assert.equal(autoPostIntervalMs(1), DAY);
assert.equal(autoPostIntervalMs(3), DAY / 3);
assert.equal(autoPostIntervalMs(6), DAY / 6);

// Future-first-run + ±25% jitter bounds, for every intensity and jitter extreme.
for (const intensity of [1, 3, 6] as const) {
  const base = autoPostIntervalMs(intensity);
  for (const rng of [() => 0, () => 0.5, () => 1, Math.random]) {
    const t = Date.parse(nextAutoPostRunAt(intensity, now, rng));
    assert.ok(t > now.getTime(), "next run is in the future");
    // Anti-burst floor: never sooner than base*0.75; never later than base*1.25.
    assert.ok(t - now.getTime() >= base * 0.75 - 1, "respects anti-burst floor");
    assert.ok(t - now.getTime() <= base * 1.25 + 1, "respects jitter ceiling");
  }
}

// Monotonic advance: advancing from a claimed run lands strictly later.
const first = nextAutoPostRunAt(3, now, () => 0.5);
const second = nextAutoPostRunAt(3, new Date(first), () => 0.5);
assert.ok(Date.parse(second) > Date.parse(first));

// Stored settings normalize to disabled/intensity-1/null defaults.
assert.deepEqual(noodleAutoPostingSettingsSchema.parse({}), {
  enabled: false,
  intensity: 1,
  imagesEnabled: false,
  nextRunAt: null,
});
// Storage normalization: omitted autoPosting falls back to the disabled defaults.
const DEFAULTS = { enabled: false, intensity: 1, imagesEnabled: false, nextRunAt: null } as const;
assert.deepEqual(normalizeScheduler({}).autoPosting, DEFAULTS);
assert.deepEqual(normalizeScheduler({ scheduler: {} }).autoPosting, DEFAULTS);
// Malformed values fall back per field without discarding the other valid fields.
assert.deepEqual(
  normalizeScheduler({
    autoPosting: { enabled: true, intensity: 2, imagesEnabled: true, nextRunAt: "not-a-date" },
  }).autoPosting,
  { enabled: true, intensity: 1, imagesEnabled: true, nextRunAt: null },
);
// A valid persisted run is preserved.
assert.deepEqual(
  normalizeScheduler({
    autoPosting: {
      enabled: true,
      intensity: 6,
      imagesEnabled: true,
      nextRunAt: now.toISOString(),
    },
  }).autoPosting,
  { enabled: true, intensity: 6, imagesEnabled: true, nextRunAt: now.toISOString() },
);
// Client patch cannot carry the server-owned nextRunAt.
assert.throws(() => noodleAccountSchedulerPatchSchema.parse({ autoPosting: { nextRunAt: now.toISOString() } }));
assert.ok(noodleAccountSchedulerPatchSchema.parse({ autoPosting: { enabled: true, intensity: 6 } }));
// Only 1/3/6 intensities are valid.
assert.throws(() => noodleAutoPostingSettingsSchema.parse({ intensity: 2 }));

process.stdout.write("Noodle autopost regression passed.\n");
