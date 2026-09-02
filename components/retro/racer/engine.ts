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
}

export interface CarFrame {
  image: CanvasImageSource;
  w: number;
  h: number;
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
      (±1 = edge). respawnAt: engine time when a taken can re-arms */
  pickup?: { x: number; respawnAt: number };
  color: typeof COLORS.light | typeof COLORS.dark;
  clip: number;
  looped: boolean;
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
// real Twingo pace, in km/h per second of throttle: 0-100 km/h in ~16 s,
// 100-170 in another ~15 s, then it wheezes toward the 180 km/h ceiling
const ACCEL_KMH = (kmh: number): number =>
  kmh < 100 ? 100 / 16 : kmh < 170 ? 70 / 15 : Math.max(0, (180 - kmh) * 0.2);
const BRAKING = -MAX_SPEED;
const DECEL = -MAX_SPEED / 5;
const OFFROAD_DECEL = -MAX_SPEED * 0.75;
const OFFROAD_LIMIT = MAX_SPEED / 4;
const CENTRIFUGAL = 0.3;
const RESPAWN_TIME = 2.6; // seconds of "breathing" fade after a respawn
const FUEL_MAX = 8; // dots on the cluster's fuel gauge
// the tank drains quadratically with speed: full throttle burns a dot
// in ~6 s, gentle cruising sips — miss a few cans in a row at speed
// and the gauge visibly melts
const FUEL_DRAIN_IDLE = 0.008; // gauge dots per second at a standstill
// extra dots per second at full speed — applied quadratically
// (speedPercent²), so burning up the road melts the gauge much faster
// than cruising; one dot lasts ~6 s flat out
const FUEL_DRAIN_SPEED = 0.16;
const PICKUP_RESPAWN = 45; // seconds before a taken gas can re-arms
const FAR_OFFROAD = 2.0; // |playerX| at/above this = stranded past the trees
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

export interface EngineState {
  position: number;
  playerX: number;
  speed: number;
  time: number;
  /** total distance driven, in display km (same scale as the 180 km/h top speed) */
  distanceKm: number;
  /** metres driven × speed multiplier — the arcade score */
  score: number;
  /** current score multiplier (1/2/3 by speed, 1 while off-road/respawning) */
  multiplier: number;
  /** >0 while the car respawns (breathing fade) after going too far off-road */
  respawn: number;
  /** fuel left, in gauge dots (0..8). 0 = engine dead, coasting to a stop */
  fuel: number;
  /** fuel ran dry and the car rolled to a standstill */
  gameOver: boolean;
  offRoad: boolean;
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
    looped: false,
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
) {
  p.camera.x = p.world.x - cameraX;
  p.camera.y = p.world.y - cameraY;
  p.camera.z = p.world.z - cameraZ;
  p.screen.scale = CAMERA_DEPTH / Math.max(p.camera.z, 0.0001);
  p.screen.x = Math.round(
    width / 2 + p.screen.scale * p.camera.x * (width / 2),
  );
  p.screen.y = Math.round(
    height / 2 - p.screen.scale * p.camera.y * (height / 2),
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

function makeSky(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, "#1a1c3f");
  g.addColorStop(0.55, "#7a3b69");
  g.addColorStop(0.8, "#e2703a");
  g.addColorStop(1, "#f7b32b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  // a low pixel sun
  ctx.fillStyle = "#ffd75e";
  const sunR = Math.round(width * 0.05);
  const sunX = Math.round(width * 0.68);
  const sunY = Math.round(height * 0.62);
  ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
  return c;
}

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
  const y0 = topLeft ? Math.round(8 * ui) : height - ph - Math.round(8 * ui);
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
  const scoreText = String(Math.min(99999, Math.floor(score))).padStart(5, " ");
  const scoreX = x0 + pw - pad - Math.round(7 * ui) - 5 * tW;
  const scoreY = y0 + pad + Math.round(4 * ui);
  for (let i = 0; i < 5; i++) {
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
  const count = Math.round(4 + 8 * intensity);
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    // deterministic per-line randomness, re-rolled a few times a second
    const seed = i * 61 + Math.floor(time * 16);
    const rand = Math.sin(seed * 127.1) * 43758.5453;
    const r = rand - Math.floor(rand);
    const side = i % 2 === 0 ? -1 : 1;
    const t0 = (r + time * (1.2 + 2.5 * intensity)) % 1;
    const t1 = Math.min(1, t0 + 0.05 + 0.12 * intensity);
    const bx = roadNearX + side * roadNearW * (1.06 + r * 0.25);
    const by = height + 4;
    const vx = vanishX + side * width * 0.015;
    const vy = horizonY;
    const e0 = t0 * t0;
    const e1 = t1 * t1;
    ctx.strokeStyle = `rgba(255,255,255,${(0.1 + 0.18 * intensity) * (0.35 + 0.65 * t0)})`;
    ctx.lineWidth = Math.max(1, (1 + 3 * t0) * (height / 270));
    ctx.beginPath();
    ctx.moveTo(vx + (bx - vx) * e0, vy + (by - vy) * e0);
    ctx.lineTo(vx + (bx - vx) * e1, vy + (by - vy) * e1);
    ctx.stroke();
  }
}

export interface RacerEngine {
  update(dt: number, input: RacerInput): void;
  render(ctx: CanvasRenderingContext2D): void;
  /** re-fit the renderer to a new buffer size (device rotated mid-run):
      game state is kept, only the prebuilt backdrop layers are rebuilt */
  resize(width: number, height: number): void;
  state: EngineState;
  trackLength: number;
}

export function createEngine(opts: {
  segments: Segment[];
  roadside: RoadsideSprite[];
  car: CarFrames;
  gasCan: CarFrame;
  reduceMotion?: boolean;
  /** buffer size — portrait viewports get a taller buffer so the game
      fills the phone screen instead of letterboxing into a thin strip */
  width?: number;
  height?: number;
  /** touch devices: LCD cluster goes top-left so the pedals don't cover it */
  clusterTopLeft?: boolean;
}): RacerEngine {
  const { segments, roadside, car, gasCan, reduceMotion } = opts;
  // mutable so resize() can re-fit the renderer when the device rotates
  let width = opts.width ?? RACER_WIDTH;
  let height = opts.height ?? RACER_HEIGHT;
  const trackLength = segments.length * SEGMENT_LENGTH;

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
    gameOver: false,
    offRoad: false,
  };

  // horizon parallax offsets (Lou: horizon slides opposite the curve)
  let skyOffset = 0;
  let hillOffset = 0;
  // smoothed vanishing point for the speed streaks — follows only the
  // car's OWN turning (steering input), never the road's curves: while
  // the car runs straight the lines stream straight, they swing only
  // when the car actually turns
  let vanishX = width / 2;
  // engine time of the last gas-can pickup — drives the collect feedback
  // (sparkle burst at the car, gauge flash, rising "+1")
  let lastPickupAt = -10;
  // scarcity ramps with score: every 1000 points hides another 1% of the
  // track's cans (capped at 70% so the track never fully dries out).
  // Cans are hidden in golden-ratio order over their ordinal on the
  // track, so the hidden ones stay evenly spread instead of clumping
  // and the hidden count matches the percentage even with few cans —
  // update() and render() must agree on this
  const canOrdinal = new Map<number, number>();
  let ordinal = 0;
  for (const seg of segments) {
    if (seg.pickup) canOrdinal.set(seg.index, ordinal++);
  }
  const pickupActive = (seg: Segment): boolean => {
    const hidden = Math.min(0.7, Math.floor(state.score / 1000) * 0.01);
    if (hidden <= 0) return true;
    const ord = canOrdinal.get(seg.index);
    if (ord === undefined) return true;
    return (ord * 0.6180339887498949) % 1 >= hidden;
  };
  // steering intent captured in update(), consumed by render() to pick
  // the car frame (left/right lean)
  let pendingSteer = 0;

  // prebuilt backdrop layers — rebuilt by resize() after a rotation
  let sky: HTMLCanvasElement;
  let clouds: HTMLCanvasElement;
  let hillsFar: HTMLCanvasElement;
  let hillsNear: HTMLCanvasElement;
  const buildBackdrop = () => {
    sky = makeSky(width, Math.round(height * 0.62));
    clouds = makeClouds(width, Math.round(height * 0.34), 21);
    hillsFar = makeMountains(
      width,
      Math.round(height * 0.18),
      9,
      "#4a2c50",
      7,
    );
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
    return segments[Math.floor(z / SEGMENT_LENGTH) % segments.length];
  }

  function update(dt: number, input: RacerInput) {
    if (state.gameOver) return;
    pendingSteer = input.left ? -1 : input.right ? 1 : 0;
    const playerSegment = findSegment(state.position + PLAYER_Z);
    const speedPercent = state.speed / MAX_SPEED;
    // steering authority scales with speed — no spinning out at standstill
    const dx = dt * 2.2 * speedPercent;

    state.time += dt;
    state.position += state.speed * dt;
    // display km at the same scale as the 180 km/h top speed
    state.distanceKm += speedPercent * 180 * (dt / 3600);
    while (state.position >= trackLength) state.position -= trackLength;
    while (state.position < 0) state.position += trackLength;

    if (input.left) state.playerX -= dx;
    if (input.right) state.playerX += dx;
    // centrifugal push on curves (Jake Gordon)
    state.playerX -= dx * speedPercent * playerSegment.curve * CENTRIFUGAL;

    if (input.gas && state.fuel > 0) {
      // throttle follows the measured km/h curve of the real car
      const kmh = (state.speed / MAX_SPEED) * 180;
      state.speed += (ACCEL_KMH(kmh) / 180) * MAX_SPEED * dt;
    } else if (input.brake) state.speed += BRAKING * dt;
    else state.speed += DECEL * dt;

    state.offRoad = state.playerX < -1.1 || state.playerX > 1.1;
    if (state.offRoad && state.speed > OFFROAD_LIMIT) {
      state.speed += OFFROAD_DECEL * dt;
    }

    state.playerX = Math.max(-2.2, Math.min(2.2, state.playerX));
    state.speed = Math.max(0, Math.min(MAX_SPEED, state.speed));

    // the tank drains quadratically with speed — cruising fast burns
    // noticeably more fuel; at zero the engine dies and the car coasts
    state.fuel = Math.max(
      0,
      state.fuel -
        dt * (FUEL_DRAIN_IDLE + FUEL_DRAIN_SPEED * speedPercent * speedPercent),
    );
    if (state.fuel <= 0 && state.speed <= 0) state.gameOver = true;

    if (state.respawn > 0) {
      state.respawn = Math.max(0, state.respawn - dt);
    } else {
      // gas cans: drive through one to light another gauge dot
      const pk = playerSegment.pickup;
      if (
        pk &&
        pickupActive(playerSegment) &&
        pk.respawnAt <= state.time &&
        Math.abs(state.playerX - pk.x) < 0.24 &&
        state.speed > MAX_SPEED * 0.02
      ) {
        state.fuel = Math.min(FUEL_MAX, state.fuel + 1);
        pk.respawnAt = state.time + PICKUP_RESPAWN;
        lastPickupAt = state.time;
      }
      // stranded way off the road, past the roadside trees: respawn on
      // the centre line at a standstill with a breathing fade-in
      if (Math.abs(state.playerX) >= FAR_OFFROAD) {
        state.respawn = RESPAWN_TIME;
        state.speed = 0;
        state.playerX = 0;
      }
    }

    // score: metres driven, multiplied when cruising fast AND clean —
    // off-road or respawning drops the multiplier back to x1
    const kmh = (state.speed / MAX_SPEED) * 180;
    state.multiplier =
      state.offRoad || state.respawn > 0
        ? 1
        : kmh > 150
          ? 3
          : kmh > 110
            ? 2
            : 1;
    state.score += ((kmh * dt) / 3.6) * state.multiplier;

    // horizon drifts opposite the current curve, faster with speed
    // (rates eased 30% down from Jake's 2.5/5 — gentler mountain parallax)
    skyOffset += playerSegment.curve * speedPercent * dt * 1.75;
    hillOffset += playerSegment.curve * speedPercent * dt * 3.5;
  }

  function render(ctx: CanvasRenderingContext2D) {
    const baseSegment = findSegment(state.position);
    const basePercent = (state.position % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerSegment = findSegment(state.position + PLAYER_Z);
    const playerPercent =
      ((state.position + PLAYER_Z) % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerY = interpolate(
      playerSegment.p1.world.y,
      playerSegment.p2.world.y,
      playerPercent,
    );

    // ── background ──
    // each layer rides the hills vertically at its own parallax speed
    // (Jake Gordon v3/final: resolution * layerSpeed * playerY, with
    // resolution = height/480 — sky slowest, near hills fastest)
    const resolution = height / 480;
    const skyShiftY = resolution * 0.001 * playerY;
    const cloudShiftY = resolution * 0.0015 * playerY;
    const farShiftY = resolution * 0.002 * playerY;
    const nearShiftY = resolution * 0.003 * playerY;
    // downhill peeks a strip of void above the sky image — fill it with
    // the sky's own top colour
    if (skyShiftY > 0) {
      ctx.fillStyle = "#1a1c3f";
      ctx.fillRect(0, 0, width, Math.ceil(skyShiftY));
    }
    ctx.drawImage(sky, 0, -skyShiftY);

    const drawBand = (
      img: HTMLCanvasElement,
      offset: number,
      yBase: number,
    ) => {
      const x = -(((offset % width) + width) % width);
      ctx.drawImage(img, x, yBase);
      ctx.drawImage(img, x + width, yBase);
    };
    const horizonY = Math.round(height / 2 - farShiftY);
    // clouds: the farthest layer — slowest curve parallax of all, plus a
    // gentle autonomous drift so the sunset sky is never static
    const cloudDrift = skyOffset * width * 0.05 + state.time * width * 0.006;
    const cloudX = -(((cloudDrift % width) + width) % width);
    const cloudY = Math.round(height * 0.05 - cloudShiftY);
    ctx.drawImage(clouds, cloudX, cloudY);
    ctx.drawImage(clouds, cloudX + width, cloudY);
    drawBand(hillsFar, skyOffset * width * 0.12, horizonY - hillsFar.height);
    drawBand(
      hillsNear,
      hillOffset * width * 0.08,
      Math.round(height / 2 - nearShiftY) - hillsNear.height,
    );

    // ── road ──
    let maxY = height;
    // grass colour of the farthest line drawn — the crest gap-fill must
    // continue exactly the shade the ground ended with
    let farGrass = COLORS.dark.grass;
    let x = 0;
    let dx = -(baseSegment.curve * basePercent);
    const cameraZBase = state.position;
    // near-edge road geometry, captured for the road-parallel wind streaks
    let roadNearX = width / 2;
    let roadNearW = width * 0.45;

    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const segment = segments[(baseSegment.index + n) % segments.length];
      segment.looped = segment.index < baseSegment.index;
      segment.clip = maxY;

      const camZ = cameraZBase - (segment.looped ? trackLength : 0);
      const camX = state.playerX * ROAD_WIDTH - x;
      const camY = playerY + CAMERA_HEIGHT;
      project(segment.p1, camX, camY, camZ, width, height);
      project(segment.p2, camX + dx, camY, camZ, width, height);

      x += dx;
      dx += segment.curve;

      // behind the camera, climbing past the previous line, or hidden by a hill
      if (
        segment.p1.camera.z <= CAMERA_DEPTH ||
        segment.p2.screen.y >= segment.p1.screen.y ||
        segment.p2.screen.y >= maxY
      ) {
        continue;
      }

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

      if (n === 0) {
        roadNearX = segment.p2.screen.x;
        roadNearW = segment.p2.screen.w;
      }
    }

    // crest gap-fill: when the road drops away behind a hill its farthest
    // line (maxY) can hang well below the mountain bases, leaving a raw
    // sky strip between the hills and the ground — bridge it with grass.
    // Sky only shows below BOTH band bases, so start at the lower one.
    const groundTop = Math.round(height / 2 - Math.min(farShiftY, nearShiftY));
    if (maxY > groundTop) {
      ctx.fillStyle = farGrass;
      ctx.fillRect(0, groundTop, width, maxY - groundTop);
    }

    // ── roadside sprites, far to near (painter's algorithm; Lou: keep
    //    them sorted by z and scale by the line's projection factor) ──
    for (let n = DRAW_DISTANCE - 1; n > 0; n--) {
      const segment = segments[(baseSegment.index + n) % segments.length];
      const pk = segment.pickup;
      if (!pk && segment.sprites.length === 0) continue;

      // gas cans hover above the tarmac of their segment, bobbing gently
      // so they catch the eye; taken cans stay gone until they re-arm
      if (pk && pickupActive(segment) && pk.respawnAt <= state.time) {
        const scale = segment.p1.screen.scale;
        // much bigger than the roadside-sprite factor (4.2): pickups must
        // read from far away and feel worth steering for
        const destW = gasCan.w * scale * (width / 2) * 8;
        const destH = gasCan.h * scale * (width / 2) * 8;
        if (destW >= 2) {
          // floats above the road: fixed hover height + slow bob
          const bob =
            Math.sin(state.time * 4 + segment.index * 0.7) * destH * 0.08;
          const hover = destH * 0.3;
          const destX =
            segment.p1.screen.x +
            scale * pk.x * ROAD_WIDTH * (width / 2) -
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
            // pixels, so this is what reads as "pickup here!" from afar
            const pulse = 0.5 + 0.5 * Math.sin(state.time * 5 + segment.index);
            ctx.strokeStyle = `rgba(255,215,94,${0.35 + 0.35 * pulse})`;
            ctx.lineWidth = Math.max(1, destW * 0.07);
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
            ctx.drawImage(
              gasCan.image,
              0,
              0,
              gasCan.w,
              (visibleH / destH) * gasCan.h,
              Math.round(destX),
              Math.round(destY),
              Math.round(destW),
              Math.round((visibleH / destH) * destH),
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

    // ── player car ──
    const steer = state.speed > MAX_SPEED * 0.02;
    let frame = car.straight;
    // slope frames on hills (dy under the car), steer frames when turning;
    // the threshold only engages on pronounced slopes now that hills are
    // full Jake Gordon height (a LOW rolling hill peaks ~80 world/segment)
    const dy = playerSegment.p2.world.y - playerSegment.p1.world.y;
    if (dy > SEGMENT_LENGTH * 0.35) frame = car.up;
    else if (dy < -SEGMENT_LENGTH * 0.35) frame = car.down;
    if (steer) {
      // actual steering intent wins over slope
      if (pendingSteer < -0.1) frame = car.left;
      else if (pendingSteer > 0.1) frame = car.right;
    }

    const scale = CAMERA_DEPTH / PLAYER_Z;
    // the car "pulls away" as speed builds: near scale at standstill,
    // far scale at top speed — a smooth zoom-out instead of switching
    // between discrete sprite sizes (the sheet's smaller sizes stay unused)
    const speedPercent = state.speed / MAX_SPEED;
    const CAR_SCALE_NEAR = 1.45; // ~29% of buffer width at standstill
    const CAR_SCALE_FAR = 1.1; // ~22% at top speed
    const carScale = interpolate(CAR_SCALE_NEAR, CAR_SCALE_FAR, speedPercent);
    const destW = frame.w * scale * (width / 2) * carScale;
    const destH = frame.h * scale * (width / 2) * carScale;
    // speed-dependent bounce, stronger off-road; killed for reduced motion
    const bounce = reduceMotion
      ? 0
      : Math.sin(state.time * 18) *
        (state.offRoad ? 2.2 : 0.8) *
        (state.speed / MAX_SPEED);
    const shakeX =
      !reduceMotion && state.offRoad && state.speed > MAX_SPEED * 0.1
        ? Math.sin(state.time * 47) * 1.5
        : 0;
    const carX = width / 2 - destW / 2 + shakeX;
    const carY = height - destH - Math.round(height * 0.04) + bounce;

    // respawn: the car breathes in and out of existence for a moment
    const carAlpha =
      state.respawn > 0 ? 0.5 + 0.5 * Math.sin(state.time * 9) : 1;

    // soft shadow
    ctx.globalAlpha = carAlpha * 0.9;
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
    const curveSlide = Math.abs(playerSegment.curve) * speedPercent ** 2;
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

    // speed streaks hug the road edges, then the LCD cluster on top
    if (!reduceMotion) {
      // swing only with the car's own turning — straight car, straight
      // streaks, no matter how the road bends ahead
      vanishX += (width / 2 + pendingSteer * width * 0.06 - vanishX) * 0.12;
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
    }
    // pickup feedback window — sparkle burst + gauge flash + rising "+1"
    const fxAge = state.time - lastPickupAt;
    const gaugePos = renderCluster(
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
        const burstY = carY + destH * 0.3;
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
      // "+1" floats up off the fuel gauge — dark outline so it reads
      // against both the light LCD panel and the dark road behind it
      const p = fxAge / 0.8;
      const tx = Math.round(gaugePos.x);
      const ty = Math.round(gaugePos.y - 4 * ui - p * 14 * ui);
      ctx.globalAlpha = 1 - p;
      ctx.font = `bold ${Math.round(9 * ui)}px monospace`;
      ctx.fillStyle = "#141611";
      ctx.fillText("+1", tx + 1, ty + 1);
      ctx.fillStyle = "#d7ff9e";
      ctx.fillText("+1", tx, ty);
      ctx.globalAlpha = 1;
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
  }

  return { update, render, resize, state, trackLength };
}

export const ENGINE_CONSTANTS = {
  SEGMENT_LENGTH,
  RUMBLE_LENGTH,
  ROAD_WIDTH,
  CAMERA_HEIGHT,
  MAX_SPEED,
};
