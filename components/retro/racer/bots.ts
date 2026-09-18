/**
 * CPU ghost bots for VS RACE — bronze-level drivers simulated ONLY by the
 * lobby leader and streamed to the room as ordinary remote-car states
 * (the `bst` action in net.ts). Every client renders them as ghost
 * remotes: no car-car collision either way (engine.setRemoteGhost), they
 * never die and never touch pickups/holes, so they emit no take/hole/dead
 * traffic — just 20 Hz poses.
 *
 * Track knowledge is deliberately limited to the segment the bot is
 * CURRENTLY on (`curveAt(pos)` — no look-ahead, no preview sampling):
 * the steering reacts to the bend it is already inside, low-pass filtered
 * through a reaction lag with an imperfect gain, so the car visibly
 * wobbles, drifts wide mid-bend and only then corrects back toward the
 * centre line (a weak recentering pull — positional self-awareness, not
 * track knowledge). Bends also cap the cruise at a margin under the
 * corner's hold speed, so bots bleed speed in curves like a scrub.
 *
 * The lateral model mirrors the player physics in engine.ts (same
 * authority falloff with speed, same CENTRIFUGAL push) so a bot's line
 * through a bend reads like a real, mediocre Twingo driver.
 */

import { ENGINE_CONSTANTS } from "./engine";
import type { NetCarState } from "./net";

const MAX_SPEED = ENGINE_CONSTANTS.MAX_SPEED; // world units/s (180 km/h)
/** mirrors engine.ts — the centrifugal push constant of the player car */
const CENTRIFUGAL = 0.4;

/* ── calibration (bronze) ── */
/** cruise speed as a fraction of MAX_SPEED, per bot */
const SKILL_MIN = 0.7;
const SKILL_MAX = 0.85;
/** steering low-pass time constant (reaction lag), per bot */
const STEER_LAG_MIN = 0.18;
const STEER_LAG_MAX = 0.3;
/** fraction of the steer needed to HOLD the current bend — under 1 means
    the bot understeers and rides wide until the recentering pulls it
    back (the visible wobble) */
const CORNER_GAIN_MIN = 0.72;
const CORNER_GAIN_MAX = 0.88;
/** weak pull toward x = 0 inside the desired-steer mix (per half-width
    of offset) — the bot corrects AFTER drifting out, never before */
const RECENTER_GAIN = 0.35;
/** idle wander: a slow sine on the steering, per-bot amplitude/rate */
const WANDER_AMP_MIN = 0.06;
const WANDER_AMP_MAX = 0.14;
const WANDER_RATE_MIN = 0.5; // rad/s
const WANDER_RATE_MAX = 1.1;
/** cruise cap in a bend: this fraction of the corner's hold speed
    (p·|curve|·CENTRIFUGAL = 1), so bots visibly slow for curves */
const CORNER_MARGIN = 0.85;
/** speed chases its target with this time constant — bots don't snap
    to the corner speed, they ease off like a lifting driver */
const SPEED_LAG = 0.8;
/** rubber banding: past this gap to the best human (world units — 3
    segments) the cruise stretches/shrinks by RUBBER_GAIN */
const RUBBER_DIST = 600;
const RUBBER_GAIN = 0.08;
/** mild human avoidance (ghosts never collide — this only keeps a bot
    from parking INSIDE a player's sprite for minutes): lateral nudge
    when within AVOID_SEGS and |Δx| < AVOID_X */
const AVOID_SEGS = 1.5;
const AVOID_X = 0.5;
const AVOID_RATE = 0.8; // half-widths/s
/** bots never leave the tarmac (they're scenery with stakes, not
    crashers) — a hard clamp under the stranded threshold */
const X_CLAMP = 1.05;

const SEGMENT_LENGTH = 200; // mirrors engine.ts (kept local: units note)

export interface Bot {
  id: string; // "cpu-N"
  name: string; // "CPU N"
  /** world position along the track (same units as EngineState.position) */
  pos: number;
  /** lateral, road half-widths (±1 = edge) */
  x: number;
  /** world units/s (same scale as EngineState.speed) */
  speed: number;
  score: number;
  /** low-passed steering currently applied, -1..1 */
  steer: number;
  /** per-bot calibration (rolled from the race seed at createBots) */
  skill: number;
  steerLag: number;
  cornerGain: number;
  wanderAmp: number;
  wanderRate: number;
  wanderPhase: number;
}

/** a human pose for the mild avoidance nudge + rubber band reference */
export interface BotHuman {
  pos: number;
  x: number;
}

/* mulberry32 — small seeded PRNG, same style as track.ts */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** create `count` bots (ids cpu-1..cpu-N, names CPU 1…CPU N) with per-bot
    bronze calibration rolled from the race seed — a rematch reshuffles
    the field. Cars start parked at the origin; the caller places them on
    the grid (pos/x from RACE_GRID, after the humans) */
export function createBots(count: number, seed: number): Bot[] {
  const rng = mulberry32(seed);
  const out: Bot[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `cpu-${i + 1}`,
      name: `CPU ${i + 1}`,
      pos: 0,
      x: 0,
      speed: 0,
      score: 0,
      steer: 0,
      skill: SKILL_MIN + rng() * (SKILL_MAX - SKILL_MIN),
      steerLag: STEER_LAG_MIN + rng() * (STEER_LAG_MAX - STEER_LAG_MIN),
      cornerGain: CORNER_GAIN_MIN + rng() * (CORNER_GAIN_MAX - CORNER_GAIN_MIN),
      wanderAmp: WANDER_AMP_MIN + rng() * (WANDER_AMP_MAX - WANDER_AMP_MIN),
      wanderRate: WANDER_RATE_MIN + rng() * (WANDER_RATE_MAX - WANDER_RATE_MIN),
      wanderPhase: rng() * Math.PI * 2,
    });
  }
  return out;
}

/** advance the whole field one frame. `curveAt(pos)` MUST return the
    difficulty-adjusted curve of the segment AT that world position only
    (engine.curveAt) — the bots get no preview of the road ahead */
export function updateBots(
  bots: Bot[],
  dt: number,
  curveAt: (pos: number) => number,
  humans: BotHuman[],
): void {
  if (dt <= 0) return;
  const bestHuman = humans.length
    ? Math.max(...humans.map((h) => h.pos))
    : null;
  for (const b of bots) {
    const curve = curveAt(b.pos);
    const p = clamp(b.speed / MAX_SPEED, 0, 1.2);

    // ── speed: per-bot cruise, rubber-banded against the best human,
    // capped at a margin under the CURRENT bend's hold speed ──
    let target = b.skill * MAX_SPEED;
    if (bestHuman !== null) {
      if (b.pos < bestHuman - RUBBER_DIST) target *= 1 + RUBBER_GAIN;
      else if (b.pos > bestHuman + RUBBER_DIST) target *= 1 - RUBBER_GAIN;
    }
    if (Math.abs(curve) > 0.5) {
      target = Math.min(
        target,
        (CORNER_MARGIN * MAX_SPEED) / (Math.abs(curve) * CENTRIFUGAL),
      );
    }
    b.speed += (target - b.speed) * Math.min(1, dt / SPEED_LAG);
    b.pos += b.speed * dt;

    // ── steering: react to the bend we're IN (no preview), low-passed
    // through the reaction lag, with an imperfect gain so the car rides
    // wide before the weak recentering pulls it back — plus idle wander ──
    b.wanderPhase += b.wanderRate * dt;
    const authority = 2.2 * (1 - 0.45 * Math.min(1, p)); // engine.ts
    const holdSteer = (p * curve * CENTRIFUGAL) / Math.max(0.6, authority);
    const desired = clamp(
      b.cornerGain * holdSteer -
        RECENTER_GAIN * b.x +
        b.wanderAmp * Math.sin(b.wanderPhase),
      -1,
      1,
    );
    b.steer += (desired - b.steer) * Math.min(1, dt / b.steerLag);

    // ── lateral: mirror the engine's integration (authority-scaled steer
    // minus the centrifugal push) so the line reads like a real driver ──
    const dxx = dt * authority * Math.min(1, 3 * p);
    b.x += dxx * b.steer;
    b.x -= dxx * clamp(p * curve * CENTRIFUGAL, -1.6, 1.6);

    // ── mild human avoidance: ghosts pass through cars, but a bot that
    // shares a lane with a player for minutes reads as broken — drift
    // off their line gently. This is courtesy, not collision ──
    for (const h of humans) {
      if (Math.abs(b.pos - h.pos) > AVOID_SEGS * SEGMENT_LENGTH) continue;
      const dx = b.x - h.x;
      if (Math.abs(dx) >= AVOID_X) continue;
      b.x += (dx === 0 ? (b.x >= 0 ? 1 : -1) : Math.sign(dx)) * AVOID_RATE * dt;
    }

    b.x = clamp(b.x, -X_CLAMP, X_CLAMP);

    // score: the player's own formula (metres × the ×0.5 arcade scale,
    // multiplier 1 — bots don't farm the speed tiers)
    const kmh = (b.speed / MAX_SPEED) * 180;
    b.score += ((kmh * dt) / 3.6) * 0.5;
  }
}

/** snapshot the field as remote-car states for the net broadcast and the
    leader's own engine feed (identical shape — both go through the same
    interpolation buffer) */
export function botStates(
  bots: Bot[],
): { id: string; name: string; state: NetCarState }[] {
  return bots.map((b) => ({
    id: b.id,
    name: b.name,
    state: {
      pos: b.pos,
      x: b.x,
      speed: b.speed,
      score: Math.floor(b.score),
      dead: false,
      steer: clamp(b.steer, -1, 1),
    },
  }));
}
