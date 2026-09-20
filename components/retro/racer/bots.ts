/**
 * CPU ghost bots for VS RACE — bronze-level drivers that play by FULL
 * player rules. Each bot wraps a REAL engine instance on the lobby leader
 * (same per-race seed as the humans, its own track generator so pickup /
 * hole state is private like every player's, its grid startX/startPos)
 * and drives it ONLY by generating a `RacerInput` every frame — gas,
 * brake and analog steer, never render. That buys the whole rulebook for
 * free: real fuel drain and the death clock, can pickups through the real
 * scan (streaks, big/golden cans, boost, the mercy can), pothole falls,
 * off-road/tree crashes with the 3-heart damage ladder, the doom check —
 * and game over. Bots are MORTAL: an empty tank or a third heart ends
 * their race and parks a wreck like any human's.
 *
 * Perception is deliberately limited — the pilot is still bronze and
 * still knows no track ahead:
 * - `engine.curveAt(pos)` — the segment the car is CURRENTLY on, nothing
 *   further (no look-ahead/preview sampling);
 * - `engine.perceive(pos, PERCEPTION_SEGS)` — only the cans/holes inside
 *   a ~60-80 segment window (human screen distance), taken/hidden cans
 *   already filtered by the engine.
 * On top of that sits the bronze calibration: low-pass steering
 * (reaction lag), an imperfect hold gain, idle wander, a weak after-drift
 * recentering pull, per-bot eagerness so cans get MISSED (real fuel
 * pressure), per-bot caution so holes sometimes get clipped at the lag,
 * and actual brake input for bends entered too hot. Rubber banding
 * stretches/shrinks the cruise against the best human.
 *
 * The calibration is DYNAMIC: a room-skill factor (0..1, EMA over ~3 s)
 * is read off the humans' own streamed state every frame — how fast they
 * actually drive, how many hearts they've lost, how long their can
 * streaks run — and scales every knob: a room of beginners gets slower,
 * wanderier, late-reacting bots; a room of pros pushes cruise past the
 * bronze band with crisper steering and greedier cans. Bots never get
 * superhuman perception, just sharper reactions of the same limited view.
 *
 * Bots never broadcast take/dead-by-crash messages of their own beyond
 * the shared-hazard rule: a bot's hole fall goes out as `hole(segIdx)`
 * (consumed for everyone, exactly like a human's); cans are effectively
 * per-player (0.01 s respawn) so takes are not shared. Death is reported
 * through the ordinary 20 Hz `bst` stream (state with dead + final
 * score) — receivers park the wreck via markRemoteDead. Car-car
 * collision stays OFF both ways (ghost remotes, engine.setRemoteGhost).
 */

import {
  type CarFrame,
  type CarFrames,
  type CatFrames,
  createEngine,
  ENGINE_CONSTANTS,
  type RacerEngine,
  type RacerInput,
} from "./engine";
import type { NetCarState } from "./net";
import { createTrackGenerator } from "./track";

const MAX_SPEED = ENGINE_CONSTANTS.MAX_SPEED; // world units/s (180 km/h)
const SEGMENT_LENGTH = ENGINE_CONSTANTS.SEGMENT_LENGTH;
const PLAYER_Z = ENGINE_CONSTANTS.PLAYER_Z;
/** mirrors engine.ts — the centrifugal push constant of the player car */
const CENTRIFUGAL = 0.4;

/* ── calibration (bronze) ── */
/** cruise speed as a fraction of MAX_SPEED, per bot */
const CRUISE_MIN = 0.7;
const CRUISE_MAX = 0.85;
/** steering low-pass time constant (reaction lag), per bot */
const STEER_LAG_MIN = 0.18;
const STEER_LAG_MAX = 0.3;
/** fraction of the steer needed to HOLD the current bend — under 1 means
    the bot understeers and rides wide before the lane pull corrects it */
const CORNER_GAIN_MIN = 0.72;
const CORNER_GAIN_MAX = 0.88;
/** idle wander: a slow sine on the steering, per-bot amplitude/rate */
const WANDER_AMP_MIN = 0.06;
const WANDER_AMP_MAX = 0.14;
const WANDER_RATE_MIN = 0.5; // rad/s
const WANDER_RATE_MAX = 1.1;
/** lane pull toward the target line (center, a can, a dodge) per
    half-width of error — weak enough that the car corrects AFTER
    drifting, like a scrub */
const LANE_GAIN = 1.1;
/** how far the pilot sees, per bot: ~human screen distance in segments */
const PERCEPTION_MIN = 60;
const PERCEPTION_MAX = 80;
/** per-can attempt probability, per bot — the rest are driven past
    (ignored cans are how bots feel real fuel pressure). A dry-ish tank
    (< DESPERATE_FUEL dots) makes every can worth the detour */
const EAGERNESS_MIN = 0.65;
const EAGERNESS_MAX = 0.9;
const DESPERATE_FUEL = 2;
/** hole dodging: reaction distance in segments and dodge strength, per
    bot — a low-caution bot notices late and clips the odd hole at the
    steering lag */
const CAUTION_MIN = 0.6;
const CAUTION_MAX = 1;
/** cruise cap in a bend: this fraction of the corner's hold speed
    (p·|curve|·CENTRIFUGAL = 1) — over it, the pilot BRAKES */
const CORNER_MARGIN = 0.85;
/** rubber banding: past this gap to the best human (world units — 3
    segments) the cruise stretches/shrinks by RUBBER_GAIN */
const RUBBER_DIST = 600;
const RUBBER_GAIN = 0.08;

/* ── dynamic room skill: the humans' streamed speed/crashes/streaks read
   as one 0..1 factor, EMA-smoothed over ~3 s so bots adapt mid-race
   instead of snapping. 0.5 = the neutral bronze field ── */
const SKILL_EMA_T = 3; // seconds
let skillEma = 0.5;

/** one frame of room skill: average over LIVE humans of
    75 % pace (speed / top speed) + 25 % streak form, minus a crash
    penalty. Empty field → null (keep the last read) */
const roomSkill = (humans: BotHuman[]): number | null => {
  let sum = 0;
  let n = 0;
  for (const h of humans) {
    const pace = clamp((h.speed ?? 0) / MAX_SPEED, 0, 1);
    const form = clamp((h.streak ?? 0) / 10, 0, 1);
    const wrecked = 0.15 * Math.min(3, h.crashes ?? 0);
    sum += clamp(pace * 0.75 + form * 0.25 - wrecked, 0, 1);
    n++;
  }
  return n === 0 ? null : sum / n;
};

export interface Bot {
  id: string; // "cpu-N"
  name: string; // "CPU N"
  /** the real engine this bot drives (leader-local, never rendered) */
  engine: RacerEngine;
  dead: boolean;
  deadScore: number;
  /** per-bot decision-hash seed (can-attempt rolls stay consistent per
      can — no flapping frame to frame) */
  seed: number;
  /** low-passed steering currently applied, -1..1 */
  steer: number;
  /* per-bot bronze calibration (rolled from the race seed) */
  cruise: number;
  steerLag: number;
  cornerGain: number;
  wanderAmp: number;
  wanderRate: number;
  wanderPhase: number;
  eagerness: number;
  caution: number;
  perception: number;
}

/** a human pose — the rubber band's reference (best along-track pos) and
    the dynamic-skill read (speed / crashes / streak from the 60 Hz
    stream; optional so older callers stay valid) */
export interface BotHuman {
  pos: number;
  x: number;
  speed?: number;
  crashes?: number;
  streak?: number;
}

/** everything a bot engine needs that the leader already has loaded */
export interface BotEngineDeps {
  car: CarFrames;
  gasCan: CarFrame;
  gasCanGolden?: CarFrame;
  cat?: CatFrames | null;
  mapDifficulty?: number;
  /** a bot fell into a pothole: broadcast `hole(segIdx)` — the same
      shared-hazard rule humans follow (consumed for everyone) */
  onHoleHit?: (botId: string, absSegIdx: number) => void;
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

/* deterministic 0..1 hash — the per-can attempt roll: the same can gets
   the same decision every frame (no flapping), different cans differ */
const hash01 = (a: number, b: number) => {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** create `count` bots (ids cpu-1..cpu-N, names CPU 1…CPU N), each with
    its own engine on a FRESH generator of the race seed — same layout as
    the humans, private pickup/hole state, exactly like every player's
    own engine. `grid[i]` is the bot's start slot (x / possibly-negative
    pos). Per-bot calibration is rolled from the race seed — a rematch
    reshuffles the field */
export function createBots(
  count: number,
  seed: number,
  grid: { x: number; pos: number }[],
  deps: BotEngineDeps,
): Bot[] {
  const rng = mulberry32(seed);
  skillEma = 0.5; // fresh room: neutral bronze until the humans show form
  const out: Bot[] = [];
  for (let i = 0; i < count; i++) {
    const id = `cpu-${i + 1}`;
    const track = createTrackGenerator(seed);
    const slot = grid[i] ?? { x: 0, pos: 0 };
    const engine = createEngine({
      segments: track.segments,
      extend: track.extend,
      firstIndex: track.firstIndex,
      generated: track.generated,
      // render-only (tree crashes read seg.sprites) — bots never render,
      // so no roadside sprite assets are built per bot
      roadside: [],
      car: deps.car,
      gasCan: deps.gasCan,
      gasCanGolden: deps.gasCanGolden,
      cat: deps.cat ?? null,
      view: "chase",
      mapDifficulty: deps.mapDifficulty,
      startX: slot.x,
      startPos: slot.pos,
      onHoleHit: (absSegIdx: number) => deps.onHoleHit?.(id, absSegIdx),
      // no audio hooks, no onTakeCan (cans respawn in 0.01 s — takes are
      // effectively per-player), no debug probe
    });
    out.push({
      id,
      name: `CPU ${i + 1}`,
      engine,
      dead: false,
      deadScore: 0,
      seed: (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0,
      steer: 0,
      cruise: CRUISE_MIN + rng() * (CRUISE_MAX - CRUISE_MIN),
      steerLag: STEER_LAG_MIN + rng() * (STEER_LAG_MAX - STEER_LAG_MIN),
      cornerGain: CORNER_GAIN_MIN + rng() * (CORNER_GAIN_MAX - CORNER_GAIN_MIN),
      wanderAmp: WANDER_AMP_MIN + rng() * (WANDER_AMP_MAX - WANDER_AMP_MIN),
      wanderRate: WANDER_RATE_MIN + rng() * (WANDER_RATE_MAX - WANDER_RATE_MIN),
      wanderPhase: rng() * Math.PI * 2,
      eagerness: EAGERNESS_MIN + rng() * (EAGERNESS_MAX - EAGERNESS_MIN),
      caution: CAUTION_MIN + rng() * (CAUTION_MAX - CAUTION_MIN),
      perception: Math.round(
        PERCEPTION_MIN + rng() * (PERCEPTION_MAX - PERCEPTION_MIN),
      ),
    });
  }
  return out;
}

/* the pilot: turn one frame of limited perception into a RacerInput.
   Everything here is reaction, never prediction */
function pilotInput(b: Bot, dt: number, humans: BotHuman[]): RacerInput {
  const st = b.engine.state;
  const p = clamp(st.speed / MAX_SPEED, 0, 1.2);
  const curve = b.engine.curveAt(st.position); // current segment only
  const seen = b.engine.perceive(st.position, b.perception);
  const carSeg = Math.floor(
    (Math.max(0, st.position) + PLAYER_Z) / SEGMENT_LENGTH,
  );
  /* dynamic skill scaling: the same bronze personality, pushed gentler
     (skill 0) or sharper (skill 1) by the room's form — never past
     human-plausible bounds */
  const s = skillEma;
  const cruiseMul = 0.8 + 0.45 * s; // 0.80…1.25
  const lagMul = 1.35 - 0.7 * s; // 1.35…0.65 (reaction time)
  const wanderMul = 1.4 - 0.9 * s; // 1.40…0.50
  const gainAdd = (s - 0.5) * 0.2; // corner hold ±0.10
  const eagerness = clamp(b.eagerness * (0.85 + 0.3 * s), 0, 1);
  const caution = clamp(b.caution * (0.8 + 0.4 * s), 0, 1);

  // ── lane target: road centre by default (the weak recentering pull),
  // the nearest can this bot BOTHERED with (eagerness roll — the rest
  // are driven straight past), a threatening hole overrides everything ──
  let laneTarget = 0;
  for (const obj of seen) {
    if (obj.kind !== "can") continue;
    if (hash01(b.seed, obj.segIdx) < eagerness || st.fuel < DESPERATE_FUEL) {
      laneTarget = clamp(obj.x, -1, 1);
      break; // nearest attempted can only
    }
  }
  const holeReactSegs = Math.round(18 + caution * 22);
  for (const obj of seen) {
    if (obj.kind !== "hole") continue;
    if (obj.segIdx - carSeg > holeReactSegs) continue; // too far to matter
    if (Math.abs(obj.x - st.playerX) < 0.55) {
      // dodge to the far side; low-caution bots aim shallow (and the lag
      // makes even a good dodge late sometimes — holes DO get clipped)
      laneTarget = clamp(
        obj.x + (obj.x > st.playerX ? -1 : 1) * (0.7 + 0.4 * caution),
        -1,
        1,
      );
      break;
    }
  }

  // ── steering: hold the CURRENT bend (imperfect gain), chase the lane,
  // wander — all low-passed through the reaction lag ──
  b.wanderPhase += b.wanderRate * dt;
  const authority = 2.2 * (1 - 0.45 * Math.min(1, p)); // engine.ts
  const holdSteer = (p * curve * CENTRIFUGAL) / Math.max(0.6, authority);
  const desired = clamp(
    (b.cornerGain + gainAdd) * holdSteer -
      LANE_GAIN * (st.playerX - laneTarget) +
      b.wanderAmp * wanderMul * Math.sin(b.wanderPhase),
    -1,
    1,
  );
  b.steer += (desired - b.steer) * Math.min(1, dt / (b.steerLag * lagMul));

  // ── pedals: rubber-banded cruise, capped under the CURRENT bend's
  // hold speed — too hot means actual brake, not a magic slowdown ──
  let cruise = b.cruise * cruiseMul;
  if (humans.length > 0) {
    const best = Math.max(...humans.map((h) => h.pos));
    if (st.position < best - RUBBER_DIST) cruise *= 1 + RUBBER_GAIN;
    else if (st.position > best + RUBBER_DIST) cruise *= 1 - RUBBER_GAIN;
  }
  let target = cruise * MAX_SPEED;
  if (Math.abs(curve) > 0.5) {
    target = Math.min(
      target,
      (CORNER_MARGIN * MAX_SPEED) / (Math.abs(curve) * CENTRIFUGAL),
    );
  }
  const err = target - st.speed;
  const gasAmt = err > 0 ? clamp(0.35 + (err / MAX_SPEED) * 6, 0, 1) : 0;
  const brakeAmt =
    err < -MAX_SPEED * 0.01 ? clamp((-err / MAX_SPEED) * 10, 0, 1) : 0;

  return {
    left: false,
    right: false,
    gas: false,
    brake: false,
    steer: clamp(b.steer, -1, 1),
    gasAmt,
    brakeAmt,
  };
}

/** advance the whole field one frame (leader only). A bot whose engine
    reached game over is marked dead with its final score — its wreck
    parks through the normal remote path on the next botStates() */
export function updateBots(bots: Bot[], dt: number, humans: BotHuman[]): void {
  if (dt <= 0) return;
  // adapt to the room: EMA the humans' live form into the shared skill
  // factor before anybody drives a frame
  const raw = roomSkill(humans);
  if (raw !== null)
    skillEma += (raw - skillEma) * Math.min(1, dt / SKILL_EMA_T);
  for (const b of bots) {
    if (b.dead) continue;
    b.engine.update(dt, pilotInput(b, dt, humans));
    if (b.engine.state.gameOver) {
      b.dead = true;
      b.deadScore = Math.floor(b.engine.state.score);
    }
  }
}

/** dev probe: the current room-skill EMA the bots are calibrated against */
export const currentBotSkill = () => skillEma;

/** snapshot the field as remote-car states for the net broadcast and the
    leader's own engine feed. Dead bots keep their final pose with the
    dead flag — receivers park the wreck (markRemoteDead), the same way a
    human's final dead-carrying packet is handled */
export function botStates(
  bots: Bot[],
): { id: string; name: string; state: NetCarState }[] {
  return bots.map((b) => {
    const st = b.engine.state;
    return {
      id: b.id,
      name: b.name,
      state: {
        pos: st.position,
        x: st.playerX,
        speed: b.dead ? 0 : st.speed,
        score: b.dead ? b.deadScore : Math.floor(st.score),
        dead: b.dead,
        steer: clamp(b.steer, -1, 1),
        fuel: st.fuel,
        crashes: st.crashes,
        streak: st.streak,
        t: performance.now(),
      },
    };
  });
}
