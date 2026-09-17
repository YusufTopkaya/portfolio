/**
 * Endless track generator for the Twingo racer.
 *
 * Same data model as OutRun (per the Cannonball reverse-engineering): the
 * road is a flat list of sections, each section a (curve, height) command
 * with enter/hold/leave lengths. Height transitions ease in and out
 * (Jake Gordon's addRoad).
 *
 * The track NEVER loops: sections are generated forever on demand into a
 * fixed-capacity ring — the engine asks for ~10 seconds of flat-out
 * driving to stay buffered ahead and old slots are simply overwritten.
 * Geometric limits without a wrap seam: curve sides strictly alternate
 * (never two same-side bends in a row) and hill choices are
 * spring-biased toward sea level, so the road's altitude stays bounded
 * instead of drifting off.
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
  /** ring window into the endless road — absolute index i lives at slot
      segments[i % segments.length]; valid indices are firstIndex() up to
      generated()-1, older slots are silently overwritten */
  segments: Segment[];
  /** generate sections until the absolute segment index `upTo` exists */
  extend: (upTo: number) => void;
  /** absolute index of the oldest segment still held in the ring */
  firstIndex: () => number;
  /** absolute count of segments generated so far */
  generated: () => number;
}

// ring capacity: ~10 s of flat-out driving ahead (AHEAD_SEGMENTS) plus the
// longest single section the generator can deal (a grade-capped rolling-
// hills run is ~540 segments and extend() fills whole sections, so it can
// overshoot its target by that much) plus a long tail for the rearview
// mirror — the engine renders 180 ahead and mirrors 20 behind, everything
// else is cushion. The window must NEVER start ahead of the car: findSegment
// clamps to the oldest segment and would render the world from a wrong
// offset (the road "teleport" glitch), so the margin below is load-bearing.
const CAPACITY = 2048;

export function createTrackGenerator(seed = 427): TrackGenerator {
  const rng = mulberry32(seed);
  const segments: Segment[] = new Array(CAPACITY);
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
  // potholes ride on the can rhythm (one per can): every can placement
  // schedules exactly one hole ahead — ~40% are BAIT holes parked just off
  // the can's line so the greedy straight line to the can clips them,
  // the rest scatter anywhere in the following can window
  const pendingHoles = new Map<number, { x: number }>();

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

    // gas cans on the tarmac: spaced ~5-11 s of driving apart, so a tank
    // (the run's death clock) only stretches when the driver goes and
    // gets them. Every 10th can is BIG — worth 3 gauge dots, drawn
    // larger, and it resists scarcity hiding at half rate (see engine).
    // ~3% of regular cans are GOLDEN — 3 dots + 1 s of BOOST, never
    // scarcity-hidden; big cans keep their own identity
    if (i >= nextCanAt) {
      nextCanAt = i + 180 + Math.floor(rng() * 200);
      const big = canOrdinal % 10 === 9;
      const canX = rng() * 1.4 - 0.7;
      seg.pickup = {
        x: canX,
        big,
        golden: !big && rng() < 0.03,
        ordinal: canOrdinal,
      };
      canOrdinal++;
      // schedule this can's pothole. Bait: just beside the can's line a
      // couple segments on — a dead-centre grab is safe, but the lazy
      // straight line clips the hole (hit radius 0.28, grab radius 0.24).
      // Scatter: anywhere in the next can window
      if (rng() < 0.4) {
        const dx = (rng() > 0.5 ? 1 : -1) * (0.4 + rng() * 0.25);
        pendingHoles.set(i + 2 + Math.floor(rng() * 3), {
          x: Math.max(-0.8, Math.min(0.8, canX + dx)),
        });
      } else {
        pendingHoles.set(i + 30 + Math.floor(rng() * 300), {
          x: rng() * 1.6 - 0.8,
        });
      }
    }

    // a scheduled pothole materialises here — dropped if a can owns the
    // segment (a hole under a pickup would be a cheap shot)
    const ph = pendingHoles.get(i);
    if (ph) {
      pendingHoles.delete(i);
      if (!seg.pickup) seg.hole = ph;
    }

    segments[i % CAPACITY] = seg;
  };

  /** Jake Gordon's addRoad: height eases in over `enter`, holds, eases out.
      dy is in segmentLength units, exactly like the reference:
      endY = startY + y * segmentLength (LOW/MEDIUM/HIGH = 20/40/60).

      Steepness cap: the cosine easing peaks at ~π/2 × the average grade, and
      past ~0.35 the pseudo-3D math breaks visibly — on a descent the road
      compresses into a marking-less sliver at the screen edge, and from
      grade ~1.2 up the whole far side fails the backface test and the road
      simply VANISHES behind the crest (the "yol boşalıyor" glitch). hillGain
      (≤1.5) multiplies projected heights, so the stored grade is capped at
      0.35 to keep the effective grade ≤ ~0.5. The cap stretches the section
      (longer hill, same amplitude), never flattens the hill itself. */
  const MAX_GRADE = 0.35;
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
    // cosine easeInOut peaks at (π/2)·avg → need total ≥ (π/2)·|dy| / MAX_GRADE
    const minTotal = Math.ceil(((Math.PI / 2) * Math.abs(dy)) / MAX_GRADE);
    const stretch = Math.max(1, minTotal / total);
    const e = Math.max(1, Math.round(enter * stretch));
    const h = Math.max(1, Math.round(hold * stretch));
    const l = Math.max(1, Math.round(leave * stretch));
    const span = e + h + l;
    for (let n = 0; n < e; n++) {
      addSegment(easeIn(0, curve, n / e), easeInOut(startY, endY, n / span));
    }
    for (let n = 0; n < h; n++) {
      addSegment(curve, easeInOut(startY, endY, (e + n) / span));
    }
    for (let n = 0; n < l; n++) {
      addSegment(
        easeInOut(curve, 0, n / l),
        easeInOut(startY, endY, (e + h + n) / span),
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

  return {
    segments,
    extend,
    firstIndex: () => Math.max(0, generated - CAPACITY),
    generated: () => generated,
  };
}
