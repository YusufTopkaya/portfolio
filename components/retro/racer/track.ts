/**
 * Endless track generator for the Twingo racer.
 *
 * Same data model as OutRun (per the Cannonball reverse-engineering): the
 * road is a flat list of sections, each section a (curve, height) command
 * with enter/hold/leave lengths. Height transitions ease in and out
 * (Jake Gordon's addRoad). The track loops seamlessly: the generator
 * alternates left/right curves and up/down hills so the net drift stays
 * near zero, then a long flat straight at the end returns the road to
 * y=0 so the wrap point is invisible.
 */

import {
  ENGINE_CONSTANTS,
  easeIn,
  easeInOut,
  makeSegment,
  type Segment,
} from "./engine";

const { SEGMENT_LENGTH } = ENGINE_CONSTANTS;

/** mulberry32 — deterministic seeded rng so the track is the same every run */
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
const HILLS = { low: 20, medium: 40, high: 60 } as const; // world y units

interface Built {
  segments: Segment[];
  trackLength: number;
}

export function buildTrack(seed = 427): Built {
  const rng = mulberry32(seed);
  const segments: Segment[] = [];

  let lastY = 0;
  let prevY = 0; // previous segment's end height → this segment's start

  const addSegment = (curve: number, y: number) => {
    segments.push(makeSegment(segments.length, curve, prevY, y));
    prevY = y;
  };

  /** Jake Gordon's addRoad: height eases in over `enter`, holds, eases out */
  const addRoad = (
    enter: number,
    hold: number,
    leave: number,
    curve: number,
    dy: number,
  ) => {
    const startY = lastY;
    const endY = startY + dy;
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

  const curveVals = [CURVES.easy, CURVES.medium, CURVES.hard];
  const hillVals = [
    0,
    HILLS.low,
    HILLS.medium,
    HILLS.high,
    -HILLS.low,
    -HILLS.medium,
  ];

  // starting straight: the player launches on flat ground
  addRoad(50, 50, 50, 0, 0);

  // alternating sections: curve right then left (and vice versa), hills
  // balanced up/down, so the looping seam stays subtle
  let side = rng() > 0.5 ? 1 : -1;
  for (let section = 0; section < 14; section++) {
    const kind = rng();
    if (kind < 0.45) {
      // curve section
      const curve = side * curveVals[Math.floor(rng() * curveVals.length)];
      const dy = rng() < 0.35 ? (rng() > 0.5 ? 1 : -1) * HILLS.low : 0;
      addRoad(25, 30 + Math.floor(rng() * 40), 25, curve, dy);
      side = -side;
    } else if (kind < 0.75) {
      // hill section (gentle curve or none)
      const dy = hillVals[1 + Math.floor(rng() * (hillVals.length - 1))];
      addRoad(25, 20 + Math.floor(rng() * 30), 25, 0, dy);
    } else {
      // breather straight
      addRoad(20, 30 + Math.floor(rng() * 40), 20, 0, 0);
    }
  }

  // return home: flatten the road for a seamless loop
  if (lastY !== 0) addRoad(30, 20, 30, 0, -lastY);
  addRoad(60, 60, 60, 0, 0);

  // ── roadside objects: deterministic placement, alternating sides ──
  // every few segments, 40% chance of a tree/sign/pole just off the road
  // edge (offset 1.15-1.9 half-widths). OutRun keeps them close: in this
  // projection, objects farther than ~2 half-widths only enter the screen
  // at distances where they are already tiny — close offsets are what let
  // sprites whiz past the camera at arcade size.
  const SPRITE_KINDS = 3; // tree, sign, pole (index into the roadside set)
  for (let i = 16; i < segments.length - 5; i += 2 + Math.floor(rng() * 4)) {
    if (rng() < 0.25) continue;
    const sprite = Math.floor(rng() * SPRITE_KINDS);
    const sideSign = rng() > 0.5 ? 1 : -1;
    const offset = sideSign * (1.15 + rng() * 0.75);
    segments[i].sprites.push({ sprite, offset });
  }

  // ── hazards: potholes and oil slicks on the tarmac itself ──
  // sparse enough to be dodgeable, never on the opening straight, never
  // two in a row — hitting one costs a respawn, not the run
  for (let i = 60; i < segments.length - 15; i += 10 + Math.floor(rng() * 14)) {
    if (rng() < 0.3) continue;
    segments[i].hazard = {
      kind: rng() < 0.5 ? "pothole" : "oil",
      x: rng() * 1.4 - 0.7,
    };
  }

  return { segments, trackLength: segments.length * SEGMENT_LENGTH };
}
