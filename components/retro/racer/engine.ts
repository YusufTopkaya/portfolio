/**
 * Pseudo-3D sprite racing engine, OutRun style.
 *
 * Method follows Jake Gordon's "JavaScript Racer" v4 (segmented road with
 * true 3d-projected segment endpoints) cross-checked against Lou
 * Gorenfeld's pseudo-3d write-up (extentofthejam.com/pseudo):
 *
 * - The road is a list of segments; each segment's two endpoints live in
 *   world space (x=0 center line, y = hill height, z = distance).
 * - Projection: scale = cameraDepth / (z - cameraZ), then
 *   screenX = center + scale * worldX * halfWidth etc. cameraDepth is
 *   1/tan(fov/2), the classic pinhole-camera ratio.
 * - Curves are NOT real rotations: per segment an accumulating dx/ddx
 *   shifts the road center sideways (Lou's "curve position / velocity /
 *   acceleration" trick), which produces the signature pseudo-3d warp.
 * - Steering keeps the car sprite pinned and slides the road under it
 *   (Lou's "perspective steering"); curves also push the car outward via
 *   a centrifugal term.
 * - Rendering is back-to-front (painter's algorithm); each segment clips
 *   against the highest road line drawn so far (maxY) so the far side of
 *   a hill is correctly hidden.
 * - The horizon scrolls opposite to the curve and bobs with the hills.
 *
 * The engine is framework-free: the React wrapper feeds it input and a
 * canvas 2d context.
 */

export interface RacerInput {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
  /** analog steering (-1..1) from tilt controls — overrides left/right */
  steer?: number;
}

export interface CarFrame {
  image: CanvasImageSource;
  w: number;
  h: number;
  /** brake-lamp anchors as frame fractions [x, y, w, h] — the angled
      left/right frames put the lamps in different spots than the
      straight rear view, so each frame carries its own */
  lamps?: [number, number, number, number][];
}

export interface CarFrames {
  straight: CarFrame;
  left: CarFrame;
  right: CarFrame;
  up: CarFrame;
  down: CarFrame;
  smoke: CarFrame[];
}

export interface RoadsideSprite {
  image: CanvasImageSource;
  w: number;
  h: number;
  /** -1 = left side, +1 = right side (roughly) */
  offset: number;
  /** per-sprite size multiplier (trees read bigger than poles etc.) */
  scale?: number;
}

export interface SegmentSprite {
  sprite: number; // index into roadside set
  offset: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface SegmentPoint {
  world: Vec3;
  camera: Vec3;
  screen: { x: number; y: number; w: number; scale: number };
}

export interface Segment {
  index: number;
  curve: number;
  p1: SegmentPoint;
  p2: SegmentPoint;
  sprites: SegmentSprite[];
  /** collectible gas can on the tarmac, x in road half-width units
      (±1 = edge). big: every 10th can — worth 3 gauge dots, drawn larger,
      and resists scarcity hiding at half rate. golden: rare (~3%) regular
      can — 3 dots + 1 s BOOST, never scarcity-hidden. ordinal: position
      in the can sequence, drives the golden-ratio hiding pattern */
  pickup?: { x: number; big?: boolean; golden?: boolean; ordinal: number };
  /** pothole on the tarmac, x in road half-width units (±1 = edge). One
      per gas can; ~40% are bait holes parked just off a can's line so the
      greedy straight line clips them. Falling in costs 1 fuel dot and
      respawns the car, exactly like running far off-road */
  hole?: { x: number };
  color: typeof COLORS.light | typeof COLORS.dark;
  clip: number;
}

/* engine constants (Jake Gordon's values, tuned down for a 480x270 buffer) */
export const RACER_WIDTH = 480;
export const RACER_HEIGHT = 270;
const SEGMENT_LENGTH = 200; // world units per segment
const RUMBLE_LENGTH = 3; // segments per rumble color alternation
const ROAD_WIDTH = 2200; // half-width of the road in world units
const DRAW_DISTANCE = 180; // segments drawn ahead
const CAMERA_HEIGHT = 1000;
const FIELD_OF_VIEW = 100; // degrees
const CAMERA_DEPTH = 1 / Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180);
const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH;
const MAX_SPEED = SEGMENT_LENGTH * 60; // a segment per frame at 60fps
// real Mk1 Twingo pace, in km/h per second of throttle: the D7F (58 hp)
// does 0-100 km/h in ~13.4 s, needs another ~20 s for 100-150 (the real
// car tops out at 151), then an arcade tail wheezes toward the 180 km/h
// speedo ceiling
const ACCEL_KMH = (kmh: number): number =>
  kmh < 100 ? 100 / 13.4 : kmh < 150 ? 50 / 20 : Math.max(0, (180 - kmh) * 0.2);
// ~1 g of braking, like a real road car: 180 km/h to a standstill
// takes ~5 s (36 km/h per second) instead of an instant stop
const BRAKING = -MAX_SPEED * 0.2;
// hill physics: gravity along the grade under the car, in km/h per second
// per unit of grade (grade = dy per segment / SEGMENT_LENGTH). The grade
// is capped at 0.6 so a standstill start on the steepest eased crest can
// never stall the car outright (max pull 4.8 < 6.25 low-speed throttle)
const GRAVITY_KMH = 8;
const GRAVITY_MAX_GRADE = 0.6;
// coasting drag, proportional to speed (1/s) — a constant coast decel
// would always overpower gravity; proportional drag is what lets the car
// gather speed rolling downhill on its own and stall faster facing up.
// 0.3 matches the old constant decel (-36 km/h/s) at 120 km/h, tapering
// off at low speed; downhill terminal stays ~9 km/h on a typical grade
const ROLL_DRAG = 0.3;
const OFFROAD_DECEL = -MAX_SPEED * 0.75;
const OFFROAD_LIMIT = MAX_SPEED / 4;
const CENTRIFUGAL = 0.4;
// speed bleed per unit of cornering overload (|p·curve·CENTRIFUGAL| − 1)
// — tire scrub as a fraction of top speed per second
const TIRE_SCRUB = 0.23;
// 5-speed box: top of each gear in km/h. A gear change lifts the throttle
// for SHIFT_TIME seconds — revs drop, no drive, then it hooks up again
const GEAR_TOPS = [45, 80, 115, 150, 180];
const SHIFT_TIME = 0.28;
const RESPAWN_TIME = 2.6; // seconds of "breathing" fade after a respawn
const PICKUP_GRACE_T = 0.3; // fuel burns free for this long after a can grab
const FUEL_MAX = 8; // dots on the cluster's fuel gauge
// the tank is the run's death clock, OutRun-style: the drain is (nearly)
// FLAT per second, so fuel-per-km falls monotonically with speed —
// flat out is ALWAYS the most economical pace and crawling at 60 km/h
// is the fastest way to die (km cost = 1.8/p + 0.8p, best at p≈1.5).
// A small quadratic term stays for flavour; it never creates a
// low-speed economy optimum
const FUEL_DRAIN_IDLE = 0.09; // gauge dots per second, the clock itself
// extra dots per second at full speed — applied quadratically
// (speedPercent²), deliberately too weak to bend the economy curve
const FUEL_DRAIN_SPEED = 0.04;
// overflow fuel (a can grabbed with a near-full tank) burns off as BOOST
// instead of going to waste: 1.25 s per wasted dot, top speed 180 → ~194 km/h
// with a harder pull — full-tank can chains stay worth steering for
const BOOST_TOP = 1.08;
const BOOST_ACCEL = 1.3;
const BOOST_PER_DOT = 1.25;
// every boost grant ADDS to the shared pool (chaining a fresh can into the
// last fraction of a running boost stacks), capped at 10 s so a perfect
// chain can't bank minutes of free speed
const BOOST_MAX_T = 10;
// golden can: 3 dots + a flat 1 s of BOOST — a small sweet bonus that
// doesn't overshadow the streak ladder
const GOLDEN_BOOST_T = 1;
// fuel-chain streak ladder, repeating every 10 cans: +3 s at 3, +5 s at
// 5, +8 s at each multiple of 10 (10/20/30…). A full clean lap pays 16 s —
// the same 16 s (3+5 twice) a player earns by DELIBERATELY breaking a chain
// after the lap and re-farming 3/5, so the seconds no longer punish
// breaking — the LAP_FUEL dots below do: a completed lap pays +2 fuel,
// and a single miss resets the streak before the lap completes, so staying
// clean still strictly wins (the deep-game economy is calibrated so a
// PERFECT chain is sustainable forever while even a 1-in-10 miss rate
// slowly bleeds out — the lap bonus is exactly the margin a misser never
// earns)
const LAP_FUEL = 2;
const streakReward = (streak: number): number => {
  const lap = streak % 10 === 0 ? 10 : streak % 10; // position in the ladder
  return lap === 10 ? 8 : lap === 5 ? 5 : lap === 3 ? 3 : 0;
};
// km driven per difficulty level — a tight ladder: the ×1.5 knee arrives
// by ~12 km and the drain multiplier then keeps creeping +2.5%/level to
// its ×1.9 cap near L45 (~64 km), so the early game stays arcade-punchy
// while the deep game quietly closes its fist (see drainGain at level-up)
const LEVEL_EVERY_KM = 1.5;
// the mercy can is training wheels, not a lifeline: past this level the
// economy must carry the run on its own (see the sustainability math on
// LAP_FUEL above — a perfect chain never needs mercy anyway)
const MERCY_MAX_LEVEL = 5;
// touch HUD: the top-left LCD cluster sits this far (in ui units) below
// the canvas top — 8 was flush against the edge on full-bleed phones,
// where the browser chrome already crowds the glass. The streak HUD
// anchors off TOUCH_CLUSTER_TOP + 52 (the cluster's bottom edge)
const TOUCH_CLUSTER_TOP = 16;
const FAR_OFFROAD = 0.9375; // |playerX| at/above this = stranded: 0.625× the old 1.5 (the 4→2.5 ask) — the centre rides the far rumble strip at most, so half the car over the grass is already a respawn; side effect: roadside pines (offset ≥ ~1.14) are now unreachable decor, the grass-slowdown band (offRoad > 1.1) never engages
const LANES = 3;

const COLORS = {
  light: {
    road: "#6b6b70",
    grass: "#3f8f3a",
    rumble: "#e8e8e8",
    lane: "#cfcfcf",
  },
  dark: {
    road: "#626267",
    grass: "#377934",
    rumble: "#b23c3c",
    lane: "#626267",
  },
};

export interface CockpitSprites {
  dash: CarFrame;
  /** wheel sheet: 3 square frames side by side (left, center, right) */
  wheel: HTMLCanvasElement;
  wheelFrame: number; // frame width = sheet height
}

export type RacerView = "chase" | "cockpit";

/* cockpit dash geometry as fractions of the drawn dash rect — measured
   and printed by scripts/build-cockpit.mjs */
const COCKPIT_WHEEL = { cxF: 0.2304, cyF: 0.6189, fwF: 0.3038, fhF: 0.5989 };
const COCKPIT_MIRROR = { xF: 0.4146, yF: 0.037, wF: 0.1729, hF: 0.0815 };
const COCKPIT_CLUSTER = { xF: 0.4188, yF: 0.3704, wF: 0.1688, hF: 0.0704 };

export interface EngineState {
  position: number;
  playerX: number;
  speed: number;
  time: number;
  /** total distance driven, in display km (same scale as the 180 km/h top speed) */
  distanceKm: number;
  /** metres driven × speed multiplier — the arcade score */
  score: number;
  /** current score multiplier (1/2/3/4 by speed, 1 while off-road/respawning) */
  multiplier: number;
  /** >0 while the car respawns (breathing fade) after going too far off-road */
  respawn: number;
  /** fuel left, in gauge dots (0..8). 0 = engine dead, coasting to a stop */
  fuel: number;
  /** seconds of BOOST left — overflow fuel burning as extra top speed */
  boostT: number;
  /** consecutive gas cans collected without missing one (drives the
      streak HUD and the tiered BOOST rewards in STREAK_REWARDS) */
  streak: number;
  /** fuel ran dry and the car rolled to a standstill */
  gameOver: boolean;
  offRoad: boolean;
  /** current gear, 1-5 (top of each band in GEAR_TOPS) */
  gear: number;
  /** >0 while the throttle is lifted between gears, counts down in seconds */
  shiftT: number;
  /** tire slide past the grip limit this frame (0 = planted, grows with scrub) */
  skid: number;
  /** revs inside the current gear, 0-1 — drives the engine note */
  rpm01: number;
  /** brake pedal held this frame — lights the stop lamps */
  braking: boolean;
  /** camera: behind the car or through the windshield */
  view: RacerView;
  /** distance-based difficulty level — 1 at the start, +1 per LEVEL_EVERY_KM */
  level: number;
}

function point(z: number): SegmentPoint {
  return {
    world: { x: 0, y: 0, z },
    camera: { x: 0, y: 0, z: 0 },
    screen: { x: 0, y: 0, w: 0, scale: 0 },
  };
}

export function makeSegment(
  index: number,
  curve: number,
  y1: number,
  y2: number,
): Segment {
  const n = index;
  const seg: Segment = {
    index,
    curve,
    p1: point(n * SEGMENT_LENGTH),
    p2: point((n + 1) * SEGMENT_LENGTH),
    sprites: [],
    color: Math.floor(n / RUMBLE_LENGTH) % 2 ? COLORS.dark : COLORS.light,
    clip: 0,
  };
  seg.p1.world.y = y1;
  seg.p2.world.y = y2;
  return seg;
}

export function easeIn(a: number, b: number, percent: number): number {
  return a + (b - a) * percent ** 2;
}
export function easeInOut(a: number, b: number, percent: number): number {
  return a + (b - a) * (-Math.cos(percent * Math.PI) / 2 + 0.5);
}
export function interpolate(a: number, b: number, percent: number): number {
  return a + (b - a) * percent;
}

function project(
  p: SegmentPoint,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  width: number,
  height: number,
  yShift = 0,
  /** lap difficulty: scales the terrain's stored heights (steeper hills) —
      the camera height passed in is scaled by the same factor, so slopes
      grow but the geometry stays consistent */
  yGain = 1,
) {
  p.camera.x = p.world.x - cameraX;
  p.camera.y = p.world.y * yGain - cameraY;
  p.camera.z = p.world.z - cameraZ;
  p.screen.scale = CAMERA_DEPTH / Math.max(p.camera.z, 0.0001);
  p.screen.x = Math.round(
    width / 2 + p.screen.scale * p.camera.x * (width / 2),
  );
  p.screen.y = Math.round(
    height / 2 - p.screen.scale * p.camera.y * (height / 2) + yShift,
  );
  p.screen.w = Math.round(p.screen.scale * ROAD_WIDTH * (width / 2));
}

function polygon(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function renderSegment(
  ctx: CanvasRenderingContext2D,
  width: number,
  x1: number,
  y1: number,
  w1: number,
  x2: number,
  y2: number,
  w2: number,
  color: typeof COLORS.light,
) {
  const r1 = w1 / 8; // rumble width scales with the road
  const r2 = w2 / 8;

  // grass band for this segment's screen slice
  ctx.fillStyle = color.grass;
  ctx.fillRect(0, y2, width, y1 - y2);

  // rumble strips
  polygon(
    ctx,
    x1 - w1 - r1,
    y1,
    x1 - w1,
    y1,
    x2 - w2,
    y2,
    x2 - w2 - r2,
    y2,
    color.rumble,
  );
  polygon(
    ctx,
    x1 + w1 + r1,
    y1,
    x1 + w1,
    y1,
    x2 + w2,
    y2,
    x2 + w2 + r2,
    y2,
    color.rumble,
  );

  // the road itself
  polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, color.road);

  // dashed lane markers on "light" segments only
  if (color.lane !== color.road) {
    const laneW1 = (w1 * 2) / LANES;
    const laneW2 = (w2 * 2) / LANES;
    const l1 = Math.max(1, w1 / 32);
    const l2 = Math.max(1, w2 / 32);
    let lx1 = x1 - w1 + laneW1;
    let lx2 = x2 - w2 + laneW2;
    for (let lane = 1; lane < LANES; lane++) {
      polygon(
        ctx,
        lx1 - l1 / 2,
        y1,
        lx1 + l1 / 2,
        y1,
        lx2 + l2 / 2,
        y2,
        lx2 - l2 / 2,
        y2,
        color.lane,
      );
      lx1 += laneW1;
      lx2 += laneW2;
    }
  }
}

/* ── background: pre-rendered sky gradient + two parallax mountain bands ── */

/* day/night cycle: a full day every DAY_LENGTH seconds of engine time.
   The sky is drawn procedurally each frame — gradient lerped between
   the keyframes below — so the sun can set, the moon can rise and the
   stars can come out. Clouds and mountains stay prebuilt and are dimmed
   by the ambient overlay in render(). */
const DAY_LENGTH = 300; // seconds per full day/night cycle
const SKY_KEYS = [
  { t: 0.0, c: ["#4a90d9", "#8fc7e8", "#d8ecd8", "#ffe9a8"], night: 0 }, // day
  { t: 0.45, c: ["#1a1c3f", "#7a3b69", "#e2703a", "#f7b32b"], night: 0 }, // sunset (the classic look)
  { t: 0.62, c: ["#05060f", "#0d1030", "#1a1c3f", "#2a2050"], night: 1 }, // night falls
  { t: 0.88, c: ["#05060f", "#0d1030", "#1a1c3f", "#2a2050"], night: 1 }, // night holds
  { t: 1.0, c: ["#4a90d9", "#8fc7e8", "#d8ecd8", "#ffe9a8"], night: 0 }, // sunrise back to day
] as const;

type Rgb = [number, number, number];
const hexRgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];
const SKY_KEYS_RGB = SKY_KEYS.map((k) => ({
  t: k.t,
  c: k.c.map(hexRgb) as Rgb[],
  night: k.night,
}));
const rgb = (c: Rgb) =>
  `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

interface SkyState {
  stops: Rgb[];
  night: number; // 0 day … 1 deep night — drives stars + ambient dim
}

// sky state at cycle position t (0..1): lerped gradient stops, eased so
// dawn and dusk blend instead of snapping
function skyAt(t: number): SkyState {
  let k = 0;
  while (k < SKY_KEYS_RGB.length - 2 && t >= SKY_KEYS_RGB[k + 1].t) k++;
  const a = SKY_KEYS_RGB[k];
  const b = SKY_KEYS_RGB[k + 1];
  const f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  const s = f * f * (3 - 2 * f); // smoothstep
  return {
    stops: a.c.map((ac, i) => {
      const bc = b.c[i];
      return [
        ac[0] + (bc[0] - ac[0]) * s,
        ac[1] + (bc[1] - ac[1]) * s,
        ac[2] + (bc[2] - ac[2]) * s,
      ];
    }),
    night: a.night + (b.night - a.night) * s,
  };
}

// quantized cache — the cycle moves slowly, so the lerped state and the
// gradient built from it are only recomputed ~8x per second
const SKY_QUANT = 480;
let skyStateKey = -1;
let skyStateCache: SkyState = skyAt(0);
function skyStateAt(t: number): SkyState {
  const key = Math.round(t * SKY_QUANT);
  if (key !== skyStateKey) {
    skyStateKey = key;
    skyStateCache = skyAt(t);
  }
  return skyStateCache;
}

const starHash = (n: number) => {
  const r = Math.sin(n * 127.1) * 43758.5453;
  return r - Math.floor(r);
};

function makeMountains(
  width: number,
  height: number,
  peaks: number,
  color: string,
  seed: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width * 2; // double-wide so horizontal wrapping is seamless
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, height);
  const step = (width * 2) / peaks;
  for (let i = 0; i <= peaks; i++) {
    const h = height * (0.25 + rnd() * 0.75);
    ctx.lineTo(i * step + step / 2, height - h);
    ctx.lineTo((i + 1) * step, height);
  }
  ctx.closePath();
  ctx.fill();
  return c;
}

/* chunky sunset clouds: a mauve belly, a warm mid body and sun-lit top
   humps, all snapped to fat pixel blocks so they sit in the same art
   direction as the mountains. Double-wide canvas for a seamless wrap. */
function makeClouds(width: number, height: number, seed: number) {
  const c = document.createElement("canvas");
  c.width = width * 2;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const px = Math.max(2, Math.round(width / 160)); // pixel chunk size
  const count = 8;
  for (let i = 0; i < count; i++) {
    const cx = Math.round((rnd() * width * 2) / px) * px;
    const cy = Math.round(height * (0.08 + rnd() * 0.55));
    const w = Math.round((width * (0.09 + rnd() * 0.11)) / px) * px;
    const h = Math.max(px * 3, Math.round(w * (0.24 + rnd() * 0.1)));
    // shadow belly
    ctx.fillStyle = "#9d5470";
    ctx.fillRect(cx + px, cy + h - px * 2, w - px * 2, px * 2);
    // warm mid body
    ctx.fillStyle = "#e88a72";
    ctx.fillRect(
      cx,
      cy + Math.round(h * 0.4),
      w,
      h - Math.round(h * 0.4) - px * 2,
    );
    // sun-lit top humps, staggered like a cauliflower top
    ctx.fillStyle = "#ffd9a3";
    let hx = cx;
    while (hx < cx + w - px) {
      const hw = px * (2 + Math.floor(rnd() * 3));
      const hh =
        px * (1 + Math.floor(rnd() * Math.max(1, Math.round((h * 0.4) / px))));
      ctx.fillRect(hx, cy + Math.round(h * 0.4) - hh, hw, hh + px);
      hx += hw;
    }
  }
  return c;
}

/* ── Twingo MK1 instrument cluster: a light-green LCD panel with dark
   7-segment digits (the real car's central dash — big speed readout,
   "km/h" legend, small trip counter; no rev counter, it never had one) ── */

/* segment order: a(top) b(top-right) c(bottom-right) d(bottom)
   e(bottom-left) f(top-left) g(middle) */
const SEG_MAP: Record<string, readonly boolean[]> = {
  "0": [true, true, true, true, true, true, false],
  "1": [false, true, true, false, false, false, false],
  "2": [true, true, false, true, true, false, true],
  "3": [true, true, true, true, false, false, true],
  "4": [false, true, true, false, false, true, true],
  "5": [true, false, true, true, false, true, true],
  "6": [true, false, true, true, true, true, true],
  "7": [true, true, true, false, false, false, false],
  "8": [true, true, true, true, true, true, true],
  "9": [true, true, true, true, false, true, true],
};

/* each segment is drawn as a hexagon with angled ends and a slight italic
   lean — the way real LCD glass etches its electrodes. Everything snaps
   to whole buffer pixels so the digits stay crisp when upscaled. */
function drawSevenSeg(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  ch: string,
  color: string,
) {
  const seg = SEG_MAP[ch];
  if (!seg) return;
  // snap the origin first: fractional starts (odd score digits sit at
  // half-pixels) make the 1px segments round differently per position
  // and garble the glyph
  x = Math.round(x);
  y = Math.round(y);
  const t = Math.max(1, Math.round(size * 0.18));
  const w = Math.round(size);
  const h = Math.round(size * 2);
  const slant = Math.max(1, Math.round(h * 0.06)); // italic lean, top → right
  const plot = (pts: [number, number][]) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = pts[i];
      const lx = Math.round(px + ((y + h - py) / h) * slant);
      const ry = Math.round(py);
      if (i === 0) ctx.moveTo(lx, ry);
      else ctx.lineTo(lx, ry);
    }
    ctx.closePath();
    ctx.fill();
  };
  // horizontal segment: rows cy-t/2..cy+t/2, columns x..x+w
  const hseg = (cy: number) =>
    plot([
      [x, cy],
      [x + t / 2, cy - t / 2],
      [x + w - t / 2, cy - t / 2],
      [x + w, cy],
      [x + w - t / 2, cy + t / 2],
      [x + t / 2, cy + t / 2],
    ]);
  // vertical segment: columns cx-t/2..cx+t/2, rows y0..y0+len
  const vseg = (cx: number, y0: number, len: number) =>
    plot([
      [cx, y0],
      [cx + t / 2, y0 + t / 2],
      [cx + t / 2, y0 + len - t / 2],
      [cx, y0 + len],
      [cx - t / 2, y0 + len - t / 2],
      [cx - t / 2, y0 + t / 2],
    ]);
  ctx.fillStyle = color;
  if (seg[0]) hseg(y + t / 2); // a
  if (seg[1]) vseg(x + w - t / 2, y, h / 2); // b
  if (seg[2]) vseg(x + w - t / 2, y + h / 2, h / 2); // c
  if (seg[3]) hseg(y + h - t / 2); // d
  if (seg[4]) vseg(x + t / 2, y + h / 2, h / 2); // e
  if (seg[5]) vseg(x + t / 2, y, h / 2); // f
  if (seg[6]) hseg(y + h / 2); // g
}

/* tiny fuel-pump icon + live dot gauge, bottom row of the real MK1
   cluster. One dot lights per gas can collected; when the tank is nearly
   dry the last lit dot blinks orange, like the photo's low-fuel warning */
function drawFuelGauge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ui: number,
  segColor: string,
  fuel: number,
  time: number,
  flash: boolean,
): { x: number; y: number } {
  // pump body
  const bw = 6 * ui;
  const bh = 8 * ui;
  ctx.fillStyle = segColor;
  ctx.fillRect(
    Math.round(x),
    Math.round(y - bh),
    Math.round(bw),
    Math.round(bh),
  );
  // pump screen (LCD-coloured cutout)
  ctx.fillStyle = "#a7c57d";
  ctx.fillRect(
    Math.round(x + 1.2 * ui),
    Math.round(y - bh + 1.2 * ui),
    Math.max(1, Math.round(bw - 2.4 * ui)),
    Math.max(1, Math.round(2.2 * ui)),
  );
  // hose out the right side
  ctx.fillStyle = segColor;
  ctx.fillRect(
    Math.round(x + bw),
    Math.round(y - bh + 1 * ui),
    Math.max(1, Math.round(1.4 * ui)),
    Math.max(1, Math.round(4 * ui)),
  );

  // gauge dots fill left-to-right with the tank level; near empty, the
  // last lit dot blinks orange — the rest stay as empty rings
  const dots = FUEL_MAX;
  const lit = Math.ceil(fuel);
  const low = fuel <= 1.5;
  const blinkOn = Math.floor(time * 2.5) % 2 === 0;
  const r = Math.max(1, 1.5 * ui);
  const step = 3.6 * ui;
  const dotsX = x + bw + 6 * ui;
  const dotsY = y - r;
  for (let i = 0; i < dots; i++) {
    const cx = dotsX + i * step;
    ctx.beginPath();
    ctx.arc(cx, dotsY, r, 0, Math.PI * 2);
    if (i < lit) {
      if (low && i === lit - 1) {
        ctx.fillStyle = blinkOn ? "#e2703a" : "rgba(226,112,58,0.3)";
      } else if (flash) {
        // pickup feedback: the whole gauge pops orange for a beat
        ctx.fillStyle = "#e2703a";
      } else {
        ctx.fillStyle = segColor;
      }
      ctx.fill();
    } else {
      ctx.strokeStyle = segColor;
      ctx.lineWidth = Math.max(1, 0.7 * ui);
      ctx.stroke();
    }
  }

  // "1/2" above the middle dot, "1" above the last — like the real panel
  ctx.fillStyle = segColor;
  ctx.font = `${Math.round(4.5 * ui)}px monospace`;
  ctx.fillText("1/2", dotsX + 3 * step - 3 * ui, dotsY - 3.2 * ui);
  ctx.fillText("1", dotsX + 7 * step, dotsY - 3.2 * ui);

  // where the dots row sits — the "+1" pickup popup floats up from here
  return { x: dotsX, y: dotsY - 3.2 * ui };
}

function renderCluster(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  kmh: number,
  score: number,
  fuel: number,
  time: number,
  flash: boolean,
  topLeft = false,
): { x: number; y: number } {
  const ui = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
  const pw = Math.round(150 * ui);
  const ph = Math.round(52 * ui);
  // bottom-right on desktop; top-left on touch devices so the on-screen
  // pedals (bottom corners) never cover the readout
  const x0 = topLeft ? Math.round(8 * ui) : width - pw - Math.round(8 * ui);
  const y0 = topLeft
    ? Math.round(TOUCH_CLUSTER_TOP * ui)
    : height - ph - Math.round(8 * ui);
  const pad = Math.round(3 * ui);
  const segColor = "#243320";
  const ghostColor = "rgba(36,51,32,0.10)";

  // bezel + LCD inset
  ctx.fillStyle = "#141611";
  ctx.beginPath();
  ctx.roundRect(x0, y0, pw, ph, Math.round(6 * ui));
  ctx.fill();
  ctx.fillStyle = "#a7c57d";
  ctx.beginPath();
  ctx.roundRect(
    x0 + pad,
    y0 + pad,
    pw - pad * 2,
    ph - pad * 2,
    Math.round(4 * ui),
  );
  ctx.fill();

  // big speed readout: ghost 8s behind the active digits, like a real LCD
  const size = 13 * ui;
  const gap = 3 * ui;
  const digitW = size + gap;
  const digitsX = x0 + pad + Math.round(7 * ui);
  const digitsY = y0 + pad + Math.round(12 * ui);
  const text = String(Math.min(999, Math.round(kmh))).padStart(3, " ");
  for (let i = 0; i < 3; i++) {
    drawSevenSeg(ctx, digitsX + i * digitW, digitsY, size, "8", ghostColor);
    if (text[i] !== " ") {
      drawSevenSeg(ctx, digitsX + i * digitW, digitsY, size, text[i], segColor);
    }
  }

  ctx.fillStyle = segColor;
  ctx.font = `${Math.round(6 * ui)}px monospace`;
  ctx.fillText(
    "km/h",
    digitsX + 3 * digitW + Math.round(2 * ui),
    digitsY + size * 2,
  );

  // top-right readout counts the SCORE (where the real cluster shows trip)
  const tSize = 5 * ui;
  const tGap = 1.5 * ui;
  const tW = tSize + tGap;
  const scoreText = String(Math.floor(score)).padStart(5, " ");
  const scoreX = x0 + pw - pad - Math.round(7 * ui) - scoreText.length * tW;
  const scoreY = y0 + pad + Math.round(4 * ui);
  for (let i = 0; i < scoreText.length; i++) {
    drawSevenSeg(ctx, scoreX + i * tW, scoreY, tSize, "8", ghostColor);
    if (scoreText[i] !== " ") {
      drawSevenSeg(ctx, scoreX + i * tW, scoreY, tSize, scoreText[i], segColor);
    }
  }

  // live fuel gauge, bottom row (below the km/h legend)
  return drawFuelGauge(
    ctx,
    digitsX + 3 * digitW + 2 * ui,
    y0 + ph - pad - 3 * ui,
    ui,
    segColor,
    fuel,
    time,
    flash,
  );
}

/* cockpit mode: the dash art has the MK1's real central cluster screen
   baked in (detected by build-cockpit.mjs) — paint the live readouts
   straight onto it: deep green LCD glass, bright green 7-segment digits
   (both colours sampled off the generated art) */
function renderDashCluster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  kmh: number,
  score: number,
  fuel: number,
  time: number,
  flash: boolean,
): { x: number; y: number } {
  const u = h / 19; // the baked screen is 19px tall on the 480x270 master
  ctx.fillStyle = "#23522d";
  ctx.beginPath();
  ctx.roundRect(
    Math.round(x),
    Math.round(y),
    Math.round(w),
    Math.round(h),
    Math.max(1, Math.round(2 * u)),
  );
  ctx.fill();
  const segColor = "#87de73";
  const ghostColor = "rgba(135,222,115,0.10)";

  // big speed readout, left
  const size = 6.2 * u;
  const gap = 2.2 * u;
  const digitW = size + gap;
  const digitsX = x + 3.5 * u;
  const digitsY = y + (h - size * 2) / 2;
  const text = String(Math.min(999, Math.round(kmh))).padStart(3, " ");
  for (let i = 0; i < 3; i++) {
    drawSevenSeg(ctx, digitsX + i * digitW, digitsY, size, "8", ghostColor);
    if (text[i] !== " ") {
      drawSevenSeg(ctx, digitsX + i * digitW, digitsY, size, text[i], segColor);
    }
  }
  ctx.fillStyle = segColor;
  ctx.font = `${Math.max(3, Math.round(3.2 * u))}px monospace`;
  ctx.fillText(
    "km/h",
    Math.round(digitsX + 3 * digitW + 1 * u),
    Math.round(digitsY + size * 2),
  );

  // score where the real cluster shows the trip counter, top-right
  const tSize = 3.1 * u;
  const tGap = 1.1 * u;
  const tW = tSize + tGap;
  const scoreText = String(Math.floor(score)).padStart(5, " ");
  const scoreX = x + w - 2.5 * u - scoreText.length * tW;
  const scoreY = y + 2 * u;
  for (let i = 0; i < scoreText.length; i++) {
    drawSevenSeg(ctx, scoreX + i * tW, scoreY, tSize, "8", ghostColor);
    if (scoreText[i] !== " ") {
      drawSevenSeg(ctx, scoreX + i * tW, scoreY, tSize, scoreText[i], segColor);
    }
  }

  // fuel dots, bottom-right: same semantics as the floating panel's gauge
  // (lit dots, pickup flash, low-fuel blink), minus the pump and legends —
  // no room for them on the baked screen
  const dots = FUEL_MAX;
  const lit = Math.ceil(fuel);
  const low = fuel <= 1.5;
  const blinkOn = Math.floor(time * 2.5) % 2 === 0;
  const r = Math.max(1, 1.05 * u);
  const step = 3 * u;
  const dotsX = x + w - 2.5 * u - (dots - 1) * step - r;
  const dotsY = y + h - 3.2 * u;
  for (let i = 0; i < dots; i++) {
    const cx = dotsX + i * step;
    ctx.beginPath();
    ctx.arc(Math.round(cx), Math.round(dotsY), r, 0, Math.PI * 2);
    if (i < lit) {
      if (low && i === lit - 1) {
        ctx.fillStyle = blinkOn ? "#e2703a" : "rgba(226,112,58,0.3)";
      } else {
        ctx.fillStyle = flash ? "#e2703a" : segColor;
      }
      ctx.fill();
    } else {
      ctx.strokeStyle = segColor;
      ctx.lineWidth = Math.max(1, 0.5 * u);
      ctx.stroke();
    }
  }

  // "+1" pickup popup floats up from the dots row
  return { x: dotsX, y: dotsY - 2 * u };
}

/* anime-style speed streaks hugging the road edges: each streak lies on a
   line from the vanishing point through a spot just off the rumble strip,
   so they stream past PARALLEL to the road edges (t² easing compresses
   them near the horizon, like the road itself). The vanishing point
   follows the car's own turning only — while the car runs straight the
   streaks stream straight, even mid-curve; they swing when the player
   actually steers */
function renderSpeedLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  speedPercent: number,
  time: number,
  roadNearX: number,
  roadNearW: number,
  horizonY: number,
  vanishX: number,
) {
  if (speedPercent < 0.4) return;
  const intensity = (speedPercent - 0.4) / 0.6;
  const count = Math.round(4 + 6 * intensity);
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    // deterministic per-line randomness, re-rolled a few times a second
    const seed = i * 61 + Math.floor(time * 16);
    const rand = Math.sin(seed * 127.1) * 43758.5453;
    const r = rand - Math.floor(rand);
    const side = i % 2 === 0 ? -1 : 1;
    // keep the stroke in the OUTER band of its path: the road only reads
    // straight near the camera, so a stroke that reaches back toward the
    // vanishing point cuts diagonally across the lanes in every bend and
    // looks like a rendering glitch. Short stubs near the road edges still
    // sell the speed without crossing the tarmac
    const tt = (r + time * (1.2 + 2.5 * intensity)) % 1;
    const t0 = 0.45 + 0.55 * tt;
    const t1 = Math.min(1, t0 + 0.04 + 0.08 * intensity);
    const bx = roadNearX + side * roadNearW * (1.06 + r * 0.25);
    const by = height + 4;
    const vx = vanishX + side * width * 0.015;
    const vy = horizonY;
    const e0 = t0 * t0;
    const e1 = t1 * t1;
    ctx.strokeStyle = `rgba(255,255,255,${(0.1 + 0.18 * intensity) * (t0 * t0)})`;
    ctx.lineWidth = Math.max(1, (1 + 3 * t0) * (height / 270));
    ctx.beginPath();
    ctx.moveTo(vx + (bx - vx) * e0, vy + (by - vy) * e0);
    ctx.lineTo(vx + (bx - vx) * e1, vy + (by - vy) * e1);
    ctx.stroke();
  }
}

/* rearview mirror: a SIMULATED rear view — no re-render of the world, but
   the same pseudo-3d projection as the main road (extentofthejam.com/pseudo)
   miniaturized into the glass, looking BACKWARD: segment curves accumulate
   in reverse (backward dx/ddx walk), so a right-hand bend the car just
   drove through leaves the road behind receding to the LEFT — a plane
   mirror flips depth, not left/right, and this matches it. Steering left
   shifts the mirrored road right, as it should. Hills come straight from
   the segments' stored world.y (the site's #hills trick): rings rise and
   fall with the real terrain, and the far side of a crest is hidden by the
   same maxY clip rule as the main renderer. The visible road starts
   ZOFF segments behind the bumper (a real mirror never shows it) — that
   alone calms the stream, since the 1/z flow rate explodes near z=0. */
function renderMirror(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  position: number,
  playerX: number,
  /** the car's world y (interpolated at its segment) — hills reference */
  carY: number,
  segments: Segment[],
  /** smoothed -curve×speed — the cornering sway that swings the glass */
  sway: number,
  /** lap difficulty multipliers — the mirrored world must match the real one */
  curveGain: number,
  hillGain: number,
  /** absolute index of the oldest segment still held in the ring */
  firstIdx: number,
) {
  ctx.save();
  // keep the scene inside the rounded mirror glass
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(1, Math.round(h * 0.2)));
  ctx.clip();

  const horizon = y + h * 0.45;
  const bottom = y + h;
  // mid-corner the whole mirrored world swings against the bend — the
  // vanishing point rides the sway, so even before the bend itself
  // recedes into view you FEEL the turn in the glass
  const cx = x + w / 2 + sway * w * 0.06;

  // sunset sky, same palette as the main backdrop
  const sky = ctx.createLinearGradient(0, y, 0, horizon);
  sky.addColorStop(0, "#1a1c3f");
  sky.addColorStop(0.7, "#7a3b69");
  sky.addColorStop(1, "#e2703a");
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, horizon - y);
  // ground
  ctx.fillStyle = "#377934";
  ctx.fillRect(x, horizon, w, bottom - horizon);

  // ring view of the endless track: slots are absolute index % capacity,
  // valid back to firstIdx (older slots have been overwritten)
  const ringSeg = (absIdx: number) => segments[absIdx % segments.length];
  const DD = 20; // segments of road behind shown in the glass
  const segIdx = Math.floor(position / SEGMENT_LENGTH);
  const frac = (position % SEGMENT_LENGTH) / SEGMENT_LENGTH;

  // world-x of each segment boundary behind the car, relative to the car:
  // reverse-walk the curve accumulation (wrap-safe — no absolute centers
  // needed). Forward is x += dx, dx += curve; backward both invert.
  // world-y needs no walk: boundary heights are stored per segment.
  const ringX: number[] = [0];
  const ringY: number[] = [0];
  let hdx = 0;
  for (let k = 1; k <= DD; k++) {
    if (segIdx - k < firstIdx) {
      // the ring's edge — only reachable in the run's first seconds:
      // hold the last known ring flat instead of reading overwritten slots
      ringX.push(ringX[k - 1]);
      ringY.push(0);
      continue;
    }
    const seg = ringSeg(segIdx - k);
    hdx -= seg.curve * curveGain;
    ringX.push(ringX[k - 1] - hdx);
    ringY.push(seg.p1.world.y * hillGain - carY);
  }

  // the honest curve offsets (x/RW of the road width) are invisible at
  // mirror scale — the glass is a feel instrument, so the lateral read is
  // amplified. playerX stays 1:1: steering left pushes the road right
  const LATERAL_GAIN = 3.5;
  // the mirror shows the road starting ZOFF segments behind the bumper —
  // calms the stream (1/z flow explodes near z=0) and matches a real
  // rearview, which never shows the car's own tail
  const ZOFF = 1.8;
  // effective camera height in world units — how strongly a hill lifts
  // a ring off the ground line (main engine uses CAMERA_HEIGHT = 1000)
  const MIRROR_CAM_H = 1200;

  // ring k sits (k - frac + ZOFF) segments behind the bumper; perspective
  // factor is 1/z for the y drop, the road half-width AND the hill lift
  const ringAt = (k: number) => {
    const z = (k - frac + ZOFF) * SEGMENT_LENGTH;
    const persp = (0.7 * SEGMENT_LENGTH) / z;
    return {
      persp,
      ry: horizon + (bottom - horizon) * persp * (1 - ringY[k] / MIRROR_CAM_H),
      rw: w * 0.5 * persp,
      rx:
        cx +
        ((ringX[k] * LATERAL_GAIN - playerX * ROAD_WIDTH) / ROAD_WIDTH) *
          (w * 0.5 * persp),
    };
  };

  // apron: the road continues from the nearest ring down to the glass
  // bottom. rx/rw are linear in persp through the vanishing point, so the
  // ring-0 edges extrapolate cleanly to persp = 1. Without this a grass
  // gap breathes under the road once per segment, right after frac resets
  let maxY = bottom;
  const vis: boolean[] = new Array(DD + 1).fill(false);
  const r0 = ringAt(0);
  if (r0.persp < 1) {
    const apron = {
      ry: Math.min(
        bottom,
        horizon + (bottom - horizon) * (1 - ringY[0] / MIRROR_CAM_H),
      ),
      rw: r0.rw / r0.persp,
      rx: cx + (r0.rx - cx) / r0.persp,
    };
    if (apron.ry > r0.ry) {
      const seg = ringSeg(Math.max(firstIdx, segIdx));
      polygon(
        ctx,
        apron.rx - apron.rw,
        apron.ry,
        apron.rx + apron.rw,
        apron.ry,
        r0.rx + r0.rw,
        r0.ry,
        r0.rx - r0.rw,
        r0.ry,
        seg.color.road,
      );
      if (seg.color.lane !== seg.color.road) {
        for (let lane = 1; lane < LANES; lane++) {
          const off = (lane * 2) / LANES - 1;
          const lxn = apron.rx + off * apron.rw;
          const lxf = r0.rx + off * r0.rw;
          const lw1 = Math.max(1, apron.rw / 32);
          const lw2 = Math.max(1, r0.rw / 32);
          polygon(
            ctx,
            lxn - lw1,
            apron.ry,
            lxn + lw1,
            apron.ry,
            lxf + lw2,
            r0.ry,
            lxf - lw2,
            r0.ry,
            seg.color.lane,
          );
        }
      }
      maxY = r0.ry;
      vis[0] = true;
    }
  }

  // hills need the main renderer's occlusion rule, which walks NEAR→FAR:
  // skip strips that climb back down the far side of a crest (far edge
  // below the near edge) or sit below the highest line drawn so far
  for (let n = 0; n < DD; n++) {
    const near = ringAt(n);
    const far = ringAt(n + 1);
    if (far.ry >= near.ry || far.ry >= maxY) continue;
    const seg = ringSeg(Math.max(firstIdx, segIdx - n));
    // road strip, alternating shades like the main road
    polygon(
      ctx,
      near.rx - near.rw,
      near.ry,
      near.rx + near.rw,
      near.ry,
      far.rx + far.rw,
      far.ry,
      far.rx - far.rw,
      far.ry,
      seg.color.road,
    );
    // 3 lanes → 2 dashed lines, on "light" segments only (as on the road)
    if (seg.color.lane !== seg.color.road) {
      for (let lane = 1; lane < LANES; lane++) {
        const off = (lane * 2) / LANES - 1; // ±1/3 of the half-width
        const lxn = near.rx + off * near.rw;
        const lxf = far.rx + off * far.rw;
        const lw1 = Math.max(1, near.rw / 32);
        const lw2 = Math.max(1, far.rw / 32);
        polygon(
          ctx,
          lxn - lw1,
          near.ry,
          lxn + lw1,
          near.ry,
          lxf + lw2,
          far.ry,
          lxf - lw2,
          far.ry,
          seg.color.lane,
        );
      }
    }
    maxY = far.ry;
    vis[n] = true;
    vis[n + 1] = true;
  }

  /* roadside flavor — a SEPARATE little world, pure feel: each segment
     behind the car seeds its own deterministic random object (tree / sign
     / light pole). These are NOT the real roadside sprites we passed —
     they live only in the glass and stream toward the horizon with the
     road, far to near */
  const hash01 = (n: number) => {
    const r = Math.sin(n * 127.1) * 43758.5453;
    return r - Math.floor(r);
  };
  for (let k = DD; k >= 1; k--) {
    if (!vis[k]) continue; // hidden behind a crest
    const seed = Math.max(0, segIdx - k) * 3;
    const r1 = hash01(seed + 1);
    if (r1 > 0.55) continue; // ~55% of segments carry an object
    const ring = ringAt(k);
    if (ring.rw < 2) continue; // too far to matter
    const r2 = hash01(seed + 2);
    const r3 = hash01(seed + 3);
    const side = r2 < 0.5 ? -1 : 1;
    const ox = Math.round(ring.rx + side * ring.rw * (1.15 + r3 * 0.45));
    const oy = Math.round(ring.ry);
    const s = ring.rw * 0.42; // object size unit, scales with the road
    const type = r1 / 0.55; // 0..1
    if (type < 0.5) {
      // tree: stubby trunk + triangle canopy
      ctx.fillStyle = "#5a3a28";
      ctx.fillRect(
        Math.round(ox - s * 0.06),
        Math.round(oy - s * 0.42),
        Math.max(1, Math.round(s * 0.12)),
        Math.max(1, Math.round(s * 0.42)),
      );
      polygon(
        ctx,
        Math.round(ox - s * 0.42),
        Math.round(oy - s * 0.35),
        Math.round(ox + s * 0.42),
        Math.round(oy - s * 0.35),
        ox,
        Math.round(oy - s * 1.15),
        ox,
        Math.round(oy - s * 1.15),
        "#2e7a37",
      );
    } else if (type < 0.78) {
      // sign: gray pole, white board with an orange top band
      ctx.fillStyle = "#8a8a8f";
      ctx.fillRect(
        ox,
        Math.round(oy - s * 0.8),
        Math.max(1, Math.round(s * 0.07)),
        Math.max(1, Math.round(s * 0.8)),
      );
      ctx.fillStyle = "#e8e8e8";
      ctx.fillRect(
        Math.round(ox - s * 0.28),
        Math.round(oy - s * 1.05),
        Math.max(1, Math.round(s * 0.56)),
        Math.max(1, Math.round(s * 0.32)),
      );
      ctx.fillStyle = "#e2703a";
      ctx.fillRect(
        Math.round(ox - s * 0.28),
        Math.round(oy - s * 1.05),
        Math.max(1, Math.round(s * 0.56)),
        Math.max(1, Math.round(s * 0.1)),
      );
    } else {
      // light pole: tall thin mast, glowing head leaning toward the road
      ctx.fillStyle = "#3a3a40";
      ctx.fillRect(
        ox,
        Math.round(oy - s * 1.25),
        Math.max(1, Math.round(s * 0.06)),
        Math.max(1, Math.round(s * 1.25)),
      );
      ctx.fillStyle = "#d7ff9e";
      ctx.fillRect(
        Math.round(side === 1 ? ox - s * 0.2 : ox),
        Math.round(oy - s * 1.3),
        Math.max(1, Math.round(s * 0.2)),
        Math.max(1, Math.round(s * 0.09)),
      );
    }
  }

  // glass tint so the scene reads as a reflection, not a window
  ctx.fillStyle = "rgba(20,22,40,0.28)";
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

export interface RacerEngine {
  update(dt: number, input: RacerInput): void;
  render(ctx: CanvasRenderingContext2D): void;
  /** re-fit the renderer to a new buffer size (device rotated mid-run):
      game state is kept, only the prebuilt backdrop layers are rebuilt */
  resize(width: number, height: number): void;
  state: EngineState;
  /** leaderboard top scores to chase this run (ascending, deduped) —
      crossing one fires the centre "NEW <label> RECORD!" banner once */
  setRecordTargets(targets: { score: number; label: string }[]): void;
  /** dev-only (e2e probes): the next active gas can ahead of the car,
      with its effective lateral position after the level spread */
  debugNextPickup?: () => {
    absIndex: number;
    x: number;
    big: boolean;
    golden: boolean;
  } | null;
  /** dev-only (e2e probes): last render's road-fill diagnostics — how far
      above the buffer bottom the nearest painted road line sat (a large
      gap means the near gap-fill painted a big fake road) plus cull counts */
  probe?: {
    nearGap: number;
    firstPainted: number;
    culledBehind: number;
    culledBackface: number;
    culledMaxY: number;
    respawn: number;
    offRoad: boolean;
    baseIndex: number;
    position: number;
    firstIdx: number;
    genCount: number;
    yAhead: number[];
    profile: number[];
    segDiag: {
      n: number;
      p1z: number;
      p1camY: number;
      p1sy: number;
      p2camY: number;
      p2sy: number;
      wy: number;
      culled: string;
    }[];
  };
}

export function createEngine(opts: {
  segments: Segment[];
  /** the track never loops: the generator appends sections on demand
      into a ring so at least `upToAbsIndex` absolute segments exist;
      absolute index i lives at segments[i % segments.length] */
  extend: (upToAbsIndex: number) => void;
  /** absolute index of the oldest segment still held in the ring */
  firstIndex: () => number;
  /** absolute count of segments generated so far */
  generated: () => number;
  roadside: RoadsideSprite[];
  car: CarFrames;
  gasCan: CarFrame;
  /** gold-tinted copy of the gas can sprite, for the rare golden pickups */
  gasCanGolden?: CarFrame;
  /** cockpit overlay sprites — null when the assets are missing (chase-only) */
  cockpit?: CockpitSprites | null;
  /** initial camera; forced to "chase" when no cockpit sprites are loaded */
  view?: RacerView;
  reduceMotion?: boolean;
  /** buffer size — portrait viewports get a taller buffer so the game
      fills the phone screen instead of letterboxing into a thin strip */
  width?: number;
  height?: number;
  /** touch devices: LCD cluster goes top-left so the pedals don't cover it */
  clusterTopLeft?: boolean;
  /** fired when the car drives through a gas can (big = the 3-dot every-
      10th ones, golden = the rare 3-dot + boost ones) */
  onPickup?: (big: boolean, golden?: boolean) => void;
  /** fired when a streak ladder step is crossed (+3/+5/+8 s at 3/5/each
      multiple of 10 — the ladder repeats every 10 cans) */
  onStreak?: (streak: number) => void;
  /** fired on a crash respawn (stranded off-road or pothole) */
  onCrash?: () => void;
  /** dev-only (e2e probes): collect per-render road diagnostics into
      `probe` — off in production so the game ships zero per-frame garbage */
  debug?: boolean;
}): RacerEngine {
  const {
    segments,
    extend,
    firstIndex,
    generated: generatedCount,
    roadside,
    car,
    gasCan,
    gasCanGolden,
    reduceMotion,
    debug = false,
  } = opts;
  const cockpit = opts.cockpit ?? null;
  // mutable so resize() can re-fit the renderer when the device rotates
  let width = opts.width ?? RACER_WIDTH;
  let height = opts.height ?? RACER_HEIGHT;
  // ring window over the infinite track: ~10 s of flat-out driving stays
  // generated ahead, old slots are overwritten by the generator (render
  // reads 180 ahead, the rearview mirror walks 20 behind — ample cushion)
  const AHEAD_SEGMENTS = 600;
  const ringSlot = (absIdx: number) => absIdx % segments.length;
  // the generator starts empty — buffer the first stretch up front so
  // the very first update/render already has road under the car
  extend(AHEAD_SEGMENTS);

  const state: EngineState = {
    position: 0,
    playerX: 0,
    speed: 0,
    time: 0,
    distanceKm: 0,
    score: 0,
    multiplier: 1,
    respawn: 0,
    fuel: FUEL_MAX,
    boostT: 0,
    streak: 0,
    gameOver: false,
    offRoad: false,
    gear: 1,
    shiftT: 0,
    skid: 0,
    rpm01: 0,
    braking: false,
    view: opts.view === "cockpit" && cockpit ? "cockpit" : "chase",
    level: 1,
  };

  // horizon parallax offsets (Lou: horizon slides opposite the curve)
  let skyOffset = 0;
  let hillOffset = 0;
  // smoothed vanishing point for the speed streaks — follows only the
  // car's OWN turning (steering input), never the road's curves: while
  // the car runs straight the lines stream straight, they swing only
  // when the car actually turns
  let vanishX = width / 2;
  // cornering sway of the rearview mirror scene (smoothed -curve×speed) —
  // eases in and out so a hard bend swings the glass instead of snapping it
  let mirrorSway = 0;
  // distance difficulty: every LEVEL_EVERY_KM raises state.level and
  // sharpens curves / steepens hills through pure multipliers on the
  // generated track's stored values — the data never changes. The gains
  // are capped so high levels stay drivable; the level counter is not.
  // Gas cans keep their count (no extra scarcity) but drift toward the
  // road edges, so refuelling costs a wider line. drainGain is OutRun's
  // shrinking stage bonus with a deep-game squeeze: ~6%/level to ×1.5 by
  // L9, then +2.5%/level to a ×1.9 cap (~L45) so the sustainable can-miss
  // rate keeps tightening into the Challenger depths — and below 1.5 dots
  // the mercy can covers a dry stretch in the early game (level ≤
  // MERCY_MAX_LEVEL)
  let curveGain = 1;
  // physics-only grip gain: the world RENDERS with curveGain, but the
  // centrifugal push uses this softer curve so a hard bend's hold speed
  // bottoms out near ~64 km/h (cap 1.3) instead of an unmakeable ~52 —
  // sharp look, fair grip
  let curveGrip = 1;
  let hillGain = 1;
  let canSpread = 1;
  let drainGain = 1;
  let levelUpAt = -10; // engine time of the last level-up (banner)
  // engine time / tier / seconds of the last streak reward (popup variant)
  let lastStreakAt = -10;
  let lastStreakTier = 0;
  let lastStreakSecs = 0;
  // engine time of the last broken chain — drives the burn-out animation
  let lastStreakLostAt = -10;
  // mercy can: one rescue can per dry spell, injected by update() when
  // the tank runs below 1.5 dots with nothing collectible ahead
  let mercyUsed = false;
  // record chase: the leaderboard tops to beat this run (ascending) —
  // crossing one fires the centre "NEW <label> RECORD!" banner once
  let recordTargets: { score: number; label: string }[] = [];
  let recordBannerAt = -10;
  let recordBannerLabel = "";
  // engine time of the last gas-can pickup — drives the collect feedback
  // (sparkle burst at the car, gauge flash, rising "+1")
  let lastPickupAt = -10;
  // what the last pickup was worth / whether it was golden — the rising
  // popup reads these ("+1" green vs "+3" gold)
  let lastPickupAmt = 1;
  let lastPickupGolden = false;
  // collected cans fly to the streak jerrycan as a real sprite copy
  // (same frame, golden tint included) arcing from the pickup point to
  // the HUD icon — "you really bagged it". On arrival a bright yellow
  // halo flares behind the streak can
  const FLY_T = 0.55; // seconds from pickup point to the streak icon
  const flyCans: {
    sx: number;
    sy: number;
    t0: number;
    golden: boolean;
    big: boolean;
  }[] = [];
  let streakGlowAt = -10; // engine time of the last fly-can arrival
  // fuel sip grace right after a pickup: the gauge just lit up, so the
  // first 0.3 s of the new tank burn for free — grabbing a can at a hot
  // level no longer feels like the drain instantly eating the reward
  let pickupGrace = 0;
  // smoothed top-speed ceiling: eases toward BOOST_TOP while boost burns
  // and bleeds back to 1 over ~a second when it ends — no snap from 202
  // to 180 in a single frame
  let boostTop = 1;
  // what paid for the current boost — the centre countdown names it
  // ("STREAK BOOST 2.1s" vs "OVERFLOW BOOST 1.4s" vs "GOLDEN BOOST")
  let lastBoostSource: "streak" | "overflow" | "golden" = "overflow";
  // dev-only render diagnostics, refreshed every render (see RacerEngine.probe)
  let probe: NonNullable<RacerEngine["probe"]> = {
    nearGap: 0,
    firstPainted: -1,
    culledBehind: 0,
    culledBackface: 0,
    culledMaxY: 0,
    respawn: 0,
    offRoad: false,
    baseIndex: -1,
    position: 0,
    firstIdx: 0,
    genCount: 0,
    yAhead: [],
    profile: [],
    segDiag: [],
  };
  // scarcity ramps with score: every 1500 points hides another 1% of the
  // track's cans (capped at 40% — the cap is calibrated with the drain
  // cap so a PERFECT chain stays sustainable in the deep game while a
  // 1-in-10 miss rate slowly bleeds out; see LAP_FUEL). The divisor rides
  // the score scale — halved when the score formula went to ×0.5, so the
  // per-km ramp is unchanged.
  // Big cans (every 10th) resist at half the rate — the relief valve must
  // survive into the late game. Cans are hidden in golden-ratio order
  // over their ordinal, so the hidden ones stay evenly spread instead of
  // clumping and the hidden count matches the percentage even with few
  // cans — update() and render() must agree on this
  const pickupActive = (seg: Segment): boolean => {
    const pk = seg.pickup;
    if (!pk) return true;
    if (pk.ordinal < 0) return true; // mercy can: never scarcity-hidden
    if (pk.golden) return true; // golden can: a gift is never hidden
    const hidden = Math.min(0.4, Math.floor(state.score / 1500) * 0.01);
    if (hidden <= 0) return true;
    return (
      (pk.ordinal * 0.6180339887498949) % 1 >= (pk.big ? hidden / 2 : hidden)
    );
  };
  // steering intent captured in update(), consumed by render() to pick
  // the car frame (left/right lean)
  let pendingSteer = 0;
  // what the CAR is actually doing: chases pendingSteer through a
  // speed-dependent lag (see update) — the input can flick, the chassis
  // can't
  let appliedSteer = 0;

  // shared crash: stranded off-road, a pothole or a roadside pine all
  // cost the same — centre-line respawn, 1 fuel dot, a broken chain
  const crashRespawn = () => {
    state.respawn = RESPAWN_TIME;
    state.speed = 0;
    state.playerX = 0;
    state.fuel = Math.max(0, state.fuel - 1);
    if (state.streak > 0) lastStreakLostAt = state.time;
    state.streak = 0;
    // a crash mid-hop must not land the teleported car into a squash +
    // grip penalty it never earned
    airT = 0;
    landT = 0;
    gripT = 0;
    opts.onCrash?.();
  };

  // crest airtime: clearing a hilltop fast pops the car off the tarmac
  // for a beat, then the suspension squashes on touchdown — and the tires
  // need a moment to bite again: grip comes back over a short ramp after
  // every landing (softened steering + extra slide, "hafif" tuning)
  let prevSlope = 0;
  let lastSteepClimbAt = -10; // engine time of the last steep climb segment
  let airT = 0; // time left airborne
  let airDur = 0; // total airtime of the current hop
  let landT = 0; // landing squash timer
  let gripT = 0; // post-landing grip recovery timer (ramps 0.5 → 1 over 0.4 s)

  // prebuilt backdrop layers — rebuilt by resize() after a rotation.
  // The sky itself is NOT prebuilt: it is drawn procedurally every frame
  // so the day/night cycle can move the sun, moon and stars
  let clouds: HTMLCanvasElement;
  let hillsFar: HTMLCanvasElement;
  let hillsNear: HTMLCanvasElement;
  let skyGrad: CanvasGradient | null = null;
  let skyGradKey = "";
  const buildBackdrop = () => {
    clouds = makeClouds(width, Math.round(height * 0.34), 21);
    hillsFar = makeMountains(width, Math.round(height * 0.18), 9, "#4a2c50", 7);
    hillsNear = makeMountains(
      width,
      Math.round(height * 0.13),
      14,
      "#33203c",
      13,
    );
  };
  buildBackdrop();

  function resize(w: number, h: number) {
    if (w === width && h === height) return;
    width = w;
    height = h;
    // streak vanishing point re-centres; it re-smooths within a few frames
    vanishX = width / 2;
    buildBackdrop();
  }

  function findSegment(z: number): Segment {
    const i = Math.floor(z / SEGMENT_LENGTH);
    const c = Math.max(firstIndex(), Math.min(generatedCount() - 1, i));
    return segments[ringSlot(c)];
  }

  function update(dt: number, input: RacerInput) {
    if (state.gameOver) return;
    pendingSteer =
      input.steer !== undefined
        ? Math.max(-1, Math.min(1, input.steer))
        : input.left
          ? -1
          : input.right
            ? 1
            : 0;
    const playerSegment = findSegment(state.position + PLAYER_Z);
    const speedPercent = state.speed / MAX_SPEED;
    // post-landing grip recovery: after a crest hop touches down the tires
    // take a beat to bite — grip ramps 0.5 → 1 over 0.4 s (hafif tuning)
    gripT = Math.max(0, gripT - dt);
    const landGrip = 1 - 0.5 * (gripT / 0.4);
    // GTA-ish steering, between arcade and sim: the chassis response lags
    // the wheel just a touch and lateral authority falls with speed —
    // nimble flicks at 60 km/h, a weighted lane-drift at 180. The lag is
    // deliberately minimal (0.05 → 0.15 s): a hint of chassis weight, not
    // ice — the speed-scaled authority below is what really kills the
    // flat-out moose-test slaloms
    const steerLag = 0.05 + 0.1 * speedPercent;
    appliedSteer += (pendingSteer - appliedSteer) * Math.min(1, dt / steerLag);
    // lateral half-widths/s at full lock: 2.2 crawling → ~1.2 at 180 km/h,
    // still enough to HOLD an easy bend (worst capped drift ~1.6 vs
    // medium/hard = brake country) but never to slash across lanes; the
    // 3p gate keeps a parked car from sliding sideways
    const steerAuthority = 2.2 * (1 - 0.45 * speedPercent);
    const dx = dt * steerAuthority * Math.min(1, 3 * speedPercent);

    state.time += dt;
    // segments the car's pickup point crosses this frame — at full speed
    // a slow frame can span 2+ segments, and a can sitting on a skipped
    // one would be driven through without registering
    const prevPickupSeg = Math.floor(
      (state.position + PLAYER_Z) / SEGMENT_LENGTH,
    );
    state.position += state.speed * dt;
    const nextPickupSeg = Math.floor(
      (state.position + PLAYER_Z) / SEGMENT_LENGTH,
    );
    // display km at the same scale as the 180 km/h top speed
    state.distanceKm += speedPercent * 180 * (dt / 3600);
    // ring window: keep the road buffered ahead; the generator overwrites
    // what the car left behind
    const absIndex = Math.floor(state.position / SEGMENT_LENGTH);
    extend(absIndex + AHEAD_SEGMENTS);

    // distance difficulty: every LEVEL_EVERY_KM bumps the level — turn
    // the heat up (gains capped, level is not)
    const newLevel = Math.floor(state.distanceKm / LEVEL_EVERY_KM) + 1;
    if (newLevel > state.level) {
      state.level = newLevel;
      curveGain = Math.min(1.6, 1 + 0.08 * (state.level - 1));
      curveGrip = Math.min(1.3, 1 + 0.04 * (state.level - 1));
      hillGain = Math.min(1.5, 1 + 0.07 * (state.level - 1));
      canSpread = Math.min(1.35, 1 + 0.05 * (state.level - 1));
      // OutRun's shrinking stage bonus, with a squeeze: +6%/level to ×1.5
      // by L9 like before, then KEEPS growing +2.5%/level to a ×1.9 cap
      // (~L45) — sim-calibrated (scripts/sim-squeeze.mjs): a perfect chain
      // stays sustainable forever (lap fuel is the margin), but the
      // sustainable miss rate tightens with depth — ~15% at L14, ~10% at
      // L25-42, ~7.5% at L45+. Median death: 30% miss ≈ 26 km (~96k pts),
      // 10% ≈ 60 km (~202k), 5% ≈ 124 km (~443k). 240k (Challenger,
      // ~25 min) needs ~5-7% sustained on bot-perfect lines — humans bend
      // worse, so the real bar is higher.
      drainGain = Math.min(
        1.9,
        1 +
          0.06 * Math.min(state.level - 1, 8) +
          0.025 * Math.max(0, state.level - 9),
      );
      levelUpAt = state.time;
    }

    state.playerX += dx * appliedSteer * landGrip;
    // centrifugal push on curves (Jake Gordon), tuned so every bend has a
    // real grip-limited corner speed — the balance p·curve·grip·CENTRIFUGAL
    // = 1 gives easy ≈ flat-out, medium ≈ 125→96 km/h, hard ≈ 85→64 km/h
    // as curveGrip ramps to its 1.3 cap (the world keeps looking sharper
    // via curveGain, but the slide stays makeable with braking). Above
    // the limit the tires scrub: speed bleeds even while you stay on the
    // tarmac, so 180 km/h through a bend is never free
    const lateralRaw =
      speedPercent * playerSegment.curve * curveGrip * CENTRIFUGAL;
    // slide-speed cap: a blown corner drifts the car out over ~a second
    // (net 1.3 units/s against full lock) — enough time to feel it and
    // catch the slide, never an instant eject past the trees. The scrub
    // keeps using the raw force so the speed bleed stays honest. Right
    // after a landing the tires haven't bitten yet: the push swells by
    // 1/landGrip (≤ ×2 for 0.4 s) while steering authority shrinks, so a
    // crest straight into a bend slides wide before it answers
    const lateral = Math.max(-1.6, Math.min(1.6, lateralRaw / landGrip));
    state.playerX -= dx * lateral;
    const scrub = Math.max(0, Math.abs(lateralRaw) - 1);
    if (scrub > 0 && state.speed > 0) {
      state.speed -= scrub * TIRE_SCRUB * MAX_SPEED * dt;
    }

    // gravity along the grade: negative when the road falls away ahead
    // (pulls the car forward), positive on a climb (bleeds speed)
    const grade = Math.max(
      -GRAVITY_MAX_GRADE,
      Math.min(
        GRAVITY_MAX_GRADE,
        ((playerSegment.p2.world.y - playerSegment.p1.world.y) * hillGain) /
          SEGMENT_LENGTH,
      ),
    );
    const hillForce = ((-GRAVITY_KMH * grade) / 180) * MAX_SPEED;

    state.skid = scrub;

    // gearbox: upshift at the band top, downshift only well below it
    // (12% hysteresis). The gear is COMMITTED for the whole shift — no
    // re-evaluating mid-cut while the speed is falling, which is exactly
    // what re-triggered a downshift and pinned the car at a boundary
    const kmhNow = (state.speed / MAX_SPEED) * 180;
    if (state.shiftT <= 0) {
      let gear = state.gear;
      while (gear < GEAR_TOPS.length && kmhNow > GEAR_TOPS[gear - 1]) gear++;
      while (gear > 1 && kmhNow < GEAR_TOPS[gear - 2] * 0.88) gear--;
      if (gear !== state.gear && kmhNow > 5) state.shiftT = SHIFT_TIME;
      state.gear = gear;
    }
    state.shiftT = Math.max(0, state.shiftT - dt);
    // revs = wheel speed over the gear's top (every gear hits the redline
    // at its band top) — an upshift drops the needle by the ratio gap on
    // its own, a downshift kicks it up; no fake pitch dips needed
    state.rpm01 = Math.max(0, Math.min(1, kmhNow / GEAR_TOPS[state.gear - 1]));
    state.braking = input.brake;

    // the boost top-speed ceiling eases in AND out: when the boost burns
    // out, the extra speed bleeds off over ~a second of aero drag instead
    // of snapping back to the 180 cap in a single frame
    boostTop +=
      ((state.boostT > 0 ? BOOST_TOP : 1) - boostTop) * Math.min(1, dt * 2.2);
    const boostMix = (boostTop - 1) / (BOOST_TOP - 1); // smoothed 0..1

    if (input.gas && state.fuel > 0 && state.shiftT <= 0) {
      // throttle follows the measured km/h curve of the real car; BOOST
      // lifts the ceiling from 180 to ~194 km/h with a harder pull
      const kmh = (state.speed / MAX_SPEED) * 180;
      const normalAccel = ACCEL_KMH(kmh);
      const boostPull = Math.max(normalAccel, (180 * BOOST_TOP - kmh) * 0.4);
      const accel = normalAccel + (boostPull - normalAccel) * boostMix;
      state.speed +=
        ((accel * (1 + (BOOST_ACCEL - 1) * boostMix)) / 180) * MAX_SPEED * dt;
    } else if (input.brake) state.speed += BRAKING * dt;
    // clutch in during a shift: the car coasts almost freely (aero only),
    // none of the engine braking baked into ROLL_DRAG — a real shift
    // costs a couple of km/h, not 10
    else
      state.speed +=
        -state.speed * ROLL_DRAG * (state.shiftT > 0 ? 0.3 : 1) * dt;
    state.speed += hillForce * dt;

    state.offRoad = state.playerX < -1.1 || state.playerX > 1.1;
    if (state.offRoad && state.speed > OFFROAD_LIMIT) {
      state.speed += OFFROAD_DECEL * dt;
    }

    // pin AT the stranded threshold: the respawn check below fires the same
    // frame the car maxes out past the trees (a tighter clamp here — the old
    // ±2.2 — made FAR_OFFROAD unreachable and the teleport never happened)
    state.playerX = Math.max(
      -FAR_OFFROAD,
      Math.min(FAR_OFFROAD, state.playerX),
    );
    state.speed = Math.max(0, Math.min(MAX_SPEED * boostTop, state.speed));

    // crest hop: the road falling away steeply right after a steep climb
    // means the car just cleared a hilltop at speed — give it a short
    // hop, then a suspension squash when it sets back down. (At the crest
    // itself the per-segment slope is ~0 by construction, so the trigger
    // is the descent ramping up, armed by a steep climb <1s earlier)
    const slope =
      (playerSegment.p2.world.y - playerSegment.p1.world.y) * hillGain;
    if (slope > SEGMENT_LENGTH * 0.4) lastSteepClimbAt = state.time;
    if (
      airT <= 0 &&
      landT <= 0 &&
      slope < -SEGMENT_LENGTH * 0.1 &&
      prevSlope >= slope &&
      state.time - lastSteepClimbAt < 0.9 &&
      speedPercent > 87 / 180 && // airborne only above 87 km/h
      !state.offRoad &&
      state.respawn <= 0
    ) {
      airDur = 0.28 + 0.3 * speedPercent;
      airT = airDur;
      // style bonus for clearing the crest — scales with entry speed so a
      // full-throttle hop is worth noticeably more than a lazy one
      state.score += Math.round(150 + 400 * speedPercent);
    }
    prevSlope = slope;
    if (airT > 0) {
      airT = Math.max(0, airT - dt);
      if (airT === 0) {
        landT = 0.24;
        // touchdown: the tires are unloaded and take a beat to bite —
        // grip ramps 0.5 → 1 over 0.4 s (softened steering + extra
        // slide), so a crest into a corner is a real risk moment while
        // a straight landing only feels briefly spongy
        gripT = 0.4;
      }
    } else if (landT > 0) {
      landT = Math.max(0, landT - dt);
    }
    // rolling drag decays exponentially and would creep forever — snap a
    // coasting crawl (<2 km/h) to a full stop, but never against a
    // downhill pull (a parked car on a descent must start rolling)
    if (
      (!input.gas || state.fuel <= 0) &&
      hillForce <= 0 &&
      state.speed < MAX_SPEED * 0.01
    ) {
      state.speed = 0;
    }

    // the tank is a clock that ticks a little faster every level: nearly
    // flat per second, so pace beats crawling. At zero the engine dies
    // and the car coasts — a can grabbed while coasting still revives it
    // (OutRun's coast-over-checkpoint mercy). BOOST is pure speed and
    // risk: the burn runs at the normal rate through it. Only the 0.3 s
    // pickup grace after any can freezes the drain fully, so a fresh
    // tank never feels instantly eaten
    const drainFactor = pickupGrace > 0 ? 0 : 1;
    const fuelDrain =
      dt *
      (FUEL_DRAIN_IDLE + FUEL_DRAIN_SPEED * speedPercent * speedPercent) *
      drainGain *
      drainFactor;
    state.fuel = Math.max(0, state.fuel - fuelDrain);
    state.boostT = Math.max(0, state.boostT - dt);
    pickupGrace = Math.max(0, pickupGrace - dt);
    if (state.fuel <= 0 && state.speed <= 0) state.gameOver = true;

    if (state.respawn > 0) {
      state.respawn = Math.max(0, state.respawn - dt);
    } else {
      // gas cans: drive through one to light gauge dots (+2 for the big
      // ones). A taken can is gone for good — the road behind is never
      // revisited on an endless track. Scan EVERY segment crossed this
      // frame: at full speed a slow frame spans 2+ segments and a can on
      // a skipped one would be tunnelled through without a sound
      for (let si = prevPickupSeg; si <= nextPickupSeg; si++) {
        const seg = segments[ringSlot(si)];
        // pothole: falling in costs the same as running stranded — 1 dot,
        // a centre-line respawn and a broken chain. Consumed on impact, so
        // the standstill right after the respawn can't re-trigger it.
        // AIRBORNE cars clear holes (the wheels are off the tarmac) — but
        // landing ON one still counts: airT zeroes in the hop block above
        // before this scan runs, so a touchdown on the hole segment hits
        const hole = seg.hole;
        if (
          hole &&
          airT <= 0 &&
          Math.abs(state.playerX - hole.x) < 0.28 &&
          state.speed > MAX_SPEED * 0.02
        ) {
          seg.hole = undefined;
          crashRespawn();
          break;
        }
        // roadside pines are solid: this far off the line to clip one and
        // the run takes the stranded penalty. Signs and poles fold like
        // they would in GTA — only the trees stop a car
        for (const s of seg.sprites) {
          if (
            s.sprite === 0 &&
            Math.abs(state.playerX - s.offset) < 0.2 &&
            state.speed > MAX_SPEED * 0.02
          ) {
            crashRespawn();
            break;
          }
        }
        if (state.respawn > 0) break;
        const pk = seg.pickup;
        // scarcity-hidden cans aren't on the road — passing them neither
        // counts nor breaks a streak
        if (!pk || !pickupActive(seg)) continue;
        if (
          Math.abs(state.playerX - pk.x * canSpread) < 0.24 &&
          state.speed > MAX_SPEED * 0.02
        ) {
          const amount = pk.golden || pk.big ? 3 : 1;
          // a can grabbed with a near-full tank doesn't go to waste:
          // the overflow burns off as BOOST seconds instead
          const overflow = state.fuel + amount - FUEL_MAX;
          if (overflow > 0) {
            // floor at half a second: a can grabbed at 7.01 dots only
            // overflows 0.01, but the steer still cost something — a
            // 0.02 s boost would be an insult, not a reward
            state.boostT = Math.min(
              BOOST_MAX_T,
              state.boostT + Math.max(overflow * BOOST_PER_DOT, 0.5),
            );
            lastBoostSource = "overflow";
          }
          if (pk.golden) {
            // golden can: a flat 1 s of BOOST on top of the 3 dots —
            // the label outranks an overflow grant from the same pickup
            state.boostT = Math.min(BOOST_MAX_T, state.boostT + GOLDEN_BOOST_T);
            lastBoostSource = "golden";
          }
          state.fuel = Math.min(FUEL_MAX, state.fuel + amount);
          seg.pickup = undefined;
          lastPickupAt = state.time;
          lastPickupAmt = amount;
          lastPickupGolden = pk.golden ?? false;
          // the bagged can itself flies to the streak icon — anchored
          // where the car sits (mid-windshield in the cockpit view)
          flyCans.push({
            sx: width / 2,
            sy: height * (state.view === "cockpit" ? 0.3 : 0.55),
            t0: state.time,
            golden: pk.golden ?? false,
            big: pk.big ?? false,
          });
          pickupGrace = PICKUP_GRACE_T;
          state.streak += 1;
          // chain reward: crossing a ladder step pays bonus BOOST seconds
          // (the ladder repeats every 10 cans — the flame HUD is the
          // promise, this is the payoff)
          const reward = streakReward(state.streak);
          if (reward) {
            state.boostT = Math.min(BOOST_MAX_T, state.boostT + reward);
            lastBoostSource = "streak";
            lastStreakAt = state.time;
            lastStreakTier = state.streak;
            lastStreakSecs = reward;
            opts.onStreak?.(state.streak);
            // a completed clean lap (every multiple of 10) also pays fuel
            // dots — this bonus is the perfect chain's survival margin in
            // the capped deep game, and a single miss never earns it
            if (state.streak % 10 === 0) {
              const lapOverflow = state.fuel + LAP_FUEL - FUEL_MAX;
              if (lapOverflow > 0) {
                state.boostT = Math.min(
                  BOOST_MAX_T,
                  state.boostT + Math.max(lapOverflow * BOOST_PER_DOT, 0.5),
                );
              }
              state.fuel = Math.min(FUEL_MAX, state.fuel + LAP_FUEL);
            }
          }
          opts.onPickup?.(pk.big ?? false, pk.golden ?? false);
        } else {
          // an active can was on this segment and we drove past it —
          // the chain is broken (and the HUD gets to burn the can away)
          if (state.streak > 0) lastStreakLostAt = state.time;
          state.streak = 0;
        }
      }
      // mercy can: below 1.5 dots with nothing collectible in the next ~90
      // segments, one can materialises on a reachable line ~60 segments
      // out — once per dry spell, and only in the early game (level ≤
      // MERCY_MAX_LEVEL): past that the economy must carry the run
      if (state.fuel >= 2) mercyUsed = false;
      if (
        state.fuel < 1.5 &&
        !mercyUsed &&
        state.speed > 0 &&
        state.level <= MERCY_MAX_LEVEL
      ) {
        const playerSegIdx = Math.floor(
          (state.position + PLAYER_Z) / SEGMENT_LENGTH,
        );
        let canAhead = false;
        for (let si = playerSegIdx; si < playerSegIdx + 90; si++) {
          const seg = segments[ringSlot(si)];
          if (seg.index === si && seg.pickup && pickupActive(seg)) {
            canAhead = true;
            break;
          }
        }
        if (!canAhead) {
          const spot = segments[ringSlot(playerSegIdx + 60)];
          if (spot.index === playerSegIdx + 60 && !spot.pickup) {
            spot.pickup = {
              x: Math.max(-0.7, Math.min(0.7, state.playerX)) / canSpread,
              ordinal: -1,
            };
            mercyUsed = true;
          }
        }
      }
      // stranded on the grass past the rumble strips: respawn on the
      // centre line at a standstill with a breathing fade-in — and a
      // 1-dot fuel penalty, so crashing directly shortens the run
      if (Math.abs(state.playerX) >= FAR_OFFROAD) crashRespawn();
    }

    // score: metres driven at HALF rate, multiplied when cruising fast
    // AND clean — off-road or respawning drops the multiplier back to x1.
    // The 170+ tier exists to keep flat-out driving worth the fuel and the
    // risk: without it the optimal strategy collapses to a steady 150
    // cruise. (×0.5 scale: keeps 100k a marquee number — ~22 min flat out)
    const kmh = (state.speed / MAX_SPEED) * 180;
    state.multiplier =
      state.offRoad || state.respawn > 0
        ? 1
        : kmh > 170
          ? 4
          : kmh > 150
            ? 3
            : kmh > 110
              ? 2
              : 1;
    state.score += ((kmh * dt) / 3.6) * state.multiplier * 0.5;

    // record chase: each leaderboard top crossed fires the centre banner
    // once — targets arrive ascending, so the first is always the next
    while (recordTargets.length > 0 && state.score > recordTargets[0].score) {
      recordBannerLabel = recordTargets[0].label;
      recordBannerAt = state.time;
      recordTargets = recordTargets.slice(1);
    }

    // horizon drifts opposite the current curve, faster with speed
    // (rates eased 30% down from Jake's 2.5/5 — gentler mountain parallax)
    skyOffset += playerSegment.curve * curveGain * speedPercent * dt * 1.75;
    hillOffset += playerSegment.curve * curveGain * speedPercent * dt * 3.5;
  }

  function render(ctx: CanvasRenderingContext2D) {
    const baseSegment = findSegment(state.position);
    const basePercent = (state.position % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerSegment = findSegment(state.position + PLAYER_Z);
    const playerPercent =
      ((state.position + PLAYER_Z) % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerY =
      interpolate(
        playerSegment.p1.world.y,
        playerSegment.p2.world.y,
        playerPercent,
      ) * hillGain;
    // first-person: the dash hides the bottom of the frame, so the whole
    // world is pitched up into the windshield — a plain screen-space y
    // shift on the projection (camera tilt). Horizon, hills, sprites and
    // the hill-clip logic all derive from projected y, so they follow.
    const cockpitMode = state.view === "cockpit" && cockpit !== null;
    // crest hop, computed up front: parabolic lift while airborne, a short
    // damped squash on touchdown. Chase cam SHOWS the car hopping; in the
    // cockpit you ARE the car, so the world sinks by the lift instead and
    // rises a touch on landing (suspension) while the dash takes the thump
    const speedPercent = state.speed / MAX_SPEED;
    const airP = airDur > 0 && airT > 0 ? 1 - airT / airDur : 0;
    const lift =
      airT > 0
        ? Math.sin(airP * Math.PI) * height * (0.02 + 0.02 * speedPercent)
        : 0;
    const landP = landT > 0 ? 1 - landT / 0.24 : 0;
    const dip = landT > 0 ? Math.sin(landP * Math.PI) * height * 0.008 : 0;
    const yShift = cockpitMode
      ? -Math.round(height * (width < RACER_WIDTH ? 0.4 : 0.3)) +
        Math.round(lift - dip * 0.25)
      : 0;

    // ── background ──
    // hill parallax rides the terrain vertically (Jake Gordon v3/final:
    // resolution * layerSpeed * playerY, resolution = height/480). Sky and
    // clouds keep their own slower rates, but BOTH mountain bands share the
    // same horizon line: with separate rates the near band outclimbed the
    // far band on ascents and its bases floated against the sky — two
    // ranges stand on the same ground line
    const resolution = height / 480;
    const skyShiftY = resolution * 0.001 * playerY;
    const cloudShiftY = resolution * 0.0015 * playerY;
    const farShiftY = resolution * 0.002 * playerY;
    const horizonY = Math.round(height / 2 - farShiftY) + yShift;

    // ── day/night sky: procedural gradient + sun, moon and stars ──
    const dayT = (state.time / DAY_LENGTH) % 1;
    const skySt = skyStateAt(dayT);
    const skyH = Math.round(height * 0.62);
    const topColor = rgb(skySt.stops[0]);
    // any vertical parallax peeks a strip of void above the sky — fill it
    // with the sky's own top colour. Both signs: downhill slides the
    // gradient up off-screen, uphill starts it lower, and an unpainted
    // strip would keep whatever the previous frames left there (a night
    // sky's dark band surviving into the day was the visible symptom)
    if (skyShiftY !== 0) {
      ctx.fillStyle = topColor;
      ctx.fillRect(0, 0, width, Math.ceil(Math.abs(skyShiftY)));
    }
    if (skyGradKey !== `${skyStateKey}:${height}`) {
      skyGradKey = `${skyStateKey}:${height}`;
      const g = ctx.createLinearGradient(0, 0, 0, skyH);
      g.addColorStop(0, topColor);
      g.addColorStop(0.55, rgb(skySt.stops[1]));
      g.addColorStop(0.8, rgb(skySt.stops[2]));
      g.addColorStop(1, rgb(skySt.stops[3]));
      skyGrad = g;
    }
    ctx.fillStyle = skyGrad as CanvasGradient;
    ctx.fillRect(0, Math.round(-skyShiftY), width, skyH);

    // sun arcs over the day half of the cycle, the moon over the night
    // half — pixel squares to match the art direction; both sink to the
    // horizon line at the edges of their window
    const celestial = (s: number, color: string, r: number) => {
      const cxC = Math.round(width * (0.2 + 0.6 * s));
      const cyC = Math.round(horizonY - Math.sin(s * Math.PI) * height * 0.32);
      ctx.fillStyle = color;
      ctx.fillRect(cxC - r, cyC - r, r * 2, r * 2);
      return [cxC, cyC];
    };
    if (dayT < 0.55) {
      celestial(dayT / 0.55, "#ffd75e", Math.max(3, Math.round(width * 0.045)));
    } else if (dayT > 0.58) {
      const r = Math.max(2, Math.round(width * 0.03));
      const [mx, my] = celestial((dayT - 0.58) / 0.42, "#e8ecff", r);
      // crescent: a bite of sky colour bitten out of the moon's corner
      ctx.fillStyle = rgb(skySt.stops[2]);
      ctx.fillRect(
        mx - r + Math.round(r * 0.8),
        my - r + Math.round(r * 0.2),
        r * 2,
        r * 2,
      );
    }
    // stars fade in and twinkle with the depth of the night
    if (skySt.night > 0.05) {
      ctx.fillStyle = "#dfe6ff";
      for (let i = 0; i < 48; i++) {
        const tw = 0.5 + 0.5 * Math.sin(state.time * 2.5 + i * 1.7);
        ctx.globalAlpha = skySt.night * (0.25 + 0.75 * tw);
        ctx.fillRect(
          Math.round(starHash(i * 2) * width),
          Math.round(starHash(i * 2 + 1) * Math.max(8, horizonY - 8)),
          1,
          1,
        );
      }
      ctx.globalAlpha = 1;
    }

    const drawBand = (
      img: HTMLCanvasElement,
      offset: number,
      yBase: number,
    ) => {
      const x = -(((offset % width) + width) % width);
      ctx.drawImage(img, x, yBase);
      ctx.drawImage(img, x + width, yBase);
    };
    // clouds: the farthest layer — slowest curve parallax of all, plus a
    // gentle autonomous drift so the sunset sky is never static
    const cloudDrift = skyOffset * width * 0.05 + state.time * width * 0.006;
    const cloudX = -(((cloudDrift % width) + width) % width);
    const cloudY = Math.round(height * 0.05 - cloudShiftY);
    ctx.drawImage(clouds, cloudX, cloudY);
    ctx.drawImage(clouds, cloudX + width, cloudY);
    drawBand(hillsFar, skyOffset * width * 0.12, horizonY - hillsFar.height);
    drawBand(hillsNear, hillOffset * width * 0.08, horizonY - hillsNear.height);

    // ── road ──
    let maxY = height;
    // grass colour of the farthest line drawn — the crest gap-fill must
    // continue exactly the shade the ground ended with
    let farGrass = COLORS.dark.grass;
    // the nearest line that actually got painted: on steep descents every
    // closer segment is skipped (the road falls away below the viewport),
    // so the strip below the first painted line would keep stale pixels
    // from previous frames — the near gap-fill below continues it
    let nearLine: {
      x1: number;
      y1: number;
      w1: number;
      x2: number;
      y2: number;
      w2: number;
      grass: string;
      road: string;
    } | null = null;
    let x = 0;
    let dx = -(baseSegment.curve * curveGain * basePercent);
    const cameraZBase = state.position;
    // dev-only render diagnostics for the e2e road-fill probes
    let firstPainted = -1;
    let culledBehind = 0;
    let culledBackface = 0;
    let culledMaxY = 0;
    // ground truth for the first 12 slots: same-pass projection values, so
    // a probe can distinguish real backface culls from stale reads
    const segDiag: {
      n: number;
      p1z: number;
      p1camY: number;
      p1sy: number;
      p2camY: number;
      p2sy: number;
      wy: number;
      culled: string;
    }[] = [];
    // near-edge road geometry, captured for the road-parallel wind streaks
    let roadNearX = width / 2;
    let roadNearW = width * 0.45;

    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const segment = segments[ringSlot(baseSegment.index + n)];
      // never paint stale ring data: if the generator hasn't reached this
      // slot it still holds an overwritten segment from 1024 indices back
      if (segment.index !== baseSegment.index + n) break;
      segment.clip = maxY;

      const camZ = cameraZBase;
      const camX = state.playerX * ROAD_WIDTH - x;
      const camY = playerY + CAMERA_HEIGHT;
      project(segment.p1, camX, camY, camZ, width, height, yShift, hillGain);
      project(
        segment.p2,
        camX + dx,
        camY,
        camZ,
        width,
        height,
        yShift,
        hillGain,
      );

      x += dx;
      dx += segment.curve * curveGain;

      // behind the camera, climbing past the previous line, or hidden by a hill
      let cullReason = "";
      if (
        segment.p1.camera.z <= CAMERA_DEPTH ||
        segment.p2.screen.y >= segment.p1.screen.y ||
        segment.p2.screen.y >= maxY
      ) {
        if (segment.p1.camera.z <= CAMERA_DEPTH) {
          culledBehind++;
          cullReason = "behind";
        } else if (segment.p2.screen.y >= segment.p1.screen.y) {
          culledBackface++;
          cullReason = "backface";
        } else {
          culledMaxY++;
          cullReason = "maxY";
        }
      }
      if (debug && n < 12) {
        segDiag.push({
          n,
          p1z: Math.round(segment.p1.camera.z),
          p1camY: Math.round(segment.p1.camera.y),
          p1sy: segment.p1.screen.y,
          p2camY: Math.round(segment.p2.camera.y),
          p2sy: segment.p2.screen.y,
          wy: Math.round(segment.p2.world.y),
          culled: cullReason,
        });
      }
      if (cullReason) continue;
      if (firstPainted < 0) firstPainted = n;

      renderSegment(
        ctx,
        width,
        segment.p1.screen.x,
        segment.p1.screen.y,
        segment.p1.screen.w,
        segment.p2.screen.x,
        segment.p2.screen.y,
        segment.p2.screen.w,
        segment.color,
      );
      maxY = segment.p2.screen.y;
      farGrass = segment.color.grass;
      if (!nearLine) {
        nearLine = {
          x1: segment.p1.screen.x,
          y1: segment.p1.screen.y,
          w1: segment.p1.screen.w,
          x2: segment.p2.screen.x,
          y2: segment.p2.screen.y,
          w2: segment.p2.screen.w,
          grass: segment.color.grass,
          road: segment.color.road,
        };
      }

      if (n === 0) {
        roadNearX = segment.p2.screen.x;
        roadNearW = segment.p2.screen.w;
      }
    }

    // crest gap-fill: when the road drops away behind a hill its farthest
    // line (maxY) can hang well below the mountain bases, leaving a raw
    // sky strip between the hills and the ground — bridge it with grass.
    // Both bands share the horizon line, so the sky can only show below it.
    const groundTop = horizonY;
    if (maxY > groundTop) {
      ctx.fillStyle = farGrass;
      ctx.fillRect(0, groundTop, width, maxY - groundTop);
    }

    // near gap-fill: the descent mirror of the crest fill above. Diving
    // into a valley, every segment closer than the valley floor fails the
    // p2 >= p1 visibility test, so the nearest painted line can hang
    // above the buffer's bottom edge for a few frames — an unpainted
    // strip there keeps stale pixels (ghost car parts, old sparkle
    // frames). Continue the ground and extrapolate the road edges down.
    const nearGap = nearLine ? height - nearLine.y1 : 0;
    if (debug) {
      // dev-only: the projected y of a few sample segments ahead + the
      // elevation profile, so e2e probes can see WHY segments got culled
      const sampleIdx = [1, 2, 4, 8, 16, 40, 90, 150] as const;
      const yAhead = sampleIdx.map((n) => {
        const s = segments[ringSlot(baseSegment.index + n)];
        return s.index === baseSegment.index + n ? s.p2.screen.y : -1;
      });
      const wyBase = segments[ringSlot(baseSegment.index)].p1.world.y;
      const profile = sampleIdx.map((n) => {
        const s = segments[ringSlot(baseSegment.index + n)];
        return s.index === baseSegment.index + n
          ? Math.round(s.p2.world.y - wyBase)
          : -99999;
      });
      probe = {
        nearGap,
        firstPainted,
        culledBehind,
        culledBackface,
        culledMaxY,
        respawn: state.respawn,
        offRoad: state.offRoad,
        baseIndex: baseSegment.index,
        position: Math.round(state.position),
        firstIdx: firstIndex(),
        genCount: generatedCount(),
        yAhead,
        profile,
        segDiag,
      };
    }
    if (nearLine && nearLine.y1 < height) {
      ctx.fillStyle = nearLine.grass;
      ctx.fillRect(0, nearLine.y1, width, height - nearLine.y1);
      const t = (height - nearLine.y1) / Math.max(1, nearLine.y1 - nearLine.y2);
      const ex = nearLine.x1 + (nearLine.x1 - nearLine.x2) * t;
      const ew = nearLine.w1 + (nearLine.w1 - nearLine.w2) * t;
      ctx.fillStyle = nearLine.road;
      ctx.beginPath();
      ctx.moveTo(nearLine.x1 - nearLine.w1, nearLine.y1);
      ctx.lineTo(nearLine.x1 + nearLine.w1, nearLine.y1);
      ctx.lineTo(ex + ew, height);
      ctx.lineTo(ex - ew, height);
      ctx.closePath();
      ctx.fill();
    }

    // ── roadside sprites, far to near (painter's algorithm; Lou: keep
    //    them sorted by z and scale by the line's projection factor) ──
    // crest-hidden objects (a can OR a hole) share ONE mystery marker: a
    // bobbing pixel "?" poking over the hill line at the object's x — no
    // colour coding, the fuel-or-hole gamble is the point
    const drawCrestMystery = (
      x: number,
      hillY: number,
      size: number,
      phase: number,
    ) => {
      const fs = Math.max(7, Math.round(size));
      const bob = Math.round(Math.sin(state.time * 5 + phase) * fs * 0.12);
      const tx = Math.round(x - fs * 0.3);
      const ty = hillY - 2 - bob;
      ctx.font = `bold ${fs}px monospace`;
      ctx.fillStyle = "#141611";
      ctx.fillText("?", tx + 1, ty + 1);
      ctx.fillStyle = "#ffd75e";
      ctx.fillText("?", tx, ty);
    };
    for (let n = DRAW_DISTANCE - 1; n > 0; n--) {
      const segment = segments[ringSlot(baseSegment.index + n)];
      if (segment.index !== baseSegment.index + n) continue; // stale ring slot
      const pk = segment.pickup;
      if (!pk && !segment.hole && segment.sprites.length === 0) continue;

      // gas cans hover above the tarmac of their segment, bobbing gently
      // so they catch the eye; big cans (every 10th, worth 3 dots) are
      // drawn larger with a hotter halo — the relief must read from afar
      if (pk && pickupActive(segment)) {
        const scale = segment.p1.screen.scale;
        const canFrame = pk.golden && gasCanGolden ? gasCanGolden : gasCan;
        // much bigger than the roadside-sprite factor (4.2): pickups must
        // read from far away and feel worth steering for
        const sizeMul = pk.big ? 1.6 : pk.golden ? 1.15 : 1;
        const destW = canFrame.w * scale * (width / 2) * 8 * sizeMul;
        const destH = canFrame.h * scale * (width / 2) * 8 * sizeMul;
        if (destW >= 2) {
          // floats above the road: fixed hover height + slow bob
          const bob =
            Math.sin(state.time * 4 + segment.index * 0.7) * destH * 0.08;
          const hover = destH * 0.3;
          const destX =
            segment.p1.screen.x +
            scale * pk.x * canSpread * ROAD_WIDTH * (width / 2) -
            destW / 2;
          const destY = segment.p1.screen.y - destH - hover + bob;
          let visibleH = destH;
          // clip against the hill line this segment was drawn under
          if (segment.clip && destY + destH > segment.clip) {
            visibleH = segment.clip - destY;
          }
          if (visibleH > 0) {
            // shadow stays on the tarmac below the hovering can
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.beginPath();
            ctx.ellipse(
              Math.round(destX + destW / 2),
              Math.round(segment.p1.screen.y - 1),
              destW * 0.34,
              Math.max(1, destH * 0.07),
              0,
              0,
              Math.PI * 2,
            );
            ctx.fill();
            // pulsing halo ring — at distance the can itself is a few
            // pixels, so this is what reads as "pickup here!" from afar.
            // Big and golden cans pulse faster and hotter, with a second
            // outer ring
            const hot = pk.big || pk.golden;
            const pulse =
              0.5 + 0.5 * Math.sin(state.time * (hot ? 9 : 5) + segment.index);
            ctx.strokeStyle = `rgba(255,215,94,${(hot ? 0.55 : 0.35) + (hot ? 0.45 : 0.35) * pulse})`;
            ctx.lineWidth = Math.max(1, destW * (hot ? 0.09 : 0.07));
            ctx.beginPath();
            ctx.ellipse(
              Math.round(destX + destW / 2),
              Math.round(destY + (visibleH / destH) * destH * 0.5),
              destW * 0.68,
              (visibleH / destH) * destH * 0.62,
              0,
              0,
              Math.PI * 2,
            );
            ctx.stroke();
            if (hot) {
              ctx.strokeStyle = `rgba(255,242,190,${0.2 + 0.3 * pulse})`;
              ctx.lineWidth = Math.max(1, destW * 0.04);
              ctx.beginPath();
              ctx.ellipse(
                Math.round(destX + destW / 2),
                Math.round(destY + (visibleH / destH) * destH * 0.5),
                destW * 0.88,
                (visibleH / destH) * destH * 0.8,
                0,
                0,
                Math.PI * 2,
              );
              ctx.stroke();
            }
            ctx.drawImage(
              canFrame.image,
              0,
              0,
              canFrame.w,
              (visibleH / destH) * canFrame.h,
              Math.round(destX),
              Math.round(destY),
              Math.round(destW),
              Math.round((visibleH / destH) * destH),
            );
          } else {
            // fully hidden behind a crest — the can itself can't draw
            // (clip culls it), so the shared mystery "?" bobs over the
            // hill line at the can's spot: something is there, fuel or
            // a hole — you only find out past the crest
            drawCrestMystery(
              destX + destW / 2,
              Math.round(segment.clip || 0),
              destW,
              segment.index,
            );
          }
        }
      }

      // pothole: a RECESSED mouth in the tarmac, not a raised disc — a
      // near-black ellipse with a thin lit lip on the camera-facing edge
      // (light catches the wall that faces the viewer). Depth comes from
      // the segment's own screen thickness (a flat disc on the road plane
      // projects as a sliver), and the rim is clamped so it never spills
      // past the road edge. A hole fully hidden behind a crest shows the
      // SAME mystery "?" the cans use — falling into a hole you never saw
      // is cheap, but knowing exactly which it was killed the gamble
      if (segment.hole) {
        const scale = segment.p1.screen.scale;
        const y1 = segment.p1.screen.y;
        const y2 = segment.p2.screen.y;
        const roadW = scale * ROAD_WIDTH * (width / 2);
        const rx = Math.min(0.26, 1 - Math.abs(segment.hole.x)) * roadW;
        const hx = segment.p1.screen.x + segment.hole.x * roadW;
        if (rx >= 2 && (!segment.clip || y1 <= segment.clip)) {
          const ry = Math.max(1, Math.min(rx * 0.35, (y1 - y2) * 0.45));
          const hy = y1 - ry * 0.5;
          ctx.fillStyle = "#0a0a0c";
          ctx.beginPath();
          ctx.ellipse(
            Math.round(hx),
            Math.round(hy),
            Math.round(rx),
            Math.round(ry),
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.strokeStyle = "rgba(140,140,150,0.7)";
          ctx.lineWidth = Math.max(1, Math.round(ry * 0.25));
          ctx.beginPath();
          ctx.ellipse(
            Math.round(hx),
            Math.round(hy),
            Math.round(rx),
            Math.round(ry),
            0,
            0.15 * Math.PI,
            0.85 * Math.PI,
          );
          ctx.stroke();
        } else if (rx >= 2) {
          // crest-hidden: the same bobbing "?" the cans use — fuel or
          // hole, you only find out past the crest
          drawCrestMystery(hx, Math.round(segment.clip), rx, segment.index);
        }
      }

      for (const s of segment.sprites) {
        const sprite = roadside[s.sprite];
        const scale = segment.p1.screen.scale;
        const spriteMul = sprite.scale ?? 1;
        const destW = sprite.w * scale * (width / 2) * 4.2 * spriteMul;
        const destH = sprite.h * scale * (width / 2) * 4.2 * spriteMul;
        if (destW < 2) continue;
        const destX =
          segment.p1.screen.x +
          scale * s.offset * ROAD_WIDTH * (width / 2) -
          destW / 2;
        const destY = segment.p1.screen.y - destH;
        let visibleH = destH;
        // clip against the hill line this segment was drawn under
        if (segment.clip) {
          const clipY = segment.clip;
          if (destY + destH > clipY) visibleH = clipY - destY;
          if (visibleH <= 0) continue;
        }
        ctx.drawImage(
          sprite.image,
          0,
          0,
          sprite.w,
          (visibleH / destH) * sprite.h,
          Math.round(destX),
          Math.round(destY),
          Math.round(destW),
          Math.round((visibleH / destH) * destH),
        );
      }
    }

    // ── player: chase sprite behind the car, or first-person cockpit ──
    // (speedPercent / lift / dip are computed up front — the cockpit sinks
    // the world with them via yShift)
    // speed-dependent bounce, stronger off-road; killed for reduced motion
    const bounce =
      reduceMotion || airT > 0
        ? 0
        : Math.sin(state.time * 18) *
          (state.offRoad ? 2.2 : 0.8) *
          speedPercent;
    const shakeX =
      !reduceMotion && state.offRoad && state.speed > MAX_SPEED * 0.1
        ? Math.sin(state.time * 47) * 1.5
        : 0;
    // pickup sparkle anchor — at the car in chase view, mid-windshield
    // in cockpit view (the dash would hide the car spot)
    let fxAnchorY = cockpitMode ? height * 0.3 : height * 0.55;
    // cockpit dash placement, captured in the first-person branch so the
    // instrument cluster can be painted onto the dash art afterwards
    let dashGeom: { x: number; y: number; w: number; h: number } | null = null;
    // speed streaks hug the road edges; cockpit view needs them UNDER the
    // dash, so each branch calls this at the right moment
    const drawStreaks = () => {
      if (reduceMotion) return;
      // swing only with the car's own turning — straight car, straight
      // streaks, no matter how the road bends ahead
      vanishX += (width / 2 + pendingSteer * width * 0.045 - vanishX) * 0.12;
      renderSpeedLines(
        ctx,
        width,
        height,
        speedPercent,
        state.time,
        roadNearX,
        roadNearW,
        horizonY,
        vanishX,
      );
    };
    // cornering feel: the mirrored world swings against the current bend
    // (the mirror yaws with the car), smoothed so it eases in and out
    mirrorSway +=
      (-playerSegment.curve * curveGain * speedPercent - mirrorSway) * 0.08;

    if (!cockpitMode) {
      const steer = state.speed > MAX_SPEED * 0.02;
      let frame = car.straight;
      // slope frames on hills (dy under the car), steer frames when turning;
      // the threshold only engages on pronounced slopes now that hills are
      // full Jake Gordon height (a LOW rolling hill peaks ~80 world/segment)
      const dy =
        (playerSegment.p2.world.y - playerSegment.p1.world.y) * hillGain;
      if (dy > SEGMENT_LENGTH * 0.35) frame = car.up;
      else if (dy < -SEGMENT_LENGTH * 0.35) frame = car.down;
      if (steer) {
        // actual steering intent wins over slope — the tilt input is
        // analog, so the lean frames wait for a real turn of the wheel
        if (pendingSteer < -0.35) frame = car.left;
        else if (pendingSteer > 0.35) frame = car.right;
      }

      const scale = CAMERA_DEPTH / PLAYER_Z;
      // the car "pulls away" as speed builds: near scale at standstill,
      // far scale at top speed — a smooth zoom-out instead of switching
      // between discrete sprite sizes (the sheet's smaller sizes stay unused)
      const CAR_SCALE_NEAR = 1.45; // ~29% of buffer width at standstill
      const CAR_SCALE_FAR = 1.1; // ~22% at top speed
      // portrait buffers (300px phones) shrink the car with the width while
      // the road's vertical stretch makes the lanes read huge — boost the
      // sprite so it keeps roughly a lane of visual width
      const portraitBoost =
        width < RACER_WIDTH ? Math.min(2, (RACER_WIDTH / width) * 1.15) : 1;
      const carScale =
        interpolate(CAR_SCALE_NEAR, CAR_SCALE_FAR, speedPercent) *
        portraitBoost;
      const destW = frame.w * scale * (width / 2) * carScale;
      const destH = frame.h * scale * (width / 2) * carScale;
      const carX = width / 2 - destW / 2 + shakeX;
      const carY =
        height - destH - Math.round(height * 0.04) + bounce - lift + dip;

      // respawn: the car breathes in and out of existence for a moment
      const carAlpha =
        state.respawn > 0 ? 0.5 + 0.5 * Math.sin(state.time * 9) : 1;

      // soft shadow — stays on the tarmac while the car is airborne, so
      // the hop reads as real separation from the road
      const shadowFade = 1 - Math.min(1, lift / (height * 0.035)) * 0.5;
      ctx.globalAlpha = carAlpha * 0.9 * shadowFade;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(
        width / 2 + shakeX,
        height - Math.round(height * 0.03),
        destW * 0.42,
        destH * 0.08,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.globalAlpha = carAlpha;
      ctx.drawImage(
        frame.image,
        Math.round(carX),
        Math.round(carY),
        Math.round(destW),
        Math.round(destH),
      );
      ctx.globalAlpha = 1;

      // stop lamps: taillights + the high-level LED strip on the roofline
      // glow red while the brake pedal is down — like a real car they
      // stay lit at a standstill. Anchors come from the frame itself:
      // the angled left/right frames put the lamps in different spots.
      // A soft halo under a brighter core sells the lamp bloom
      if (state.braking && state.respawn <= 0 && frame.lamps) {
        const lamp = (fx: number, fy: number, fw: number, fh: number) => {
          const lx = carX + destW * fx;
          const ly = carY + destH * fy;
          const lw = destW * fw;
          const lh = destH * fh;
          ctx.globalAlpha = carAlpha * 0.3;
          ctx.fillStyle = "#ff2020";
          ctx.fillRect(lx - lw * 0.15, ly - lh * 0.2, lw * 1.3, lh * 1.4);
          ctx.globalAlpha = carAlpha;
          ctx.fillStyle = "#ff5a4a";
          ctx.fillRect(lx, ly, lw, lh);
        };
        for (const [fx, fy, fw, fh] of frame.lamps) lamp(fx, fy, fw, fh);
        ctx.globalAlpha = 1;
      }

      // off-road dust puffs
      if (
        state.offRoad &&
        state.speed > MAX_SPEED * 0.08 &&
        car.smoke.length > 0
      ) {
        const puff = car.smoke[Math.floor(state.time * 12) % car.smoke.length];
        const puffW = destW * 0.22;
        const puffH = (puff.h / puff.w) * puffW;
        const side = Math.floor(state.time * 12) % 2 ? -1 : 1;
        ctx.globalAlpha = 0.75;
        ctx.drawImage(
          puff.image,
          // kicked up behind the rear wheels, at the car's own baseline
          Math.round(width / 2 + side * destW * 0.34 - puffW / 2 + shakeX),
          Math.round(carY + destH - puffH * 0.8),
          Math.round(puffW),
          Math.round(puffH),
        );
        ctx.globalAlpha = 1;
      }

      // drift smoke: in a hard curve at speed the car slides sideways
      // (centrifugal push) and the rear tires scrub — puffs at both rear
      // wheels, trailing outward from the bend
      const curveSlide =
        Math.abs(playerSegment.curve * curveGain) * speedPercent ** 2;
      if (!state.offRoad && curveSlide > 1 && car.smoke.length > 0) {
        const outward = playerSegment.curve > 0 ? -1 : 1;
        for (const wheelSide of [-1, 1]) {
          const puff =
            car.smoke[
              Math.floor(state.time * 14 + (wheelSide > 0 ? 1 : 0)) %
                car.smoke.length
            ];
          const puffW = destW * 0.26;
          const puffH = (puff.h / puff.w) * puffW;
          ctx.globalAlpha = Math.min(0.85, curveSlide * 0.45);
          ctx.drawImage(
            puff.image,
            Math.round(
              width / 2 +
                wheelSide * destW * 0.34 +
                outward * destW * 0.05 -
                puffW / 2 +
                shakeX,
            ),
            Math.round(carY + destH - puffH * 0.7),
            Math.round(puffW),
            Math.round(puffH),
          );
        }
        ctx.globalAlpha = 1;
      }

      fxAnchorY = carY + destH * 0.3;
      drawStreaks();
    } else {
      // first-person: streaks pass under the dash, then the cockpit goes
      // on top — dash sway reuses the car's bounce/shake so the body
      // feel survives the view switch
      drawStreaks();
      const dashW =
        (cockpit.dash.h / cockpit.dash.w) * width > height
          ? (cockpit.dash.w / cockpit.dash.h) * height
          : width;
      const dashH =
        (dashW === width ? (cockpit.dash.h / cockpit.dash.w) * width : height) *
        // portrait phones: the dash strip is thin, which reads as a high
        // truck seat — stretch it taller so the dash hides the near road
        // like a car's hood line (fractions keep wheel/mirror/cluster
        // aligned; the buffer is already stretched vertically on phones)
        (width < RACER_WIDTH ? 1.4 : 1);
      const swayX = pendingSteer * 2 * (width / RACER_WIDTH) + shakeX * 0.5;
      const dashX = width / 2 - dashW / 2 + swayX;
      // the dash rides WITH the driver — while airborne it's the world
      // that sinks (yShift above); on touchdown the suspension thump
      // hits the dash
      const dashY = height - dashH + bounce * 0.5 + dip * 1.3;
      ctx.drawImage(
        cockpit.dash.image,
        Math.round(dashX),
        Math.round(dashY),
        Math.round(dashW),
        Math.round(dashH),
      );
      // steering wheel: 3-frame sheet (left/center/right); geometry as
      // fractions of the dash rect so both orientations line up
      // (printed by scripts/build-cockpit.mjs)
      const wf = pendingSteer < -0.1 ? 0 : pendingSteer > 0.1 ? 2 : 1;
      const fw = cockpit.wheelFrame;
      const wheelW = dashW * COCKPIT_WHEEL.fwF;
      const wheelH = dashH * COCKPIT_WHEEL.fhF;
      ctx.drawImage(
        cockpit.wheel,
        wf * fw,
        0,
        fw,
        fw,
        Math.round(dashX + dashW * COCKPIT_WHEEL.cxF - wheelW / 2),
        Math.round(dashY + dashH * COCKPIT_WHEEL.cyF - wheelH / 2),
        Math.round(wheelW),
        Math.round(wheelH),
      );

      // rearview mirror: a simulated pseudo-3d road strip streaming at the
      // car's speed (renderMirror) — no real re-render of the world.
      // Portrait buffers squeeze the dash into a thin strip and the baked
      // glass shrinks to a few pixels — grow the scene past the bezel so
      // the mirror stays readable (anchored at the glass's center)
      let mW = Math.round(dashW * COCKPIT_MIRROR.wF);
      let mH = Math.round(dashH * COCKPIT_MIRROR.hF);
      if (width < RACER_WIDTH && mW < width * 0.22) {
        const grow = (width * 0.22) / mW;
        mW = Math.round(width * 0.22);
        mH = Math.round(mH * grow);
      }
      const mX = Math.round(
        dashX +
          dashW * COCKPIT_MIRROR.xF +
          (dashW * COCKPIT_MIRROR.wF - mW) / 2,
      );
      const mY = Math.round(
        dashY +
          dashH * COCKPIT_MIRROR.yF +
          (dashH * COCKPIT_MIRROR.hF - mH) / 2,
      );
      renderMirror(
        ctx,
        mX,
        mY,
        mW,
        mH,
        state.position,
        state.playerX,
        playerY,
        segments,
        mirrorSway,
        curveGain,
        hillGain,
        firstIndex(),
      );

      dashGeom = { x: dashX, y: dashY, w: dashW, h: dashH };
    }
    // day/night ambient: the whole world (and the dash) dims at night and
    // warms at sunset — instruments, popups and banners drawn after this
    // stay bright, so the LCD glows in the dark like the real thing
    if (skySt.night > 0.01) {
      ctx.fillStyle = `rgba(8,10,36,${(0.38 * skySt.night).toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }
    const sunsetGlow = Math.max(0, 1 - Math.abs(dayT - 0.45) / 0.12);
    if (sunsetGlow > 0.01) {
      ctx.fillStyle = `rgba(226,112,58,${(0.07 * sunsetGlow).toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }
    // pickup feedback window — sparkle burst + gauge flash + rising "+1"
    const fxAge = state.time - lastPickupAt;
    // cockpit view: the readouts live on the dash's own cluster screen;
    // chase view: the floating LCD panel (bottom-right, or top-left on
    // touch so the pedals don't cover it)
    const gaugePos =
      cockpitMode && dashGeom
        ? renderDashCluster(
            ctx,
            dashGeom.x + dashGeom.w * COCKPIT_CLUSTER.xF,
            dashGeom.y + dashGeom.h * COCKPIT_CLUSTER.yF,
            dashGeom.w * COCKPIT_CLUSTER.wF,
            dashGeom.h * COCKPIT_CLUSTER.hF,
            speedPercent * 180,
            state.score,
            state.fuel,
            state.time,
            fxAge < 0.5,
          )
        : renderCluster(
            ctx,
            width,
            height,
            speedPercent * 180,
            state.score,
            state.fuel,
            state.time,
            fxAge < 0.5,
            opts.clusterTopLeft,
          );

    if (fxAge < 0.8) {
      const ui = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
      // sparkle burst where the can was collected (right at the car)
      if (fxAge < 0.5) {
        const p = fxAge / 0.5;
        const burstX = width / 2 + shakeX;
        const burstY = fxAnchorY;
        const rr = (4 + p * 26) * ui;
        const s = Math.max(1, Math.round((3 - p * 2) * ui));
        ctx.globalAlpha = 1 - p;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          ctx.fillStyle = k % 2 ? "#ffd75e" : "#d7ff9e";
          ctx.fillRect(
            Math.round(burstX + Math.cos(a) * rr - s / 2),
            Math.round(burstY + Math.sin(a) * rr * 0.6 - s / 2),
            s,
            s,
          );
        }
      }
      // "+N" floats up off the fuel gauge — dark outline so it reads
      // against both the light LCD panel and the dark road behind it.
      // Golden pickups rise in gold. (A full-tank pickup's boost reason
      // is named by the centre countdown's OVERFLOW BOOST prefix)
      const fxText = `+${lastPickupAmt}`;
      const p = fxAge / 0.8;
      const tx = Math.round(gaugePos.x);
      const ty = Math.round(gaugePos.y - 4 * ui - p * 14 * ui);
      ctx.globalAlpha = 1 - p;
      ctx.font = `bold ${Math.round(9 * ui)}px monospace`;
      ctx.fillStyle = "#141611";
      ctx.fillText(fxText, tx + 1, ty + 1);
      ctx.fillStyle = lastPickupGolden ? "#ffd75e" : "#d7ff9e";
      ctx.fillText(fxText, tx, ty);
      ctx.globalAlpha = 1;
    }

    // BOOST active: blinking readout of the seconds left, big and centred
    // at the top of the screen — the arcade spot where the games that
    // invented this trope put it, and readable on any form factor
    if (state.boostT > 0 && !state.gameOver) {
      const ui = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
      if (Math.floor(state.time * 3) % 2 === 0) {
        const src =
          lastBoostSource === "streak"
            ? "STREAK"
            : lastBoostSource === "golden"
              ? "GOLDEN"
              : "OVERFLOW";
        const msg = `${src} BOOST ${state.boostT.toFixed(1)}s`;
        ctx.font = `bold ${Math.round(12 * ui)}px monospace`;
        const tw = ctx.measureText(msg).width;
        const bx = Math.round(width / 2 - tw / 2);
        const by = Math.round(height * 0.14);
        ctx.fillStyle = "#141611";
        ctx.fillText(msg, bx + 1, by + 1);
        ctx.fillStyle = "#e2703a";
        ctx.fillText(msg, bx, by);
      }
    }

    // fuel-chain streak HUD: a red jerrycan stamped with a tiny "GAS" +
    // an "xN" counter. Desktop: top-left corner (the LCD cluster sits
    // bottom-right there). Touch: the left column UNDER the top-left LCD
    // cluster — the top-right corner belongs to the DOM top bar
    // (CAM/mute/pause/✕), which swallowed the counter. Visible from x1;
    // when the chain breaks the can flares up, burns for a beat and fades
    const stAge = state.time - lastStreakAt;
    const lostAge = state.time - lastStreakLostAt;
    const STREAK_BURN_T = 0.9; // burn-out animation length on a broken chain
    if (
      (state.streak >= 1 || stAge < 1.2 || lostAge < STREAK_BURN_T) &&
      !state.gameOver
    ) {
      const uiBase = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
      // phone buffers keep their desktop design size, so the physical
      // pixels end up tiny — scale the corner cluster up hard
      const ui =
        uiBase * (height > width ? 2.5 : opts.clusterTopLeft ? 1.4 : 1);
      ctx.font = `bold ${Math.round(8 * ui)}px monospace`;
      const label = `x${Math.max(1, state.streak)}`;
      const margin = Math.round(8 * ui);
      const iconW = Math.round(10 * ui);
      const iconH = Math.round(12 * ui);
      const pad = Math.round(4 * ui);
      const bx = margin;
      // the touch LCD cluster is 150×52 parked at TOUCH_CLUSTER_TOP·uiBase —
      // sit under its bottom edge with a gap that scales with the streak's
      // own ui, so the flame tongues licking ABOVE the can (up to ~3·ui on
      // the burn-out) never touch the cluster either
      const by = opts.clusterTopLeft
        ? Math.round((TOUCH_CLUSTER_TOP + 52) * uiBase + 10 * ui)
        : margin;
      // pixel jerrycan: black outline, red pressed-steel body, stamped X,
      // cap nub on the top-right corner, tiny "GAS" plate
      const drawCan = (alpha: number) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#141611";
        ctx.fillRect(bx - 1, by - 1, iconW + 2, iconH + 2);
        ctx.fillRect(
          bx + iconW - Math.round(3 * ui),
          by - Math.round(2 * ui),
          Math.round(3 * ui),
          Math.round(2 * ui),
        );
        ctx.fillStyle = "#d43a2f";
        ctx.fillRect(bx, by, iconW, iconH);
        ctx.strokeStyle = "#8e2318";
        ctx.lineWidth = Math.max(1, Math.round(1 * ui));
        ctx.beginPath();
        ctx.moveTo(bx + Math.round(iconW * 0.2), by + Math.round(iconH * 0.14));
        ctx.lineTo(bx + Math.round(iconW * 0.8), by + Math.round(iconH * 0.55));
        ctx.moveTo(bx + Math.round(iconW * 0.8), by + Math.round(iconH * 0.14));
        ctx.lineTo(bx + Math.round(iconW * 0.2), by + Math.round(iconH * 0.55));
        ctx.stroke();
        ctx.font = `bold ${Math.max(3, Math.round(3 * ui))}px monospace`;
        ctx.fillStyle = "#141611";
        const gw = ctx.measureText("GAS").width;
        ctx.fillText(
          "GAS",
          Math.round(bx + (iconW - gw) / 2),
          by + Math.round(iconH * 0.8),
        );
        ctx.globalAlpha = 1;
      };
      // fly-can arrival halo: a bright yellow flash flares behind the
      // jerrycan for a beat when a bagged can docks — the "you really
      // collected it" moment made visible on the HUD
      const glowAge = state.time - streakGlowAt;
      if (glowAge < 0.6 && state.streak >= 1) {
        const gp = glowAge / 0.6;
        const cx = bx + iconW / 2;
        const cy = by + iconH / 2;
        const gr = iconW * (1.3 + gp * 1.4);
        const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, gr);
        grad.addColorStop(
          0,
          `rgba(255,215,94,${(0.85 * (1 - gp)).toFixed(3)})`,
        );
        grad.addColorStop(1, "rgba(255,215,94,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(
          Math.round(cx - gr),
          Math.round(cy - gr),
          Math.round(gr * 2),
          Math.round(gr * 2),
        );
      }
      if (state.streak >= 1) {
        // flame tongues rising behind the can, flickering on engine time.
        // They track the ladder lap: growing through each 10-can lap
        // (2/3 tongues past 3/5) and burning fullest at every multiple
        // of 10 — the fire itself shows how close the next +8 s is
        const lap = state.streak % 10 === 0 ? 10 : state.streak % 10;
        const tongues =
          1 + (lap >= 3 ? 1 : 0) + (lap >= 5 ? 1 : 0) + (lap >= 10 ? 1 : 0);
        for (let k = 0; k < tongues; k++) {
          const flick = 0.5 + 0.5 * Math.sin(state.time * 11 + k * 1.7);
          const fh = Math.round((4 + k * 2 + flick * 3) * ui);
          const fw = Math.round((3 + (k % 2)) * ui);
          const fx = Math.round(
            bx + iconW / 2 - fw / 2 + (k - (tongues - 1) / 2) * 3 * ui,
          );
          ctx.globalAlpha = 0.35 + 0.4 * flick;
          ctx.fillStyle = k % 2 ? "#e2703a" : "#ffb03a";
          ctx.fillRect(fx, by + iconH - fh, fw, fh);
        }
        ctx.globalAlpha = 1;
        drawCan(1);
        const tx = bx + iconW + pad;
        const ty = by + iconH - Math.round(1 * ui);
        ctx.font = `bold ${Math.round(8 * ui)}px monospace`;
        ctx.fillStyle = "#141611";
        ctx.fillText(label, tx + 1, ty + 1);
        ctx.fillStyle = "#ffd75e";
        ctx.fillText(label, tx, ty);
      } else if (lostAge < STREAK_BURN_T) {
        // chain broken: the can flares up wilder than the streak flame
        // ever burned, then is consumed — alpha and tongues die together
        const p = lostAge / STREAK_BURN_T;
        for (let k = 0; k < 5; k++) {
          const flick = 0.5 + 0.5 * Math.sin(state.time * 16 + k * 2.3);
          const fh = Math.round((6 + k + flick * 5) * ui * (1 - p * 0.5));
          const fw = Math.round((3 + (k % 2)) * ui);
          const fx = Math.round(bx + iconW / 2 - fw / 2 + (k - 2) * 3 * ui);
          ctx.globalAlpha = (1 - p) * (0.4 + 0.5 * flick);
          ctx.fillStyle = k % 2 ? "#e2703a" : "#ffb03a";
          ctx.fillRect(fx, by + iconH - fh, fw, fh);
        }
        ctx.globalAlpha = 1;
        drawCan(1 - p);
      }
      // tier-crossing popup under the counter: the flame was the promise,
      // this is the payoff. Same face as the LEVEL banner. Completing a
      // full 10-can lap is the prestigious moment — it gets the COMBO
      // count (2 combos clean = streak 20) instead of a raw streak number,
      // plus the LAP_FUEL dot grant that keeps a perfect chain alive
      if (stAge < 1.2) {
        const msg =
          lastStreakTier % 10 === 0
            ? `COMBO ${lastStreakTier / 10}! +${lastStreakSecs}s +${LAP_FUEL}GAS`
            : `STREAK ${lastStreakTier}! +${lastStreakSecs}s`;
        ctx.font = `bold ${Math.round(8 * ui)}px monospace`;
        // left column on every form factor now (under the touch cluster)
        const tx = margin;
        const ty = by + iconH + Math.round(10 * ui);
        ctx.globalAlpha = Math.max(
          0,
          Math.min(1, Math.min(stAge / 0.15, (1.2 - stAge) / 0.4)),
        );
        ctx.fillStyle = "#141611";
        ctx.fillText(msg, tx + 1, ty + 1);
        ctx.fillStyle = "#e2703a";
        ctx.fillText(msg, tx, ty);
        ctx.globalAlpha = 1;
      }
    }

    // collected cans in flight to the streak icon: the exact sprite copy
    // (golden tint and big-can size included) arcs over the world and
    // docks onto the HUD jerrycan, shrinking as it goes — docking fires
    // the yellow halo above. Drawn over the HUD so the arc never clips
    if (flyCans.length > 0 && !state.gameOver) {
      const uiBase = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
      const ui =
        uiBase * (height > width ? 2.5 : opts.clusterTopLeft ? 1.4 : 1);
      const margin = Math.round(8 * ui);
      const iconW = Math.round(10 * ui);
      const iconH = Math.round(12 * ui);
      const tx = margin + iconW / 2;
      const ty =
        (opts.clusterTopLeft
          ? Math.round((TOUCH_CLUSTER_TOP + 52) * uiBase + 10 * ui)
          : margin) +
        iconH / 2;
      for (let i = flyCans.length - 1; i >= 0; i--) {
        const f = flyCans[i];
        const p = Math.min(1, (state.time - f.t0) / FLY_T);
        if (p >= 1) {
          streakGlowAt = state.time;
          flyCans.splice(i, 1);
          continue;
        }
        const e = p * p * (3 - 2 * p); // smoothstep: fast launch, soft dock
        const fx = f.sx + (tx - f.sx) * e;
        const fy =
          f.sy + (ty - f.sy) * e - Math.sin(p * Math.PI) * height * 0.12;
        const frame = f.golden && gasCanGolden ? gasCanGolden : gasCan;
        const sizeMul = (f.big ? 1.6 : f.golden ? 1.15 : 1) * (2.2 - 1.2 * e);
        const dw = iconW * sizeMul;
        const dh = (dw * frame.h) / frame.w;
        ctx.drawImage(
          frame.image,
          Math.round(fx - dw / 2),
          Math.round(fy - dh / 2),
          Math.round(dw),
          Math.round(dh),
        );
      }
    }

    // fuel warnings — an empty tank kills the engine and the car coasts
    // to a stop, so make the cause unmistakable before it happens
    if (!state.gameOver && state.fuel <= 2) {
      const ui = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
      const blinkOn = Math.floor(state.time * 2.5) % 2 === 0;
      if (state.fuel <= 0) {
        // coasting dead: big centre-screen warning until game over pops
        if (blinkOn) {
          const msg = "OUT OF FUEL";
          ctx.font = `bold ${Math.round(10 * ui)}px monospace`;
          const tw = ctx.measureText(msg).width;
          const tx = Math.round(width / 2 - tw / 2);
          const ty = Math.round(height * 0.35);
          ctx.fillStyle = "#141611";
          ctx.fillText(msg, tx + 1, ty + 1);
          ctx.fillStyle = "#e2703a";
          ctx.fillText(msg, tx, ty);
        }
      } else if (blinkOn) {
        // nearly dry: big blinking LOW FUEL on the flat sky band at the
        // top — the mountains and the orange paintwork both swallowed it
        const msg = "LOW FUEL";
        ctx.font = `bold ${Math.round(9 * ui)}px monospace`;
        const tw = ctx.measureText(msg).width;
        const tx = Math.round(width / 2 - tw / 2);
        const ty = Math.round(height * 0.28);
        ctx.fillStyle = "#141611";
        ctx.fillText(msg, tx + 2, ty + 2);
        ctx.fillStyle = "#e2703a";
        ctx.fillText(msg, tx, ty);
      }
    }

    // level banner: a brief LEVEL X flash when a new distance level turns
    // the heat up — quick fade in, hold, fade out. Under it, the level's
    // fuel-consumption multiplier in the same face but the accent orange:
    // the number that tells you how much hungrier this stage runs
    const lvlAge = state.time - levelUpAt;
    if (state.level > 1 && lvlAge < 2.2 && !state.gameOver) {
      const ui = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
      const msg = `LEVEL ${state.level}`;
      ctx.font = `bold ${Math.round(11 * ui)}px monospace`;
      const tw = ctx.measureText(msg).width;
      const tx = Math.round(width / 2 - tw / 2);
      const ty = Math.round(height * 0.3);
      ctx.globalAlpha = Math.max(
        0,
        Math.min(1, Math.min(lvlAge / 0.2, (2.2 - lvlAge) / 0.5)),
      );
      ctx.fillStyle = "#141611";
      ctx.fillText(msg, tx + 2, ty + 2);
      ctx.fillStyle = "#d7ff9e";
      ctx.fillText(msg, tx, ty);
      const sub = `FUEL x${drainGain.toFixed(2)}`;
      const sw = ctx.measureText(sub).width;
      const sx = Math.round(width / 2 - sw / 2);
      const sy = ty + Math.round(14 * ui);
      ctx.fillStyle = "#141611";
      ctx.fillText(sub, sx + 2, sy + 2);
      ctx.fillStyle = "#e2703a";
      ctx.fillText(sub, sx, sy);
      ctx.globalAlpha = 1;
    }

    // record-chase banner: crossing a leaderboard top (24H / 7D / 30D /
    // ALL-TIME) fires this once per threshold — the LEVEL banner's face,
    // parked lower so the two can coexist, in trophy gold
    const recAge = state.time - recordBannerAt;
    if (recAge < 2.2 && !state.gameOver) {
      const ui = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
      const msg = `NEW ${recordBannerLabel} RECORD!`;
      ctx.font = `bold ${Math.round(11 * ui)}px monospace`;
      const tw = ctx.measureText(msg).width;
      const tx = Math.round(width / 2 - tw / 2);
      const ty = Math.round(height * 0.42);
      ctx.globalAlpha = Math.max(
        0,
        Math.min(1, Math.min(recAge / 0.2, (2.2 - recAge) / 0.5)),
      );
      ctx.fillStyle = "#141611";
      ctx.fillText(msg, tx + 2, ty + 2);
      ctx.fillStyle = "#ffd75e";
      ctx.fillText(msg, tx, ty);
      ctx.globalAlpha = 1;
    }
  }

  const debugNextPickup =
    process.env.NODE_ENV === "production"
      ? undefined
      : () => {
          const from = Math.floor((state.position + PLAYER_Z) / SEGMENT_LENGTH);
          for (let si = from; si < from + AHEAD_SEGMENTS; si++) {
            const seg = segments[ringSlot(si)];
            if (seg.index !== si) break; // generator hasn't reached this slot
            if (seg.pickup && pickupActive(seg)) {
              return {
                absIndex: si,
                x: seg.pickup.x * canSpread,
                big: !!seg.pickup.big,
                golden: !!seg.pickup.golden,
              };
            }
          }
          return null;
        };

  return {
    update,
    render,
    resize,
    state,
    setRecordTargets: (t) => {
      recordTargets = t;
    },
    debugNextPickup,
    get probe() {
      return probe;
    },
  };
}

export const ENGINE_CONSTANTS = {
  SEGMENT_LENGTH,
  RUMBLE_LENGTH,
  ROAD_WIDTH,
  CAMERA_HEIGHT,
  MAX_SPEED,
};
