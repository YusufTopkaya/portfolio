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
  /** road hazard: pothole or oil slick, x in road half-width units (±1 = edge) */
  hazard?: { kind: "pothole" | "oil"; x: number };
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
// semi-realistic pull: dv/dt = rate * (1 - v/vmax), i.e. strong off the
// line, tapering out near top speed. rate 0.135 → 0-100 km/h in ~6 s
// against the 180 km/h top speed (v(t) = vmax * (1 - e^(-0.135t)))
const ACCEL_RATE = 0.135;
const BRAKING = -MAX_SPEED;
const DECEL = -MAX_SPEED / 5;
const OFFROAD_DECEL = -MAX_SPEED * 0.75;
const OFFROAD_LIMIT = MAX_SPEED / 4;
const CENTRIFUGAL = 0.3;
const RESPAWN_TIME = 2.6; // seconds of "breathing" fade after a crash
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
  /** >0 while the car is respawning (breathing fade) after a hazard hit */
  respawn: number;
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
  const t = Math.max(1, Math.round(size * 0.18));
  const w = size;
  const h = size * 2;
  ctx.fillStyle = color;
  const rect = (rx: number, ry: number, rw: number, rh: number) =>
    ctx.fillRect(
      Math.round(rx),
      Math.round(ry),
      Math.round(rw),
      Math.round(rh),
    );
  if (seg[0]) rect(x, y, w, t); // a
  if (seg[1]) rect(x + w - t, y, t, h / 2); // b
  if (seg[2]) rect(x + w - t, y + h / 2, t, h / 2); // c
  if (seg[3]) rect(x, y + h - t, w, t); // d
  if (seg[4]) rect(x, y + h / 2, t, h / 2); // e
  if (seg[5]) rect(x, y, t, h / 2); // f
  if (seg[6]) rect(x, y + h / 2 - t / 2, w, t); // g
}

/* tiny fuel-pump icon + dot gauge, bottom row of the real MK1 cluster.
   Static by design — the photo shows the first dot lit orange (low fuel) */
function drawFuelGauge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ui: number,
  segColor: string,
) {
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

  // gauge dots: first one lit orange like the photo, the rest empty rings
  const dots = 8;
  const r = Math.max(1, 1.5 * ui);
  const step = 3.6 * ui;
  const dotsX = x + bw + 6 * ui;
  const dotsY = y - r;
  for (let i = 0; i < dots; i++) {
    const cx = dotsX + i * step;
    ctx.beginPath();
    ctx.arc(cx, dotsY, r, 0, Math.PI * 2);
    if (i === 0) {
      ctx.fillStyle = "#e2703a";
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
}

function renderCluster(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  kmh: number,
  score: number,
  topLeft = false,
) {
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

  // static fuel gauge, bottom row (below the km/h legend)
  drawFuelGauge(
    ctx,
    digitsX + 3 * digitW + 2 * ui,
    y0 + ph - pad - 3 * ui,
    ui,
    segColor,
  );
}

/* anime-style speed streaks hugging the road edges: each streak lies on a
   line from the vanishing point through a spot just off the rumble strip,
   so they stream past PARALLEL to the road edges (t² easing compresses
   them near the horizon, like the road itself) */
function renderSpeedLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  speedPercent: number,
  time: number,
  roadNearX: number,
  roadNearW: number,
  horizonY: number,
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
    const vx = width / 2 + side * width * 0.015;
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
  state: EngineState;
  trackLength: number;
}

export function createEngine(opts: {
  segments: Segment[];
  roadside: RoadsideSprite[];
  car: CarFrames;
  reduceMotion?: boolean;
  /** buffer size — portrait viewports get a taller buffer so the game
      fills the phone screen instead of letterboxing into a thin strip */
  width?: number;
  height?: number;
  /** touch devices: LCD cluster goes top-left so the pedals don't cover it */
  clusterTopLeft?: boolean;
}): RacerEngine {
  const { segments, roadside, car, reduceMotion } = opts;
  const width = opts.width ?? RACER_WIDTH;
  const height = opts.height ?? RACER_HEIGHT;
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
    offRoad: false,
  };

  // horizon parallax offsets (Lou: horizon slides opposite the curve)
  let skyOffset = 0;
  let hillOffset = 0;
  // steering intent captured in update(), consumed by render() to pick
  // the car frame (left/right lean)
  let pendingSteer = 0;

  const sky = makeSky(width, Math.round(height * 0.62));
  const hillsFar = makeMountains(
    width,
    Math.round(height * 0.18),
    9,
    "#4a2c50",
    7,
  );
  const hillsNear = makeMountains(
    width,
    Math.round(height * 0.13),
    14,
    "#33203c",
    13,
  );

  function findSegment(z: number): Segment {
    return segments[Math.floor(z / SEGMENT_LENGTH) % segments.length];
  }

  function update(dt: number, input: RacerInput) {
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

    if (input.gas) {
      state.speed +=
        MAX_SPEED * ACCEL_RATE * (1 - state.speed / MAX_SPEED) * dt;
    } else if (input.brake) state.speed += BRAKING * dt;
    else state.speed += DECEL * dt;

    state.offRoad = state.playerX < -1.1 || state.playerX > 1.1;
    if (state.offRoad && state.speed > OFFROAD_LIMIT) {
      state.speed += OFFROAD_DECEL * dt;
    }

    state.playerX = Math.max(-2.2, Math.min(2.2, state.playerX));
    state.speed = Math.max(0, Math.min(MAX_SPEED, state.speed));

    // hazards: potholes and oil slicks swallow the car — it respawns on
    // the centre line at a standstill with a breathing fade-in
    if (state.respawn > 0) {
      state.respawn = Math.max(0, state.respawn - dt);
    } else {
      const hz = playerSegment.hazard;
      if (
        hz &&
        Math.abs(state.playerX - hz.x) < 0.24 &&
        state.speed > MAX_SPEED * 0.05
      ) {
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
    skyOffset += playerSegment.curve * speedPercent * dt * 2.5;
    hillOffset += playerSegment.curve * speedPercent * dt * 5;
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
    // horizon bobs with the hill under the camera (Lou's hill trick)
    const horizonShift = Math.max(
      -height * 0.12,
      Math.min(height * 0.12, playerY * 0.02),
    );
    ctx.drawImage(sky, 0, -horizonShift * 0.3);

    const drawBand = (
      img: HTMLCanvasElement,
      offset: number,
      yBase: number,
    ) => {
      const x = -(((offset % width) + width) % width);
      ctx.drawImage(img, x, yBase - horizonShift);
      ctx.drawImage(img, x + width, yBase - horizonShift);
    };
    const horizonY = Math.round(height / 2 - horizonShift);
    drawBand(hillsFar, skyOffset * width * 0.12, horizonY - hillsFar.height);
    drawBand(hillsNear, hillOffset * width * 0.08, horizonY - hillsNear.height);

    // ── road ──
    let maxY = height;
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

      if (n === 0) {
        roadNearX = segment.p2.screen.x;
        roadNearW = segment.p2.screen.w;
      }

      // potholes & oil slicks lie flat on the tarmac of their segment.
      // rounded to whole pixels and floored to a readable minimum size —
      // sub-pixel heights are what made them shimmer at speed
      if (segment.hazard) {
        const hs = segment.p1.screen;
        const hx = Math.round(
          hs.x + hs.scale * segment.hazard.x * ROAD_WIDTH * (width / 2),
        );
        const hw = Math.max(
          3,
          Math.round(hs.scale * 0.3 * ROAD_WIDTH * (width / 2)),
        );
        const hh = Math.max(2, Math.round(hw * 0.3));
        const hy = Math.round(hs.y) - hh;
        // pale warning ring so the hazard reads against grey tarmac
        ctx.beginPath();
        ctx.ellipse(hx, hy, hw + 1, hh + 1, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(232,232,232,0.5)";
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(hx, hy, hw, hh, 0, 0, Math.PI * 2);
        if (segment.hazard.kind === "pothole") {
          ctx.fillStyle = "#101014";
          ctx.fill();
          // crumbled lighter rim on the near edge
          ctx.beginPath();
          ctx.ellipse(hx, hy + hh * 0.55, hw * 0.9, hh * 0.35, 0, 0, Math.PI);
          ctx.strokeStyle = "#4a4a52";
          ctx.lineWidth = Math.max(1, hh * 0.4);
          ctx.stroke();
        } else {
          // oil slick: blue-black with a glossy streak
          ctx.fillStyle = "#0c0c14";
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(
            hx - hw * 0.2,
            hy - hh * 0.25,
            hw * 0.45,
            hh * 0.3,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = "rgba(120,120,180,0.7)";
          ctx.fill();
        }
      }
    }

    // ── roadside sprites, far to near (painter's algorithm; Lou: keep
    //    them sorted by z and scale by the line's projection factor) ──
    for (let n = DRAW_DISTANCE - 1; n > 0; n--) {
      const segment = segments[(baseSegment.index + n) % segments.length];
      if (segment.sprites.length === 0) continue;
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
    // slope frames on hills (dy under the car), steer frames when turning
    const dy = playerSegment.p2.world.y - playerSegment.p1.world.y;
    if (dy > SEGMENT_LENGTH * 0.12) frame = car.up;
    else if (dy < -SEGMENT_LENGTH * 0.12) frame = car.down;
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

    // speed streaks hug the road edges, then the LCD cluster on top
    if (!reduceMotion) {
      renderSpeedLines(
        ctx,
        width,
        height,
        speedPercent,
        state.time,
        roadNearX,
        roadNearW,
        horizonY,
      );
    }
    renderCluster(
      ctx,
      width,
      height,
      speedPercent * 180,
      state.score,
      opts.clusterTopLeft,
    );
  }

  return { update, render, state, trackLength };
}

export const ENGINE_CONSTANTS = {
  SEGMENT_LENGTH,
  RUMBLE_LENGTH,
  ROAD_WIDTH,
  CAMERA_HEIGHT,
  MAX_SPEED,
};
