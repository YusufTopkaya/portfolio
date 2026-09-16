/**
 * TODAY'S TRACK difficulty card, for the title screen.
 *
 * The seeded generator deals the same layout to everyone on the same UTC
 * day, so a second generator instance replayed from the same seed yields
 * the exact road the run will drive. The track is endless, so the card
 * rates a fixed opening window (first ~3 km) on three axes:
 *
 *   CURVES — mean |curve| across the window (how twisty the road is)
 *   HILLS  — total climb per window (how much the road bucks; hills also
 *            hide cans behind crests)
 *   FUEL   — mean |curve| at the can spots (cans parked on hard bends
 *            cost a line change under fuel pressure)
 *
 * Each axis maps to 1-5 stars against thresholds derived from the
 * generator's design mix (45% curve / 30% hills / 25% breather sections);
 * the verdict stamp is the composite. One segment is 200 position-units;
 * flat out is MAX_SPEED units/s = 180 km/h = 50 m/s, so a segment is
 * ~0.83 m and 3 km spans ~3600 segments — beyond the ring's 2048-slot
 * capacity, so the read loop extends the generator in chunks that stay
 * safely inside the ring window (extend() can overshoot by ~540).
 */

import { ENGINE_CONSTANTS } from "./engine";
import { createTrackGenerator } from "./track";

const { SEGMENT_LENGTH, MAX_SPEED } = ENGINE_CONSTANTS;
const METERS_PER_UNIT = 50 / MAX_SPEED; // 180 km/h at MAX_SPEED units/s

export interface TrackStats {
  curves: number; // 1-5 stars
  hills: number; // 1-5 stars
  fuel: number; // 1-5 stars
  verdict: "CHILL" | "BALANCED" | "TWISTY" | "HILLY" | "CRUEL";
}

const stars = (v: number, t: [number, number, number, number]) =>
  v < t[0] ? 1 : v < t[1] ? 2 : v < t[2] ? 3 : v < t[3] ? 4 : 5;

export function analyzeTrack(seed: number, meters = 3000): TrackStats | null {
  const need = Math.ceil(meters / (SEGMENT_LENGTH * METERS_PER_UNIT));
  const gen = createTrackGenerator(seed);
  const cap = gen.segments.length;

  let curveMass = 0; // Σ|curve| over the window
  let climb = 0; // Σ|Δy| over the window
  let canCurveMass = 0; // Σ|curve| at can segments
  let canCount = 0;
  let prevY = 0;
  let read = 0;
  while (read < need) {
    const before = gen.generated();
    gen.extend(Math.min(read + 1200, need));
    const g = gen.generated();
    const upto = Math.min(g, need);
    for (; read < upto; read++) {
      const s = gen.segments[read % cap];
      if (s.index !== read) break; // slot overwritten — should not happen
      curveMass += Math.abs(s.curve);
      climb += Math.abs(s.p2.world.y - prevY);
      prevY = s.p2.world.y;
      if (s.pickup && s.pickup.ordinal >= 0) {
        canCurveMass += Math.abs(s.curve);
        canCount++;
      }
    }
    if (g <= before) break; // generator stalled — paranoia guard
  }
  if (read < need * 0.9) return null;

  const meanCurve = curveMass / need;
  const meanCanCurve = canCount > 0 ? canCurveMass / canCount : 0;
  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[racer] today's track: meanCurve ${meanCurve.toFixed(2)}, ` +
        `climb ${Math.round(climb)}, canCurve ${meanCanCurve.toFixed(2)} ` +
        `(${canCount} cans)`,
    );
  }

  const curves = stars(meanCurve, [0.7, 0.95, 1.2, 1.45]);
  const hills = stars(climb, [350, 500, 650, 800]);
  const fuel = stars(meanCanCurve, [0.5, 0.9, 1.3, 1.7]);
  const total = curves + hills + fuel;
  const verdict: TrackStats["verdict"] =
    total >= 12
      ? "CRUEL"
      : curves - hills >= 2
        ? "TWISTY"
        : hills - curves >= 2
          ? "HILLY"
          : total <= 6
            ? "CHILL"
            : "BALANCED";
  return { curves, hills, fuel, verdict };
}
