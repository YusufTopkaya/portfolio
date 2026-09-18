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

import { RACER_BRACKETS } from "./brackets";

export interface RacerInput {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
  /** analog steering (-1..1) from tilt controls — overrides left/right */
  steer?: number;
  /** analog throttle 0..1 (gamepad RT) — 0.5 is a genuine half pull;
      absent means the boolean gas flag rules (keyboard = full) */
  gasAmt?: number;
  /** analog brake 0..1 (gamepad LT) */
  brakeAmt?: number;
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
      in the can sequence, drives the golden-ratio hiding pattern.
      missed: set once the pickup point has left the can's segment
      without grabbing it — the break must fire exactly once (below
      ~130 km/h the car needs 2+ frames to cross a segment, and the
      pickup scan would re-fire the break every frame otherwise) */
  pickup?: {
    x: number;
    big?: boolean;
    golden?: boolean;
    ordinal: number;
    missed?: boolean;
  };
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
// crash cost (off-road, pothole, tree — all share crashRespawn): 2 fuel
// dots AND permanent engine damage on a 3-heart ladder — each crash
// knocks a growing share off the top speed (multiplicative), and the
// third crash kills the engine outright: controls cut, a dying coast,
// then game over
const CRASH_FUEL = 2;
const CRASH_SPEED_STEPS = [0.03, 0.05, 0.07];
const CRASH_MAX = 3; // hearts — the third crash is fatal
// potholes swept under and just ahead of a crash respawn — a hole
// parked where the car materialises would punish the same mistake twice
const RESPAWN_CLEAR_SEGMENTS = 8;
// bracket-crossing reward (each tier once per run): a lost heart back,
// or — at full hearts — a streak shield with this many charges. Every
// streak break the shield eats costs one charge instead of the chain
const SHIELD_MAX = 3;
const DYING_TIME = 2.2; // total seconds between the fatal hit and game over
// the wreck doesn't coast forever: a hard linear decel (on top of the
// normal rolling drag) brings it to a standstill within this window,
// then the smoke hangs for the remainder of DYING_TIME
const DYING_STOP_T = 1.66;
// out-of-fuel doom check: a dry tank normally ends the run at a full
// standstill — but below this coast speed the remaining roll-out distance
// is computable (exponential drag integrates to speed/ROLL_DRAG), and if
// NO collectible can sits inside it the run is mathematically over. The
// score freezes and the game ends after a short fade instead of making
// the player watch a hopeless crawl die over ten seconds
const DOOM_KMH = 25;
const DOOM_FADE_T = 1.0;
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
// instead of going to waste: 1.5 s per wasted dot, top speed 180 → ~202 km/h
// with a harder pull — full-tank can chains stay worth steering for, and
// the extra reach is what lets a hot boost chain actually bridge the gap
// to the NEXT can before the clock kills it
const BOOST_TOP = 1.12;
const BOOST_ACCEL = 1.3;
const BOOST_PER_DOT = 1.5;
// every boost grant ADDS to the shared pool with NO ceiling — chaining a
// fresh can into the last fraction of a running boost stacks, and a hot
// streak can bank a long run of free speed. The drain keeps ticking at
// the normal rate through it, so a huge pool is pace you've earned, not
// time you've stolen
// golden can: 3 dots + a flat 2 s of BOOST — a small sweet bonus that
// doesn't overshadow the streak ladder
const GOLDEN_BOOST_T = 2;
// hot-chain bonus: a NON-streak can (any size, golden included) grabbed
// while a boost is still burning adds a flat +0.5 s — the pace reward
// that lets a flat-out driver bridge one boost into the next
const BOOST_CHAIN_T = 0.5;
// fuel-chain streak ladder, repeating every 10 cans: +4 s at 3, +6 s at
// 5, +9 s at each multiple of 10 (10/20/30…). A full clean lap pays 19 s —
// the 20 s (4+6 twice) a player earns by DELIBERATELY breaking a chain
// after the lap and re-farming 3/5, so the raw seconds are near-neutral
// either way — the LAP_FUEL dots below are the decider: a completed lap
// pays +2 fuel, and a single miss resets the streak before the lap
// completes, so staying clean still strictly wins (the deep-game economy
// is calibrated so a PERFECT chain is sustainable forever while even a
// 1-in-10 miss rate slowly bleeds out — the lap bonus is exactly the
// margin a misser never earns)
const LAP_FUEL = 2;
const streakReward = (streak: number): number => {
  const lap = streak % 10 === 0 ? 10 : streak % 10; // position in the ladder
  return lap === 10 ? 9 : lap === 5 ? 6 : lap === 3 ? 4 : 0;
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
const FAR_OFFROAD = 1.18; // |playerX| at/above this = stranded: a touch past the rumble strips (road edge ~1.1) — half the car over the grass is a respawn WITH or WITHOUT a tree there, and roadside pines (offset ≥ ~1.15) stay reachable so the tree crash rule lives
const LANES = 3;

/* the cat easter egg: exactly once per run (whenever the sprite sheet
   loaded — there is no spawn roll), somewhere between 200 m and
   CAT_MAX_KM km (run-random, NOT day-seeded — every player's encounter
   lands somewhere else; the first 200 m are always cat-free so the run
   can settle first). It steps out of the roadside cover and walks across
   the tarmac; running it over bypasses the heart ladder and ends the run
   on the spot */
const CAT_MAX_KM = 10;
// display-km → segments at the 180 km/h reference pace: 1 km = 20 s =
// 1200 frames = 1200 segments
const CAT_MAX_SEGS = CAT_MAX_KM * 1200;
const CAT_MIN_SEGS = 240; // 200 m — never earlier, in anyone's run
const CAT_WALK_SPEED = 0.55; // road half-widths per second — a stroll
const CAT_TRIGGER_SEGS = 320; // starts crossing when the car is this near
const CAT_HIT_X = 0.26; // lateral hit window (a touch under the can's 0.28)
const CAT_SCALE = 1.8; // roadside-sprite scale factor (bush = 2.2)

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

/** the cat easter egg's frames, cut from the site's 32px-cell sheet
    (public/images/cat-sprite.png — same file RetroCat uses): 8 walk
    frames per direction, the crouch pose it flies off in, and the
    front-facing sit for the mid-crossing stop-and-stare */
export interface CatFrames {
  left: HTMLCanvasElement[];
  right: HTMLCanvasElement[];
  jump: HTMLCanvasElement;
  front: HTMLCanvasElement;
}

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
  /** dev-only (e2e probes): the cat easter egg's live state */
  debugCat?: () => {
    spawned: boolean;
    segIdx: number;
    x: number;
    crossing: boolean;
    gone: boolean;
    hit: boolean;
  };
  /** dev-only (e2e probes): force-spawn the cat at an absolute segment */
  debugForceCat?: (segIdx: number) => void;
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
  /** cat easter-egg frames — null when the sprite sheet is missing (the
      run then rolls no cat at all) */
  cat?: CatFrames | null;
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
  /** fired on the THIRD crash — the engine dies: the run ends in a
      driverless coast, so play the breakdown sputter instead of crash() */
  onBreakdown?: () => void;
  /** fired the instant the car hits the crossing cat (fatal — the
      breakdown sputter follows through the normal fatal path) */
  onCatHit?: () => void;
  /** fired when the score crosses into a higher league bracket (once per
      tier per run) — the engine grants +1 heart or a streak shield, this
      is the fanfare hook */
  onBracket?: (name: string) => void;
  /** dev-only (e2e probes): collect per-render road diagnostics into
      `probe` — off in production so the game ships zero per-frame garbage */
  debug?: boolean;
  /** the day's composite track difficulty 1-10 (from `analyzeTrack`) —
      scales the score-based can-hiding rate between 1% (easy) and 0.1%
      (cruel) per 1500 pts so daily map luck can't swing the leaderboard */
  mapDifficulty?: number;
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
  /* score-based scarcity scales with the day's rated difficulty (1-10,
     from the TODAY'S TRACK analysis): an easy map hides cans at 1% per
     1500 pts so a chill day doesn't print free records, a cruel map at
     0.1% — on a hard day the road itself is the hardship, not the can
     lottery. Unknown difficulty (analysis failed) parks at the mid rate */
  const scarcityStep = (() => {
    const d = Math.min(10, Math.max(1, opts.mapDifficulty ?? 5.5));
    return 0.01 - ((d - 1) / 9) * 0.009;
  })();
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
  // streak shield: charges left, and the last time one ate a break (for
  // the HUD flash). Granted at SHIELD_MAX by a bracket crossed at full
  // hearts — see the bracket reward in update()
  let shieldCharges = 0;
  let shieldSavedAt = -10;
  // bracket reward ladder: index into RACER_BRACKETS (descending mins) of
  // the tier the score currently sits in — crossing into the NEXT tier up
  // pays +1 heart (a lost one only; the speed damage is permanent) or,
  // at full hearts, a full streak shield
  let bracketIdx = RACER_BRACKETS.length - 1; // IRON at score 0
  let lastBracketAt = -10;
  let lastBracketName = "";
  let lastBracketColor = "#ffd94a";
  let lastBracketGrant: "heart" | "shield" = "heart";
  // mercy can: one rescue can per dry spell, injected by update() when
  // the tank runs below 1.5 dots with nothing collectible ahead
  let mercyUsed = false;
  // the cat easter egg: one crossing per run (needs the sprite sheet —
  // no spawn roll, everyone meets it). It waits dormant at its absolute
  // segment until the car closes to CAT_TRIGGER_SEGS, then walks across
  // the road, ping-ponging between the verges so a slow approach doesn't
  // miss it — and may freeze mid-crossing to stare down the oncoming car
  const catFrames = opts.cat ?? null;
  const cat = {
    spawned: false,
    segIdx: -1,
    x: 0,
    dir: 1 as 1 | -1,
    crossing: false,
    gone: false,
    pauseT: 0, // >0: frozen mid-crossing, facing the oncoming car
    pauseCd: 0, // cooldown so it can't stutter stop-and-go
    hitAt: -10, // engine time of the fatal hit (-1... uses -10 sentinel)
    // screen-space ballistic flight after the hit (flyCans-style, but
    // gravity-driven and up-and-over, never down through the floor)
    flyX: 0,
    flyY: 0,
    flyVX: 0,
    flyVY: 0,
  };
  if (catFrames) {
    cat.spawned = true;
    // somewhere between CAT_MIN_SEGS (200 m — never earlier, in anyone's
    // run) and CAT_MAX_KM out
    cat.segIdx = Math.floor(
      CAT_MIN_SEGS + Math.random() * (CAT_MAX_SEGS - CAT_MIN_SEGS),
    );
  }
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
  // scarcity ramps with score: every 1500 points hides another slice of
  // the track's cans (capped at 40% — the cap is calibrated with the drain
  // cap so a PERFECT chain stays sustainable in the deep game while a
  // 1-in-10 miss rate slowly bleeds out; see LAP_FUEL). The slice size is
  // `scarcityStep`: 1% on the easiest daily maps down to 0.1% on cruel
  // ones, so the fuel lottery can't widen the score gap between days.
  // The divisor rides the score scale (score accrues at ×0.5).
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
    const hidden = Math.min(0.4, Math.floor(state.score / 1500) * scarcityStep);
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

  // the full pickup grant — fuel dots, overflow/golden boost, streak and
  // ladder rewards, the fly-can. Shared by the drive-through scan in
  // update() and the crash-respawn landing check below (the teleport can
  // plant the car squarely on a can: the sprite visibly covers it, so
  // leaving it ungrabbed feels broken)
  function grabCan(seg: Segment) {
    const pk = seg.pickup;
    if (!pk) return;
    const amount = pk.golden ? 3 : pk.big ? 2 : 1;
    // captured BEFORE this pickup's own grants: a can driven through
    // while a boost still burns is a hot-chain grab
    const hadBoost = state.boostT > 0;
    // a can grabbed with a near-full tank doesn't go to waste:
    // the overflow burns off as BOOST seconds instead
    const overflow = state.fuel + amount - FUEL_MAX;
    if (overflow > 0) {
      // floor at half a second: a can grabbed at 7.01 dots only
      // overflows 0.01, but the steer still cost something — a
      // 0.02 s boost would be an insult, not a reward
      state.boostT += Math.max(overflow * BOOST_PER_DOT, 0.5);
      lastBoostSource = "overflow";
    }
    if (pk.golden) {
      // golden can: a flat 1 s of BOOST on top of the 3 dots —
      // the label outranks an overflow grant from the same pickup
      state.boostT += GOLDEN_BOOST_T;
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
      state.boostT += reward;
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
          state.boostT += Math.max(lapOverflow * BOOST_PER_DOT, 0.5);
        }
        state.fuel = Math.min(FUEL_MAX, state.fuel + LAP_FUEL);
      }
    } else if (hadBoost) {
      // hot chain: a non-streak can grabbed mid-boost stretches the
      // burn a touch — the reward for keeping the pace up between
      // ladder steps
      state.boostT += BOOST_CHAIN_T;
    }
    opts.onPickup?.(pk.big ?? false, pk.golden ?? false);
  }

  // permanent crash damage on a 3-heart ladder: every crashRespawn knocks
  // CRASH_SPEED_STEPS[crashes-1] off the top speed, stacking
  // multiplicatively — a crumpled car is a slower car for the rest of the
  // run, and the third heart lost kills the engine for good
  let crashes = 0;
  let damageMul = 1;
  // fatal-crash coast: controls are cut, the car rolls out on its own
  // momentum under a smoke cloud, then game over
  let dying = false;
  let dyingT = 0;
  // doom fade: the tank is dry, the coast is slow and the math says no
  // can is reachable — >0 counts down the last beat before game over.
  // doomCredit is the score the remaining roll-out WOULD have earned:
  // the player is paid for every last metre the car could have rolled,
  // credited the moment the fade ends (a mid-fade revive never saw it)
  let doomT = 0;
  let doomCredit = 0;
  // centre banner state for the crash cost readout (cause + penalties)
  let lastCrashAt = -10;
  let lastCrashCause: "pothole" | "tree" | "offroad" | "cat" = "offroad";
  // shared crash: stranded off-road, a pothole or a roadside pine all
  // cost the same — CRASH_FUEL dots, a broken chain, a heart. The first
  // two also mean a centre-line respawn; the third is fatal and lets the
  // car coast out where it crashed. ("cat" only ever arrives with the
  // heart ladder pre-sunk — it IS the fatal crash)
  const crashRespawn = (cause: "pothole" | "tree" | "offroad" | "cat") => {
    if (dying) return; // already coasting to the end — no double jeopardy
    crashes++;
    state.fuel = Math.max(0, state.fuel - CRASH_FUEL);
    damageMul *= 1 - CRASH_SPEED_STEPS[Math.min(crashes - 1, CRASH_MAX - 1)];
    lastCrashAt = state.time;
    lastCrashCause = cause;
    // the shield eats the chain break too (a charge instead of the
    // streak) — the heart, fuel and speed penalties still land
    if (state.streak > 0) {
      if (shieldCharges > 0) {
        shieldCharges--;
        shieldSavedAt = state.time;
      } else {
        lastStreakLostAt = state.time;
        state.streak = 0;
      }
    }
    // a crash kills the boost: the chain is broken, so is the free
    // speed — without this the boost pull (huge at low km/h) rocketed
    // the respawned car back to top speed in barely a second
    state.boostT = 0;
    // a crash mid-hop must not land the car into a squash + grip penalty
    // it never earned
    airT = 0;
    landT = 0;
    gripT = 0;
    if (crashes >= CRASH_MAX) {
      // fatal: no teleport, no speed cut — keep the momentum and let the
      // dead engine bleed it off for a beat of drama before game over
      dying = true;
      dyingT = DYING_TIME;
      opts.onBreakdown?.();
      return;
    }
    state.respawn = RESPAWN_TIME;
    state.speed = 0;
    state.playerX = 0;
    // no double jeopardy: sweep every pothole under and just ahead of the
    // respawn spot — a hole on the car's own segment is invisible under
    // the sprite, and one a couple of segments out is unreadable from a
    // standstill; either would punish the same mistake twice
    const carSeg = Math.floor((state.position + PLAYER_Z) / SEGMENT_LENGTH);
    for (let i = 0; i < RESPAWN_CLEAR_SEGMENTS; i++) {
      segments[ringSlot(carSeg + i)].hole = undefined;
    }
    // landed on a can? The teleport plants the car at the centre line —
    // if a can sits within the SPRITE's own half-width (~0.35, wider than
    // the drive-through point check) the car is visibly standing on it,
    // and leaving it ungrabbed reads as a bug, not a rule
    for (let i = 0; i <= 2; i++) {
      const seg = segments[ringSlot(carSeg + i)];
      const pk = seg.pickup;
      if (pk && pickupActive(seg) && Math.abs(pk.x * canSpread) < 0.35) {
        grabCan(seg);
        break;
      }
    }
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
    if (dying) {
      // fatal crash: the driver's foot is off everything — a hard linear
      // decel (plus the rolling drag below) parks the wreck within
      // DYING_STOP_T, then the smoke hangs until the timer runs out
      input = { left: false, right: false, gas: false, brake: false };
      state.speed = Math.max(0, state.speed - (MAX_SPEED / DYING_STOP_T) * dt);
      dyingT -= dt;
      if (dyingT <= 0) {
        state.gameOver = true;
        return;
      }
    }
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
    // analog pedals: the gamepad triggers carry a 0..1 pull, the keyboard
    // falls back to full/no travel through the boolean flags
    const gasAmt = Math.max(
      0,
      Math.min(1, input.gasAmt ?? (input.gas ? 1 : 0)),
    );
    const brakeAmt = Math.max(
      0,
      Math.min(1, input.brakeAmt ?? (input.brake ? 1 : 0)),
    );
    // stop lamps / skid audio arm past a hair of trigger travel, so a
    // noisy resting LT never glows
    state.braking = brakeAmt > 0.12;

    // the boost top-speed ceiling eases in AND out: when the boost burns
    // out, the extra speed bleeds off over ~a second of aero drag instead
    // of snapping back to the 180 cap in a single frame
    boostTop +=
      ((state.boostT > 0 ? BOOST_TOP : 1) - boostTop) * Math.min(1, dt * 2.2);
    const boostMix = (boostTop - 1) / (BOOST_TOP - 1); // smoothed 0..1

    if (gasAmt > 0 && state.fuel > 0 && state.shiftT <= 0) {
      // throttle follows the measured km/h curve of the real car; BOOST
      // lifts the ceiling from 180 to ~194 km/h with a harder pull. An
      // analog half-pull is a genuine half throttle — feathering the
      // trigger holds a cruising speed below the ceiling
      const kmh = (state.speed / MAX_SPEED) * 180;
      const normalAccel = ACCEL_KMH(kmh);
      const boostPull = Math.max(normalAccel, (180 * BOOST_TOP - kmh) * 0.4);
      const accel = normalAccel + (boostPull - normalAccel) * boostMix;
      state.speed +=
        ((accel * gasAmt * (1 + (BOOST_ACCEL - 1) * boostMix)) / 180) *
        MAX_SPEED *
        dt;
    } else if (brakeAmt > 0) state.speed += BRAKING * brakeAmt * dt;
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
    // the ceiling carries crash damage: boost lifts it, damage lowers it
    state.speed = Math.max(
      0,
      Math.min(MAX_SPEED * boostTop * damageMul, state.speed),
    );

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
      (gasAmt <= 0 || state.fuel <= 0) &&
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
    // NOTE: the out-of-fuel game-over check lives AFTER the pickup scan
    // below — a dry car stopped ON a can must get its grab first

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
        // pothole: falling in costs the same as running stranded —
        // CRASH_FUEL dots, a centre-line respawn and a broken chain.
        // Consumed on impact, so the standstill right after the respawn
        // can't re-trigger it. AIRBORNE cars clear holes (the wheels are
        // off the tarmac) — but landing ON one still counts: airT zeroes
        // in the hop block above before this scan runs, so a touchdown
        // on the hole segment hits
        const hole = seg.hole;
        if (
          hole &&
          airT <= 0 &&
          Math.abs(state.playerX - hole.x) < 0.28 &&
          state.speed > MAX_SPEED * 0.02
        ) {
          seg.hole = undefined;
          crashRespawn("pothole");
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
            crashRespawn("tree");
            break;
          }
        }
        // the crossing cat: a MOVING hazard — running it over skips the
        // heart ladder entirely and ends the run where it happened.
        // AIRBORNE cars clear it like a pothole (the wheels are off the
        // tarmac), and a dying wreck can't double-dip
        if (
          cat.crossing &&
          !cat.gone &&
          !dying &&
          si === cat.segIdx &&
          airT <= 0 &&
          Math.abs(state.playerX - cat.x) < CAT_HIT_X &&
          state.speed > MAX_SPEED * 0.02
        ) {
          cat.gone = true;
          cat.hitAt = state.time;
          // launch up-and-over, away from the impact side (never down
          // through the floor) — integrated in update, drawn screen-space
          cat.flyX = width / 2 + (cat.x - state.playerX) * width * 0.2;
          cat.flyY = height * (state.view === "cockpit" ? 0.3 : 0.55);
          const side = Math.sign(cat.x - state.playerX) || cat.dir;
          cat.flyVX = side * width * 0.22;
          cat.flyVY = -height * 0.95;
          opts.onCatHit?.();
          // the heart ladder doesn't apply: sink it, then let the shared
          // fatal path (dying coast, smoke, banner) take over
          crashes = CRASH_MAX - 1;
          crashRespawn("cat");
          break;
        }
        if (state.respawn > 0) break;
        const pk = seg.pickup;
        // scarcity-hidden cans aren't on the road — passing them neither
        // counts nor breaks a streak. A missed can is dead weight — its
        // break already fired once, never again
        if (!pk || pk.missed || !pickupActive(seg)) continue;
        if (
          Math.abs(state.playerX - pk.x * canSpread) < 0.24 &&
          // a dry tank waives the speed gate: the coast-over-checkpoint
          // mercy must also work at a dying crawl — even dead-stopped on
          // the can, the car is VISIBLY on the fuel
          (state.speed > MAX_SPEED * 0.02 || state.fuel <= 0)
        ) {
          grabCan(seg);
        } else if (si < nextPickupSeg) {
          // the can is fully behind the pickup point — missed, and the
          // chain is broken... unless a shield charge eats the break
          // (then the HUD flashes the save instead of burning the can
          // away). Fire EXACTLY ONCE: below ~130 km/h the car needs 2+
          // frames to cross a segment, and the scan window keeps the
          // segment in range the whole time — without the missed mark
          // the break re-fired every frame, draining EVERY shield
          // charge and then the streak for a single skipped can.
          // (si === nextPickupSeg defers: a car still ON the can's
          // segment — stopped beside it, or rolling in too slow for
          // the speed gate — gets its grab chance until it leaves)
          pk.missed = true;
          if (state.streak > 0) {
            if (shieldCharges > 0) {
              shieldCharges--;
              shieldSavedAt = state.time;
            } else {
              lastStreakLostAt = state.time;
              state.streak = 0;
            }
          }
        }
      }
      // out of fuel + standstill = game over — but only AFTER the pickup
      // scan: a dry car stopped ON a can just grabbed it above and
      // revives instead of dying on top of the fuel
      if (state.fuel <= 0 && state.speed <= 0) state.gameOver = true;
      // mercy can: below 1.5 dots with nothing collectible in the next ~90
      // segments, one can materialises on a reachable line ~60 segments
      // out — ONCE per run, ever (mercyUsed never re-arms), and only in
      // the early game (level ≤ MERCY_MAX_LEVEL): past that the economy
      // must carry the run
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
      // doom check: dry tank + slow coast + no collectible can inside the
      // remaining roll-out distance = the run is already lost, only the
      // waiting remains. Freeze the score and end it after a short fade.
      // The roll-out integrates the exponential drag analytically
      // (distance = speed / ROLL_DRAG), padded 25% for downhill hope; a
      // live mercy can ahead always counts as reachable — rescuing this
      // exact situation is its whole point
      if (state.fuel <= 0 && !dying) {
        if (doomT > 0) {
          doomT -= dt;
          if (doomT <= 0) {
            // pay the coast credit: the score the remaining roll-out
            // would have earned, down to the car's last metre
            state.score += doomCredit;
            doomCredit = 0;
            state.gameOver = true;
          }
        } else if (
          state.speed > 0 &&
          (state.speed / MAX_SPEED) * 180 < DOOM_KMH
        ) {
          const playerSegIdx = Math.floor(
            (state.position + PLAYER_Z) / SEGMENT_LENGTH,
          );
          const reachSegs =
            Math.ceil((state.speed / ROLL_DRAG / SEGMENT_LENGTH) * 1.25) + 2;
          let canAhead = false;
          for (
            let si = playerSegIdx;
            si < playerSegIdx + Math.max(reachSegs, 90);
            si++
          ) {
            const seg = segments[ringSlot(si)];
            if (seg.index !== si) break; // generator hasn't reached this slot
            const pk = seg.pickup;
            if (!pk || pk.missed || !pickupActive(seg)) continue;
            if (si < playerSegIdx + reachSegs || pk.ordinal < 0) {
              canAhead = true;
              break;
            }
          }
          if (!canAhead) {
            doomT = DOOM_FADE_T;
            // the doomed roll-out's worth, in score: world units ×
            // 50/MAX_SPEED = metres (the live formula's kmh·dt/3.6), at
            // the ×0.5 arcade scale — the multiplier is 1 this deep into
            // a crawl anyway. Credited when the fade ends, so a mid-fade
            // revive never sees it
            doomCredit =
              ((state.speed / ROLL_DRAG) * 1.25 * 50 * 0.5) / MAX_SPEED;
          }
        }
      } else {
        doomT = 0; // revived mid-fade (a downhill roll into a can) — live on
        doomCredit = 0;
      }
      // stranded on the grass past the rumble strips: respawn on the
      // centre line at a standstill with a breathing fade-in — a
      // CRASH_FUEL-dot penalty plus permanent speed damage, so crashing
      // directly shortens AND slows the run
      if (Math.abs(state.playerX) >= FAR_OFFROAD) crashRespawn("offroad");
    }

    // the cat: dormant until the car closes in, then a stroll back and
    // forth across the tarmac (ping-pong between the verges, so a slow
    // approach still meets it mid-road instead of finding it long gone).
    // Passed by unhit? The road behind never comes back — one chance
    if (cat.hitAt >= 0) {
      // ballistic flight after the hit: a gravity arc up and off to the
      // impact side — the render's age check handles the despawn
      cat.flyVY += height * 2.4 * dt;
      cat.flyX += cat.flyVX * dt;
      cat.flyY += cat.flyVY * dt;
    } else if (cat.spawned && !cat.gone) {
      const carSegNow = Math.floor(
        (state.position + PLAYER_Z) / SEGMENT_LENGTH,
      );
      if (!cat.crossing) {
        if (carSegNow >= cat.segIdx - CAT_TRIGGER_SEGS) {
          cat.crossing = true;
          cat.dir = Math.random() < 0.5 ? 1 : -1;
          cat.x = -cat.dir * 1.9; // steps out of the verge cover
        }
      } else if (carSegNow > cat.segIdx + 2) {
        cat.gone = true;
      } else if (cat.pauseT > 0) {
        // frozen mid-crossing, staring down the oncoming car
        cat.pauseT = Math.max(0, cat.pauseT - dt);
        if (cat.pauseT === 0) cat.pauseCd = 1.5; // no stutter stop-and-go
      } else {
        cat.pauseCd = Math.max(0, cat.pauseCd - dt);
        cat.x += cat.dir * CAT_WALK_SPEED * dt;
        // the random stop-and-stare: only while actually ON the tarmac
        // (a freeze out on the grass would read as a statue, not a cat)
        if (
          cat.pauseCd <= 0 &&
          Math.abs(cat.x) < 1.0 &&
          Math.random() < dt * 0.35
        ) {
          cat.pauseT = 0.8 + Math.random() * 0.8;
        }
        if (cat.x > 1.9) {
          cat.x = 1.9;
          cat.dir = -1;
        } else if (cat.x < -1.9) {
          cat.x = -1.9;
          cat.dir = 1;
        }
      }
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
    // doomed (dry tank, no reachable can): the score freezes — the run is
    // over, only the fade-out beat remains
    if (doomT <= 0) state.score += ((kmh * dt) / 3.6) * state.multiplier * 0.5;

    // bracket reward: crossing into the next league tier (once per tier
    // per run — the index only ever climbs) pays +1 heart back, or a
    // full streak shield when the hearts are already topped up. The
    // crumpled chassis keeps its speed loss either way
    if (bracketIdx > 0 && state.score >= RACER_BRACKETS[bracketIdx - 1].min) {
      bracketIdx--;
      const b = RACER_BRACKETS[bracketIdx];
      lastBracketAt = state.time;
      lastBracketName = b.name;
      lastBracketColor = b.color;
      if (crashes > 0) {
        crashes--;
        lastBracketGrant = "heart";
      } else {
        shieldCharges = SHIELD_MAX;
        lastBracketGrant = "shield";
      }
      opts.onBracket?.(b.name);
    }

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
    // blind-zone candidates: objects so close their projection lands under
    // the car sprite (chase) / the dash (cockpit) or straight off the
    // bottom edge on a steep descent — crest-legal yet invisible. Occluder
    // rects only exist AFTER the object loop (car/dash draw later), so
    // candidates are collected here and the colour-coded markers drawn
    // after the ambient dim (green = fuel, red = hole)
    const blindObjs: {
      cx: number;
      top: number;
      bottom: number;
      w: number;
      kind: "can" | "hole";
    }[] = [];
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
            // low on the screen — possibly sliding under the car/dash
            if (destY + visibleH > height * 0.45) {
              blindObjs.push({
                cx: destX + destW / 2,
                top: destY,
                bottom: destY + visibleH,
                w: destW,
                kind: "can",
              });
            }
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
          // a near hole can sink under the car sprite / off the bottom
          // edge on a descent before the driver ever sees it
          if (hy + ry > height * 0.45) {
            blindObjs.push({
              cx: hx,
              top: hy - ry,
              bottom: hy + ry,
              w: rx * 2,
              kind: "hole",
            });
          }
        } else if (rx >= 2) {
          // crest-hidden: the same bobbing "?" the cans use — fuel or
          // hole, you only find out past the crest
          drawCrestMystery(hx, Math.round(segment.clip), rx, segment.index);
        }
      }

      // the crossing cat: drawn like a roadside sprite but at its LIVE x
      // (it walks), walk-cycling with the sheet's row. Crest-hidden cats
      // get the same mystery "?" cans and holes share — an instant-death
      // hazard must never be invisible
      if (
        catFrames &&
        cat.crossing &&
        !cat.gone &&
        segment.index === cat.segIdx
      ) {
        const scale = segment.p1.screen.scale;
        // frozen = sitting front, staring at the oncoming car
        const fr =
          cat.pauseT > 0
            ? catFrames.front
            : (cat.dir > 0 ? catFrames.right : catFrames.left)[
                Math.floor(state.time * 10) % 8
              ];
        const destW = fr.width * scale * (width / 2) * 4.2 * CAT_SCALE;
        const destH = fr.height * scale * (width / 2) * 4.2 * CAT_SCALE;
        if (destW >= 2) {
          const destX =
            segment.p1.screen.x +
            scale * cat.x * ROAD_WIDTH * (width / 2) -
            destW / 2;
          const destY = segment.p1.screen.y - destH;
          let visibleH = destH;
          if (segment.clip && destY + destH > segment.clip) {
            visibleH = segment.clip - destY;
          }
          if (visibleH > 0) {
            ctx.drawImage(
              fr,
              0,
              0,
              fr.width,
              (visibleH / destH) * fr.height,
              Math.round(destX),
              Math.round(destY),
              Math.round(destW),
              Math.round((visibleH / destH) * destH),
            );
          } else {
            drawCrestMystery(
              destX + destW / 2,
              Math.round(segment.clip || 0),
              destW,
              segment.index,
            );
          }
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
          // def offset re-centres asymmetric art (the lamp arm reaches
          // inward; its mast must stay on the verge line)
          scale * (s.offset + sprite.offset) * ROAD_WIDTH * (width / 2) -
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
        // cobra-head lamps only work after dark: a warm glow at the head
        // plus the soft pool the arm throws onto the tarmac below — by
        // day the lens stays dark glass (an always-lit lamp at noon read
        // as broken). All of it is clipped to the crest line: the hill
        // occludes exactly the part of the light it should, so the glow
        // stops at the skyline instead of shining through the ground —
        // and a fully hidden lamp throws no source-less pool
        const clipLine = segment.clip || Number.POSITIVE_INFINITY;
        if (
          (s.sprite === 3 || s.sprite === 6) &&
          skySt.night > 0.05 &&
          visibleH > destH * 0.15
        ) {
          const armDir = s.sprite === 3 ? 1 : -1;
          // head centre in the 52px art: 45.5/52 (arm-right) / 5.5/52
          const headX = destX + (armDir > 0 ? destW * 0.875 : destW * 0.106);
          const headY = destY + destH * 0.15;
          ctx.save();
          if (segment.clip) {
            ctx.beginPath();
            ctx.rect(0, 0, width, clipLine);
            ctx.clip();
          }
          const glowR = destW * 0.45;
          const lg = ctx.createRadialGradient(
            headX,
            headY,
            1,
            headX,
            headY,
            glowR,
          );
          lg.addColorStop(
            0,
            `rgba(255,236,170,${(0.75 * skySt.night).toFixed(3)})`,
          );
          lg.addColorStop(1, "rgba(255,236,170,0)");
          ctx.fillStyle = lg;
          ctx.fillRect(
            Math.round(headX - glowR),
            Math.round(headY - glowR),
            Math.round(glowR * 2),
            Math.round(glowR * 2),
          );
          // the light cone itself (the "huni"): a soft trapezoid widening
          // from the head down to the road, fading as it falls — a real
          // cobra head throws a broad pool, not a pencil beam
          const poolY = segment.p1.screen.y;
          const prx = destW * 1.0;
          const cone = ctx.createLinearGradient(0, headY, 0, poolY);
          cone.addColorStop(
            0,
            `rgba(255,236,170,${(0.28 * skySt.night).toFixed(3)})`,
          );
          cone.addColorStop(
            1,
            `rgba(255,240,190,${(0.05 * skySt.night).toFixed(3)})`,
          );
          ctx.fillStyle = cone;
          ctx.beginPath();
          ctx.moveTo(headX - destW * 0.2, headY);
          ctx.lineTo(headX + destW * 0.2, headY);
          ctx.lineTo(headX + prx, poolY);
          ctx.lineTo(headX - prx, poolY);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = `rgba(255,240,190,${(0.14 * skySt.night).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(
            Math.round(headX),
            Math.round(segment.p1.screen.y),
            Math.round(prx),
            Math.max(1, Math.round(prx * 0.3)),
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.restore();
        }
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
    // chase view: the car sprite's roof line and half width, captured so
    // the blind-zone markers know what the sprite occludes
    let carRoofY: number | null = null;
    let carHalfW = 0;
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
      carRoofY = carY;
      carHalfW = destW * 0.5;

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

      // engine damage smoke: a thin, steady wisp on the last heart; a
      // dense rising cloud while the dead engine coasts out. Puffs rise
      // from the car and fade with their phase so the column reads as
      // drifting upward rather than a static sprite
      if ((crashes === CRASH_MAX - 1 || dying) && car.smoke.length > 0) {
        const puffs = dying ? 3 : 1;
        for (let i = 0; i < puffs; i++) {
          const phase = (state.time * (dying ? 1.6 : 0.9) + i / puffs) % 1;
          const puff =
            car.smoke[(Math.floor(state.time * 10) + i * 2) % car.smoke.length];
          const puffW = destW * (dying ? 0.34 : 0.18) * (0.6 + phase);
          const puffH = (puff.h / puff.w) * puffW;
          ctx.globalAlpha = (dying ? 0.85 : 0.4) * (1 - phase);
          ctx.drawImage(
            puff.image,
            Math.round(
              width / 2 -
                puffW / 2 +
                shakeX +
                Math.sin(phase * 6 + i * 2.1) * destW * 0.06,
            ),
            Math.round(carY + destH * 0.1 - phase * destH * 0.9),
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

    // blind-zone markers: an object can be past the crest yet still
    // invisible — under the car sprite (chase), below the dash (cockpit)
    // or off the bottom edge on a steep descent — so a dead-centre
    // approach never learns WHAT it is. Only then (hills don't matter
    // here) an EXCLAMATION marks it over the occluder — not the crest's
    // amber "?", so the two never read as the same signal — colour-coded:
    // green = fuel, red = hole. Drawn after the ambient dim so it stays
    // legible at night — at this range it IS an instrument
    if (blindObjs.length > 0) {
      const coverTop = cockpitMode
        ? (dashGeom?.y ?? height)
        : (carRoofY ?? height);
      const coverHalf = cockpitMode ? width : carHalfW;
      for (const o of blindObjs) {
        const hTotal = o.bottom - o.top;
        if (hTotal <= 0) continue;
        const overlapX = Math.abs(o.cx - width / 2) < coverHalf + o.w * 0.5;
        const occludedFrom = Math.min(overlapX ? coverTop : Infinity, height);
        if ((o.bottom - Math.max(o.top, occludedFrom)) / hTotal <= 0.55)
          continue;
        const fs = Math.max(8, Math.round(width * 0.028));
        const bob = Math.round(
          Math.sin(state.time * 6 + o.cx * 0.13) * fs * 0.12,
        );
        const mx = Math.max(fs * 0.4, Math.min(width - fs * 0.4, o.cx));
        const ty = Math.round(coverTop - 3 - bob);
        ctx.font = `bold ${fs}px monospace`;
        ctx.fillStyle = "#141611";
        ctx.fillText("!", Math.round(mx - fs * 0.3) + 1, ty + 1);
        ctx.fillStyle = o.kind === "can" ? "#7ddc4f" : "#ff5252";
        ctx.fillText("!", Math.round(mx - fs * 0.3), ty);
      }
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

    // BOOST active: readout of the seconds left, big and centred at the
    // top of the screen — the arcade spot where the games that invented
    // this trope put it. SOLID while it burns: a countdown that vanishes
    // half the time reads as "boost ended" whenever two glances in a row
    // land on an off-phase. Only the last 3 s blink (urgency, faster)
    if (state.boostT > 0 && !state.gameOver) {
      const ui = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
      if (state.boostT > 3 || Math.floor(state.time * 6) % 2 === 0) {
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
      (state.streak >= 1 ||
        stAge < 1.2 ||
        lostAge < STREAK_BURN_T ||
        shieldCharges > 0) &&
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
      // streak shield: a yellow-green guardian ring around the jerrycan,
      // one pip per charge left dotted along its top-right arc. Pulses
      // gently so it reads as a living ward, not part of the can art
      if (shieldCharges > 0) {
        const cx = bx + iconW / 2;
        const cy = by + iconH / 2;
        const rr = iconW * 1.05;
        const pulse = 0.55 + 0.25 * Math.sin(state.time * 4);
        ctx.strokeStyle = `rgba(163,230,53,${(pulse * 0.35).toFixed(3)})`;
        ctx.lineWidth = Math.max(2, Math.round(3 * ui));
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(190,242,100,${pulse.toFixed(3)})`;
        ctx.lineWidth = Math.max(1, Math.round(1.2 * ui));
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < SHIELD_MAX; i++) {
          const a = ((-25 - i * 25) * Math.PI) / 180;
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          ctx.fillStyle = i < shieldCharges ? "#bef264" : "rgba(20,22,17,0.45)";
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1, 1.3 * ui), 0, Math.PI * 2);
          ctx.fill();
        }
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
      } else if (shieldCharges > 0) {
        // armed shield on a cold chain: the bare can still stands so the
        // guardian ring has something to guard
        drawCan(1);
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
      // shield-save flash: a charge just ate a chain break — say so in
      // the ring's own colour, same popup zone
      const saveAge = state.time - shieldSavedAt;
      if (saveAge < 0.9) {
        const msg = "SHIELD!";
        ctx.font = `bold ${Math.round(8 * ui)}px monospace`;
        const tx = margin;
        const ty = by + iconH + Math.round(10 * ui);
        ctx.globalAlpha = Math.max(
          0,
          Math.min(1, Math.min(saveAge / 0.1, (0.9 - saveAge) / 0.3)),
        );
        ctx.fillStyle = "#141611";
        ctx.fillText(msg, tx + 1, ty + 1);
        ctx.fillStyle = "#bef264";
        ctx.fillText(msg, tx, ty);
        ctx.globalAlpha = 1;
      }
    }

    // heart meter: 3 pixel hearts, one per crash the car can still take —
    // full red while intact, a hollow outline once lost. Always on screen
    // (arcade convention): same left column as the streak can, parked
    // under its popup zone
    if (!state.gameOver) {
      const uiBase = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
      const ui =
        uiBase * (height > width ? 2.5 : opts.clusterTopLeft ? 1.4 : 1);
      const margin = Math.round(8 * ui);
      const streakBy = opts.clusterTopLeft
        ? Math.round((TOUCH_CLUSTER_TOP + 52) * uiBase + 10 * ui)
        : margin;
      const ps = Math.max(1, Math.round(1.6 * ui)); // heart pixel size
      const hy0 = streakBy + Math.round(34 * ui);
      // 7x6: full silhouette and the hollow outline of the same heart
      const HEART_FULL = [
        ".XX.XX.",
        "XXXXXXX",
        "XXXXXXX",
        ".XXXXX.",
        "..XXX..",
        "...X...",
      ];
      const HEART_RING = [
        ".XX.XX.",
        "X..X..X",
        "X.....X",
        ".X...X.",
        "..X.X..",
        "...X...",
      ];
      const stamp = (map: string[], hx: number, style: string) => {
        ctx.fillStyle = style;
        for (let r = 0; r < map.length; r++)
          for (let c = 0; c < map[r].length; c++)
            if (map[r][c] === "X")
              ctx.fillRect(hx + c * ps, hy0 + r * ps, ps, ps);
      };
      for (let i = 0; i < CRASH_MAX; i++) {
        const hx = margin + i * Math.round(9 * ps);
        if (i < CRASH_MAX - crashes) {
          stamp(HEART_FULL, hx, "#e5484d");
          stamp(HEART_RING, hx, "#141611");
        } else {
          // lost heart: just the outline, slightly faded
          ctx.globalAlpha = 0.75;
          stamp(HEART_RING, hx, "#141611");
          ctx.globalAlpha = 1;
        }
      }
    }

    // collected cans in flight to the streak icon: the exact sprite copy
    // (golden tint and big-can size included) arcs over the world and
    // docks onto the HUD jerrycan, shrinking as it goes — docking fires
    // the yellow halo above. Drawn over the HUD so the arc never clips
    // the launched cat: a ballistic arc in screen space (integrated in
    // update), the sheet's crouch pose facing the flight direction
    if (catFrames && cat.hitAt >= 0) {
      const age = state.time - cat.hitAt;
      if (age < 1.4) {
        const fr = catFrames.jump;
        const s = Math.max(6, Math.round(height * 0.09));
        ctx.save();
        ctx.translate(Math.round(cat.flyX), Math.round(cat.flyY));
        if (cat.flyVX < 0) ctx.scale(-1, 1);
        ctx.drawImage(fr, -s / 2, -s / 2, s, s * (fr.height / fr.width));
        ctx.restore();
      }
    }

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

    // crash banner: the cause and what it just cost, centre screen in the
    // LEVEL banner's face but danger red — the player must SEE the -2 gas
    // and the permanent speed loss, not discover them on the gauge
    const crashAge = state.time - lastCrashAt;
    if (crashAge < 1.8 && !state.gameOver) {
      const ui = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
      const label =
        lastCrashCause === "pothole"
          ? "POTHOLE!"
          : lastCrashCause === "tree"
            ? "TREE!"
            : lastCrashCause === "cat"
              ? "CAT!"
              : "OFF ROAD!";
      const msg =
        crashes >= CRASH_MAX
          ? `${label} ENGINE DEAD!`
          : `${label} -${CRASH_FUEL} GAS -${Math.round(CRASH_SPEED_STEPS[Math.min(crashes - 1, CRASH_MAX - 1)] * 100)}% SPEED`;
      ctx.font = `bold ${Math.round(10 * ui)}px monospace`;
      const tw = ctx.measureText(msg).width;
      const tx = Math.round(width / 2 - tw / 2);
      const ty = Math.round(height * 0.36);
      ctx.globalAlpha = Math.max(
        0,
        Math.min(1, Math.min(crashAge / 0.15, (1.8 - crashAge) / 0.5)),
      );
      ctx.fillStyle = "#141611";
      ctx.fillText(msg, tx + 2, ty + 2);
      ctx.fillStyle = "#e5484d";
      ctx.fillText(msg, tx, ty);
      ctx.globalAlpha = 1;
    }

    // bracket banner: the tier just crossed and what it paid, in the
    // tier's own league colour — parked below the record banner's slot
    // (0.42 h) so a record and a bracket can land the same second
    const brAge = state.time - lastBracketAt;
    if (brAge < 1.8 && !state.gameOver) {
      const ui = Math.min(width / RACER_WIDTH, height / RACER_HEIGHT);
      const msg =
        lastBracketGrant === "heart"
          ? `${lastBracketName}! +1 HEART`
          : `${lastBracketName}! SHIELD x${SHIELD_MAX}`;
      ctx.font = `bold ${Math.round(10 * ui)}px monospace`;
      const tw = ctx.measureText(msg).width;
      const tx = Math.round(width / 2 - tw / 2);
      const ty = Math.round(height * 0.48);
      ctx.globalAlpha = Math.max(
        0,
        Math.min(1, Math.min(brAge / 0.15, (1.8 - brAge) / 0.5)),
      );
      ctx.fillStyle = "#141611";
      ctx.fillText(msg, tx + 2, ty + 2);
      ctx.fillStyle = lastBracketColor;
      ctx.fillText(msg, tx, ty);
      ctx.globalAlpha = 1;
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

  const debugCat =
    process.env.NODE_ENV === "production"
      ? undefined
      : () => ({
          spawned: cat.spawned,
          segIdx: cat.segIdx,
          x: cat.x,
          crossing: cat.crossing,
          gone: cat.gone,
          hit: cat.hitAt >= 0,
        });
  const debugForceCat =
    process.env.NODE_ENV === "production"
      ? undefined
      : (segIdx: number) => {
          cat.spawned = true;
          cat.segIdx = segIdx;
          cat.gone = false;
          cat.crossing = false;
          cat.hitAt = -10;
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
    debugCat,
    debugForceCat,
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
