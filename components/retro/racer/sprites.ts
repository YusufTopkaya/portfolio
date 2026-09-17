/**
 * Sprite loading for the Twingo racer.
 *
 * The Twingo MK1 sheet (public/images/twingo-sheet-white.png, the civilian
 * rear-view sheet) has a WHITE background, so it is keyed to transparency
 * at load time by flood-filling the near-white pixels INWARD FROM THE
 * SHEET EDGES. White keying is what keeps the car whole: the black body
 * outlines, door seams and window trim are all darker than the key
 * threshold and survive, so no panel gaps show the road through. Any
 * remaining interior speckle is inpainted with averaged neighbour colours
 * (fillInteriorHoles). Frames are cropped by a rect table measured with a
 * connected-component scan of the sheet. Layout: row 0 = straight rear
 * view in 4 sizes, row 1 = slight-left 3/4 view, row 2 = slight-right
 * 3/4 view. No slope frames exist on the sheet, so up/down reuse the
 * straight rear view. Smoke puffs stay procedural (not on the sheet).
 *
 * If the sheet is missing, a procedurally drawn placeholder Twingo
 * (orange hatchback with the 26 TL 427 plate) keeps the game playable.
 *
 * Also generates the roadside objects (pine, sign, pole) as pixel art on
 * offscreen canvases — no external assets needed. The gas can pickup uses
 * the player's own art (/images/gas-can.png) when present, else a
 * procedural pixel-art jerry can.
 */

import type {
  CarFrame,
  CarFrames,
  CockpitSprites,
  RoadsideSprite,
} from "./engine";

export type { CockpitSprites };

const SHEET_URL = "/images/twingo-sheet-white.png";

/* frame rects in sheet pixels, measured via a connected-component scan
   (largest component of each row; the sheet's text labels stay outside) */
const FRAMES = {
  straight: { x: 115, y: 98, w: 352, h: 270 },
  left: { x: 60, y: 458, w: 453, h: 268 },
  right: { x: 89, y: 790, w: 401, h: 247 },
  up: { x: 115, y: 98, w: 352, h: 270 },
  down: { x: 115, y: 98, w: 352, h: 270 },
};

/* brake-lamp anchor rects as frame fractions [x, y, w, h], measured on
   the sheet art: the straight frame is a pure rear view (two round
   taillights + the roofline strip over the rear window); the left/right
   frames are rear-3/4 angles where the lamps sit at the angled rear
   corners — one near-edge lamp, one smaller far-corner lamp, and the
   strip above the angled window */
const LAMPS: Record<
  "straight" | "left" | "right",
  [number, number, number, number][]
> = {
  straight: [
    [0.07, 0.38, 0.09, 0.17], // left taillight
    [0.84, 0.38, 0.09, 0.17], // right taillight
    [0.385, 0.008, 0.3, 0.03], // roofline strip
  ],
  left: [
    [0.45, 0.39, 0.11, 0.19], // far-corner taillight
    [0.94, 0.405, 0.055, 0.16], // near-edge taillight
    [0.65, 0.008, 0.125, 0.03], // roofline strip
  ],
  right: [
    [0.045, 0.365, 0.055, 0.15], // near-edge taillight
    [0.476, 0.364, 0.113, 0.2], // far-corner taillight
    [0.327, 0.008, 0.15, 0.032], // roofline strip
  ],
};

const withLamps = (
  f: CarFrame,
  lamps: [number, number, number, number][],
): CarFrame => ({
  ...f,
  lamps: lamps.map((l) => [...l] as [number, number, number, number]),
});

function keyWhiteToAlpha(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const w = c.width;
  const h = c.height;
  const isWhite = (p: number) =>
    px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2] >= 700;
  // flood fill from the borders: only exterior-connected white is keyed out
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (p: number) => {
    if (!seen[p] && isWhite(p)) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length > 0) {
    const p = stack.pop() as number;
    px[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }
  fillInteriorHoles(px, w, h);
  ctx.putImageData(data, 0, 0);
  return c;
}

/**
 * After keying, some transparent pixels remain INSIDE the car silhouette:
 * thin gaps between the lightbar and the roof, wheel-arch slivers, panel
 * seams. The road/grass shows through them and reads as a glitch. Fill any
 * transparent pixel that is hemmed in by opaque pixels on 3+ of its 8
 * sides with the average colour of those neighbours (frontier-based
 * dilation, so genuine open background is never touched).
 */
function fillInteriorHoles(px: Uint8ClampedArray, w: number, h: number) {
  const isOpaque = (p: number) => px[p * 4 + 3] !== 0;
  // frontier queue: transparent pixels adjacent to opaque ones
  let frontier: number[] = [];
  for (let p = 0; p < w * h; p++) {
    if (isOpaque(p)) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (
      (x > 0 && isOpaque(p - 1)) ||
      (x < w - 1 && isOpaque(p + 1)) ||
      (y > 0 && isOpaque(p - w)) ||
      (y < h - 1 && isOpaque(p + w))
    ) {
      frontier.push(p);
    }
  }
  while (frontier.length > 0) {
    const fill: number[] = [];
    for (const p of frontier) {
      if (isOpaque(p)) continue;
      const x = p % w;
      const y = (p - x) / w;
      // 8-neighbour opacity map; a pixel is only a hole when it is hemmed
      // in from OPPOSITE sides (a plain "3 neighbours" rule would grow the
      // car outward along its own flat edges, ring by ring)
      let n = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let L = false;
      let R = false;
      let U = false;
      let D = false;
      let TL = false;
      let BR = false;
      let TR = false;
      let BL = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const q = ny * w + nx;
          if (!isOpaque(q)) continue;
          n++;
          r += px[q * 4];
          g += px[q * 4 + 1];
          b += px[q * 4 + 2];
          if (dx === -1 && dy === 0) L = true;
          else if (dx === 1 && dy === 0) R = true;
          else if (dx === 0 && dy === -1) U = true;
          else if (dx === 0 && dy === 1) D = true;
          else if (dx === -1 && dy === -1) TL = true;
          else if (dx === 1 && dy === 1) BR = true;
          else if (dx === 1 && dy === -1) TR = true;
          else BL = true;
        }
      }
      const hemmed = (L && R) || (U && D) || (TL && BR) || (TR && BL);
      if (n >= 3 && hemmed) {
        px[p * 4] = Math.round(r / n);
        px[p * 4 + 1] = Math.round(g / n);
        px[p * 4 + 2] = Math.round(b / n);
        px[p * 4 + 3] = 255;
        fill.push(p);
      }
    }
    if (fill.length === 0) break;
    // next frontier: transparent neighbours of the pixels just filled
    const next: number[] = [];
    for (const p of fill) {
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const q = ny * w + nx;
          if (!isOpaque(q)) next.push(q);
        }
      }
    }
    frontier = next;
  }
}

function crop(
  sheet: HTMLCanvasElement,
  r: { x: number; y: number; w: number; h: number },
): CarFrame {
  const c = document.createElement("canvas");
  c.width = r.w;
  c.height = r.h;
  c.getContext("2d")?.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return { image: c, w: r.w, h: r.h };
}

/* the sheet's two lean views are drawn at slightly different scales, so
   the car visibly shrank on one steering direction. Measure each keyed
   crop's opaque silhouette height and scale the smaller frame up until
   both steer views match. */
function opaqueHeight(frame: CarFrame): number {
  const probe = document.createElement("canvas");
  probe.width = frame.w;
  probe.height = frame.h;
  const ctx = probe.getContext("2d");
  if (!ctx) return frame.h;
  ctx.drawImage(frame.image, 0, 0);
  const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < probe.height; y++) {
    for (let x = 0; x < probe.width; x++) {
      if (data[(y * probe.width + x) * 4 + 3] !== 0) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
  }
  return top < 0 ? frame.h : bottom - top + 1;
}

function scaleFrame(frame: CarFrame, f: number): CarFrame {
  const c = document.createElement("canvas");
  c.width = Math.round(frame.w * f);
  c.height = Math.round(frame.h * f);
  const ctx = c.getContext("2d");
  if (!ctx) return frame;
  ctx.imageSmoothingEnabled = false; // keep the pixel edges hard
  ctx.drawImage(frame.image, 0, 0, c.width, c.height);
  return { image: c, w: c.width, h: c.height };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

/* ── placeholder Twingo, drawn at 96x72 art px ── */

function drawPlaceholderCar(
  variant: "straight" | "left" | "right" | "up" | "down",
): HTMLCanvasElement {
  const w = 96;
  const h = 72;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;

  const lean = variant === "left" ? -6 : variant === "right" ? 6 : 0;
  const pitch = variant === "up" ? -3 : variant === "down" ? 3 : 0;
  ctx.translate(w / 2, h / 2 + pitch);
  ctx.rotate((lean * Math.PI) / 180 / 2);
  ctx.translate(-w / 2, -h / 2);

  // body
  ctx.fillStyle = "#e87722";
  ctx.fillRect(14, 24, 68, 30);
  ctx.fillRect(20, 12, 56, 16); // cabin
  // roof lightbar (safety car)
  ctx.fillStyle = "#f7b32b";
  ctx.fillRect(34, 8, 28, 4);
  // windows
  ctx.fillStyle = "#20242e";
  ctx.fillRect(24, 15, 48, 11);
  // rear windshield wiper hint
  ctx.fillStyle = "#111";
  ctx.fillRect(46, 20, 10, 2);
  // bumper
  ctx.fillStyle = "#2a2a2e";
  ctx.fillRect(12, 50, 72, 8);
  // plate 26 TL 427
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(34, 42, 28, 8);
  ctx.fillStyle = "#14408a";
  ctx.fillRect(34, 42, 4, 8);
  ctx.fillStyle = "#111";
  ctx.font = "7px monospace";
  ctx.fillText("26TL427", 39, 49);
  // wheels
  ctx.fillStyle = "#151517";
  ctx.fillRect(16, 54, 14, 12);
  ctx.fillRect(66, 54, 14, 12);
  ctx.fillStyle = "#8a8a8e";
  ctx.fillRect(20, 57, 6, 6);
  ctx.fillRect(70, 57, 6, 6);
  // tail lights
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(14, 34, 8, 8);
  ctx.fillRect(74, 34, 8, 8);
  return c;
}

function drawSmoke(seedOffset: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 24;
  c.height = 24;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const s = 4 + seedOffset * 2;
  ctx.fillStyle = "rgba(190,190,195,0.9)";
  ctx.fillRect(4 + seedOffset, 8, s, s);
  ctx.fillRect(10 - seedOffset, 4 + seedOffset, s + 2, s + 2);
  ctx.fillStyle = "rgba(150,150,158,0.9)";
  ctx.fillRect(12, 12 - seedOffset, s, s);
  return c;
}

export async function loadCarFrames(): Promise<CarFrames> {
  try {
    const img = await loadImage(SHEET_URL);
    const sheet = keyWhiteToAlpha(img);
    const smoke = [0, 1, 2].map((i) => {
      const image = drawSmoke(i);
      return { image, w: image.width, h: image.height };
    });
    const left = crop(sheet, FRAMES.left);
    const right = crop(sheet, FRAMES.right);
    // same car, same on-screen size whichever way it leans
    const lh = opaqueHeight(left);
    const rh = opaqueHeight(right);
    const matched =
      rh < lh
        ? { left, right: scaleFrame(right, lh / rh) }
        : { left: scaleFrame(left, rh / lh), right };
    return {
      straight: withLamps(crop(sheet, FRAMES.straight), LAMPS.straight),
      left: withLamps(matched.left, LAMPS.left),
      right: withLamps(matched.right, LAMPS.right),
      up: withLamps(crop(sheet, FRAMES.up), LAMPS.straight),
      down: withLamps(crop(sheet, FRAMES.down), LAMPS.straight),
      smoke,
    };
  } catch {
    // sheet missing — fall through to the placeholder
  }
  const f = (v: "straight" | "left" | "right" | "up" | "down"): CarFrame => {
    const image = drawPlaceholderCar(v);
    return {
      image,
      w: image.width,
      h: image.height,
      lamps: LAMPS.straight.map(
        (l) => [...l] as [number, number, number, number],
      ),
    };
  };
  return {
    straight: f("straight"),
    left: f("left"),
    right: f("right"),
    up: f("up"),
    down: f("down"),
    smoke: [0, 1, 2].map((i) => {
      const image = drawSmoke(i);
      return { image, w: image.width, h: image.height };
    }),
  };
}

/* ── roadside objects: pine, bush, rock, pole, chevrons (pixel art, drawn once) ── */

function canvas24(
  w: number,
  h: number,
): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function makePine(): HTMLCanvasElement {
  const [c, ctx] = canvas24(48, 72);
  if (!ctx) return c;
  ctx.fillStyle = "#5a3a22";
  ctx.fillRect(20, 52, 8, 20);
  const layers: [number, number, number][] = [
    [6, 44, 36],
    [12, 30, 30],
    [18, 16, 24],
  ];
  for (const [top, halfH, halfW] of layers) {
    ctx.fillStyle = top === 6 ? "#1e5c2a" : "#267034";
    ctx.beginPath();
    ctx.moveTo(24, top);
    ctx.lineTo(24 - halfW, top + halfH);
    ctx.lineTo(24 + halfW, top + halfH);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

function makeBush(): HTMLCanvasElement {
  const [c, ctx] = canvas24(48, 36);
  if (!ctx) return c;
  // low blobby shrub — quiet filler that never reads as "information";
  // huddles in clusters at pine bases
  const blob = (x: number, y: number, r: number, col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(13, 24, 10, "#1e5c2a");
  blob(30, 21, 13, "#267034");
  blob(22, 16, 10, "#2e7a37");
  blob(41, 26, 7, "#1e5c2a");
  blob(33, 14, 6, "#2e7a37");
  ctx.fillStyle = "#143f1e";
  ctx.fillRect(4, 30, 41, 4);
  return c;
}

function makeRock(): HTMLCanvasElement {
  const [c, ctx] = canvas24(36, 24);
  if (!ctx) return c;
  // chunky boulder: mid body, lit top-left face, shaded right face
  ctx.fillStyle = "#4e4e56";
  ctx.beginPath();
  ctx.moveTo(2, 22);
  ctx.lineTo(6, 8);
  ctx.lineTo(16, 2);
  ctx.lineTo(28, 5);
  ctx.lineTo(34, 16);
  ctx.lineTo(32, 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#77777f";
  ctx.beginPath();
  ctx.moveTo(6, 20);
  ctx.lineTo(9, 9);
  ctx.lineTo(17, 4);
  ctx.lineTo(22, 6);
  ctx.lineTo(14, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#3a3a41";
  ctx.beginPath();
  ctx.moveTo(22, 6);
  ctx.lineTo(28, 7);
  ctx.lineTo(32, 16);
  ctx.lineTo(30, 20);
  ctx.lineTo(14, 20);
  ctx.closePath();
  ctx.fill();
  return c;
}

function makePole(dir: 1 | -1): HTMLCanvasElement {
  const [c, ctx] = canvas24(28, 72);
  if (!ctx) return c;
  // cobra-head street light: vertical mast + arm reaching OVER the road
  // (an inverted L), dark head by day — the warm glow and the pool on
  // the tarmac are painted at render time, only after dark. dir = +1
  // arm reaches right (pole planted on the LEFT verge), -1 the mirror
  const mastX = dir > 0 ? 4 : 20;
  const headX = dir > 0 ? 18 : 2;
  ctx.fillStyle = "#4a4a52";
  ctx.fillRect(mastX, 6, 4, 66);
  ctx.fillRect(Math.min(mastX, headX), 6, Math.abs(headX - mastX) + 8, 3);
  // head housing + the unlit lens underneath
  ctx.fillStyle = "#2c2c31";
  ctx.fillRect(headX, 9, 8, 4);
  ctx.fillStyle = "#4c4c54";
  ctx.fillRect(headX + 1, 12, 6, 2);
  return c;
}

function makeChevron(dir: 1 | -1): HTMLCanvasElement {
  const [c, ctx] = canvas24(48, 44);
  if (!ctx) return c;
  // European curve-warning sign (the white/red J32 style): dark edge,
  // white face, two fat RED chevrons pointing the way the road bends
  ctx.fillStyle = "#5a5a62";
  ctx.fillRect(22, 26, 4, 18);
  ctx.fillStyle = "#141611";
  ctx.fillRect(0, 0, 48, 26);
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(2, 2, 44, 22);
  ctx.fillStyle = "#d43a2f";
  for (let k = 0; k < 2; k++) {
    const cx = dir > 0 ? 9 + k * 16 : 39 - k * 16;
    ctx.beginPath();
    ctx.moveTo(cx, 5);
    ctx.lineTo(cx + 9 * dir, 13);
    ctx.lineTo(cx, 21);
    ctx.lineTo(cx + 5 * dir, 13);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

export function makeRoadside(): RoadsideSprite[] {
  return [
    // pines tower over the car — a roadside tree reads as a TREE, not a bonsai
    { image: makePine(), w: 48, h: 72, offset: 0, scale: 6.2 },
    { image: makeBush(), w: 48, h: 36, offset: 0, scale: 2.2 },
    { image: makeRock(), w: 36, h: 24, offset: 0, scale: 1.5 },
    // cobra-head lamps come in arm-right (3, left verge) and arm-left
    // (6, right verge) so the arm always reaches over the tarmac. Scale
    // is proportioned off the pine (6.2 ≈ a 12-15 m tree): a real cobra
    // mast is 8-10 m, so ~0.78× the tree — anything smaller reads as a
    // toy next to it
    { image: makePole(1), w: 28, h: 72, offset: 0, scale: 4.8 },
    // curve-warning chevrons (4 = points right, 5 = left): never spawned
    // by the random roadside mix — the generator plants them only around
    // medium/hard bends, on the outside edge
    { image: makeChevron(1), w: 48, h: 44, offset: 0, scale: 2.6 },
    { image: makeChevron(-1), w: 48, h: 44, offset: 0, scale: 2.6 },
    { image: makePole(-1), w: 28, h: 72, offset: 0, scale: 4.8 },
  ];
}

/* ── gas can pickup: the player's asset at /images/gas-can.png, with a
   procedurally drawn pixel-art jerry can (24x28 art px) as fallback ── */

const GAS_CAN_URL = "/images/gas-can.png";

function makeGasCan(): HTMLCanvasElement {
  const [c, ctx] = canvas24(24, 28);
  if (!ctx) return c;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  // handle + cap
  px(8, 1, 8, 3, "#3a0d0d");
  px(9, 2, 6, 1, "#e2543a");
  px(16, 0, 3, 4, "#3a0d0d");
  px(16, 1, 3, 2, "#e2543a");
  // body: dark outline, red fill, edge shading
  px(5, 4, 14, 23, "#3a0d0d");
  px(6, 5, 12, 21, "#c22e1f");
  px(6, 5, 12, 3, "#e2543a");
  px(16, 5, 2, 21, "#8f1d12");
  px(6, 24, 12, 2, "#8f1d12");
  // label panel + cyan corner brackets (the pickup's neon frame)
  px(6, 9, 12, 8, "#7a150c");
  const bracket = (bx: number, by: number, dx: number, dy: number) => {
    px(bx, by, 2, 1, "#59f7e8");
    px(bx + (dx > 0 ? 0 : 1), by + (dy > 0 ? 0 : -1), 1, 2, "#59f7e8");
  };
  bracket(5, 8, 1, 1);
  bracket(17, 8, -1, 1);
  bracket(5, 17, 1, -1);
  bracket(17, 17, -1, -1);
  // pixel GAS letters (3x5 glyphs), yellow
  const GLYPHS: Record<string, number[]> = {
    G: [0b111, 0b100, 0b101, 0b101, 0b111],
    A: [0b010, 0b101, 0b111, 0b101, 0b101],
    S: [0b011, 0b100, 0b010, 0b001, 0b110],
  };
  let lx = 7;
  for (const ch of "GAS") {
    const rows = GLYPHS[ch];
    for (let ry = 0; ry < 5; ry++) {
      for (let rx = 0; rx < 3; rx++) {
        if (rows[ry] & (1 << (2 - rx))) px(lx + rx, 11 + ry, 1, 1, "#ffd75e");
      }
    }
    lx += 4;
  }
  return c;
}

export async function loadGasCan(): Promise<CarFrame> {
  try {
    const img = await loadImage(GAS_CAN_URL);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")?.drawImage(img, 0, 0);
    return { image: c, w: c.width, h: c.height };
  } catch {
    // asset missing — fall through to the procedural pixel-art can
  }
  const image = makeGasCan();
  return { image, w: image.width, h: image.height };
}

/** gold-tinted copy of the gas can sprite, for the rare golden pickups —
    a translucent source-atop wash keeps the shading underneath */
export function tintGold(base: CarFrame): CarFrame {
  const c = document.createElement("canvas");
  c.width = base.w;
  c.height = base.h;
  const g = c.getContext("2d");
  if (!g) return base;
  g.drawImage(base.image, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(255,180,30,0.55)";
  g.fillRect(0, 0, c.width, c.height);
  return { image: c, w: base.w, h: base.h };
}

/* ── cockpit (first-person) view ───────────────────────────────────────
   Two preprocessed PNGs (scripts/build-cockpit.mjs): the dash/pillar
   overlay with the glass keyed to alpha, and a 3-frame wheel sheet
   (left / center / right). No procedural fallback — when the files are
   missing the view toggle stays hidden and the game runs chase-only. */

const COCKPIT_URL = "/images/twingo-cockpit.png";
const COCKPIT_WHEEL_URL = "/images/twingo-cockpit-wheel.png";

export async function loadCockpit(): Promise<CockpitSprites | null> {
  try {
    const [dashImg, wheelImg] = await Promise.all([
      loadImage(COCKPIT_URL),
      loadImage(COCKPIT_WHEEL_URL),
    ]);
    const dash = document.createElement("canvas");
    dash.width = dashImg.naturalWidth;
    dash.height = dashImg.naturalHeight;
    dash.getContext("2d")?.drawImage(dashImg, 0, 0);
    const wheel = document.createElement("canvas");
    wheel.width = wheelImg.naturalWidth;
    wheel.height = wheelImg.naturalHeight;
    wheel.getContext("2d")?.drawImage(wheelImg, 0, 0);
    return {
      dash: { image: dash, w: dash.width, h: dash.height },
      wheel,
      wheelFrame: wheel.height,
    };
  } catch {
    return null;
  }
}
