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
const ACCEL = MAX_SPEED / 5;
const BRAKING = -MAX_SPEED;
const DECEL = -MAX_SPEED / 5;
const OFFROAD_DECEL = -MAX_SPEED * 0.75;
const OFFROAD_LIMIT = MAX_SPEED / 4;
const CENTRIFUGAL = 0.3;
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
    while (state.position >= trackLength) state.position -= trackLength;
    while (state.position < 0) state.position += trackLength;

    if (input.left) state.playerX -= dx;
    if (input.right) state.playerX += dx;
    // centrifugal push on curves (Jake Gordon)
    state.playerX -= dx * speedPercent * playerSegment.curve * CENTRIFUGAL;

    if (input.gas) state.speed += ACCEL * dt;
    else if (input.brake) state.speed += BRAKING * dt;
    else state.speed += DECEL * dt;

    state.offRoad = state.playerX < -1.1 || state.playerX > 1.1;
    if (state.offRoad && state.speed > OFFROAD_LIMIT) {
      state.speed += OFFROAD_DECEL * dt;
    }

    state.playerX = Math.max(-2.2, Math.min(2.2, state.playerX));
    state.speed = Math.max(0, Math.min(MAX_SPEED, state.speed));

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
    }

    // ── roadside sprites, far to near (painter's algorithm; Lou: keep
    //    them sorted by z and scale by the line's projection factor) ──
    for (let n = DRAW_DISTANCE - 1; n > 0; n--) {
      const segment = segments[(baseSegment.index + n) % segments.length];
      if (segment.sprites.length === 0) continue;
      for (const s of segment.sprites) {
        const sprite = roadside[s.sprite];
        const scale = segment.p1.screen.scale;
        const destW = sprite.w * scale * (width / 2) * 4.2;
        const destH = sprite.h * scale * (width / 2) * 4.2;
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
    // player car spans ~40% of the buffer width (OutRun proportions)
    const CAR_SCALE = 2.0;
    const destW = frame.w * scale * (width / 2) * CAR_SCALE;
    const destH = frame.h * scale * (width / 2) * CAR_SCALE;
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

    // soft shadow
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

    ctx.drawImage(
      frame.image,
      Math.round(carX),
      Math.round(carY),
      Math.round(destW),
      Math.round(destH),
    );

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
