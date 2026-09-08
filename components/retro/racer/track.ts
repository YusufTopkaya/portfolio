/**
 * Endless track generator for the Twingo racer.
 *
 * Same data model as OutRun (per the Cannonball reverse-engineering): the
 * road is a flat list of sections, each section a (curve, height) command
 * with enter/hold/leave lengths. Height transitions ease in and out
 * (Jake Gordon's addRoad).
 *
 * The track NEVER loops: sections are generated forever on demand — the
 * engine asks for ~2 minutes of flat-out driving to stay buffered ahead
 * and drops segments the car left behind. Geometric limits without a
 * wrap seam: curve sides strictly alternate (never two same-side bends
 * in a row) and hill choices are spring-biased toward sea level, so the
 * road's altitude stays bounded instead of drifting off.
 */

import {
  ENGINE_CONSTANTS,
  easeIn,
  easeInOut,
  makeSegment,
  type Segment,
} from "./engine";

const { SEGMENT_LENGTH } = ENGINE_CONSTANTS;

/** mulberry32 — deterministic seeded rng; the seed alone shapes the run */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CURVES = { easy: 2, medium: 4, hard: 6 } as const;
const HILLS = { low: 20, medium: 40, high: 60 } as const; // × SEGMENT_LENGTH (Jake Gordon's ROAD.HILL)
// altitude ceiling: once the road sits a full HIGH hill above (or below)
// sea level, further climbs (drops) flip sign — the spring home
const MAX_ALTITUDE = HILLS.high * SEGMENT_LENGTH;

export interface TrackGenerator {
  /** live window into the endless road — the engine splices off the
      front as segments fall behind the car */
  segments: Segment[];
  /** generate sections until the absolute segment index `upTo` exists */
  extend: (upTo: number) => void;
}

export function createTrackGenerator(seed = 427): TrackGenerator {
  const rng = mulberry32(seed);
  const segments: Segment[] = [];
  let generated = 0; // absolute index of the next segment to create

  let lastY = 0;
  let prevY = 0; // previous segment's end height → this segment's start
  let side = rng() > 0.5 ? 1 : -1; // curves strictly alternate sides
  let started = false;

  // pickup/sprite placement runs on absolute indices, interleaved with
  // generation — same rhythm the old one-shot loop track used
  let canOrdinal = 0;
  let nextCanAt = 60; // never on the opening straight
  let nextSpriteAt = 16;

  const addSegment = (curve: number, y: number) => {
    const seg = makeSegment(generated, curve, prevY, y);
    const i = generated;
    generated++;
    prevY = y;

    // roadside objects: every few segments, 75% chance of a tree/sign/
    // pole just off the road edge (offset 1.15-1.9 half-widths) — close
    // offsets are what let sprites whiz past at arcade size
    if (i >= nextSpriteAt) {
      nextSpriteAt = i + 2 + Math.floor(rng() * 4);
      if (rng() >= 0.25) {
        seg.sprites.push({
          sprite: Math.floor(rng() * 3),
          offset: (rng() > 0.5 ? 1 : -1) * (1.15 + rng() * 0.75),
        });
      }
    }

    // gas cans on the tarmac: sparse enough that fuel management stays a
    // real concern. Every 10th can is BIG — worth 2 gauge dots, drawn
    // larger, and it resists scarcity hiding at half rate (see engine)
    if (i >= nextCanAt) {
      nextCanAt = i + 120 + Math.floor(rng() * 180);
      seg.pickup = {
        x: rng() * 1.4 - 0.7,
        big: canOrdinal % 10 === 9,
        ordinal: canOrdinal,
      };
      canOrdinal++;
    }

    segments.push(seg);
  };

  /** Jake Gordon's addRoad: height eases in over `enter`, holds, eases out.
      dy is in segmentLength units, exactly like the reference:
      endY = startY + y * segmentLength (LOW/MEDIUM/HIGH = 20/40/60) */
  const addRoad = (
    enter: number,
    hold: number,
    leave: number,
    curve: number,
    dy: number,
  ) => {
    const startY = lastY;
    const endY = startY + dy * SEGMENT_LENGTH;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) {
      addSegment(
        easeIn(0, curve, n / enter),
        easeInOut(startY, endY, n / total),
      );
    }
    for (let n = 0; n < hold; n++) {
      addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    }
    for (let n = 0; n < leave; n++) {
      addSegment(
        easeInOut(curve, 0, n / leave),
        easeInOut(startY, endY, (enter + hold + n) / total),
      );
    }
    lastY = endY;
  };

  /** Jake Gordon's addLowRollingHills, verbatim from the v3-hills article.
      Self-balancing (net zero climb), safe at any altitude */
  const addLowRollingHills = (num: number, height: number) => {
    addRoad(num, num, num, 0, height / 2);
    addRoad(num, num, num, 0, -height);
    addRoad(num, num, num, 0, height);
    addRoad(num, num, num, 0, 0);
    addRoad(num, num, num, 0, height / 2);
    addRoad(num, num, num, 0, 0);
  };

  const curveVals = [CURVES.easy, CURVES.medium, CURVES.hard];
  const hillVals = [
    0,
    HILLS.low,
    HILLS.medium,
    HILLS.high,
    -HILLS.low,
    -HILLS.medium,
  ];

  /** random hill choice with the sea-level spring: past the altitude
      ceiling a climb/drop flips sign, so elevation never runs away */
  const pickHillDy = () => {
    const dy = hillVals[1 + Math.floor(rng() * (hillVals.length - 1))];
    if (lastY > MAX_ALTITUDE && dy > 0) return -dy;
    if (lastY < -MAX_ALTITUDE && dy < 0) return -dy;
    return dy;
  };

  /** ±LOW with the same sea-level spring as pickHillDy — curve sections
      sometimes carry a gentle grade */
  const lowHillDy = () => {
    const dy = (rng() > 0.5 ? 1 : -1) * HILLS.low;
    if (lastY > MAX_ALTITUDE && dy > 0) return -dy;
    if (lastY < -MAX_ALTITUDE && dy < 0) return -dy;
    return dy;
  };

  /** one weighted-random section: curve 45%, hills 30%, breather 25% —
      the same mix the old loop track dealt, dealt forever */
  const addSection = () => {
    const kind = rng();
    if (kind < 0.45) {
      // curve section (sides strictly alternate)
      const curve = side * curveVals[Math.floor(rng() * curveVals.length)];
      const dy = rng() < 0.35 ? lowHillDy() : 0;
      addRoad(25, 30 + Math.floor(rng() * 40), 25, curve, dy);
      side = -side;
    } else if (kind < 0.75) {
      // hill section: some are single eased climbs, some are the article's
      // low rolling hills (gentle curve or none either way)
      if (rng() < 0.4 && Math.abs(lastY) <= MAX_ALTITUDE) {
        addLowRollingHills(25, rng() > 0.5 ? HILLS.low : -HILLS.low);
      } else {
        addRoad(25, 20 + Math.floor(rng() * 30), 25, 0, pickHillDy());
      }
    } else {
      // breather straight
      addRoad(20, 30 + Math.floor(rng() * 40), 20, 0, 0);
    }
  };

  const extend = (upTo: number) => {
    if (!started) {
      started = true;
      // starting straight: the player launches on flat ground
      addRoad(50, 50, 50, 0, 0);
    }
    while (generated < upTo) addSection();
  };

  return { segments, extend };
}
