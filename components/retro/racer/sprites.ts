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
 * offscreen canvases — no external assets needed.
 */

import type { CarFrame, CarFrames, RoadsideSprite } from "./engine";

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
      straight: crop(sheet, FRAMES.straight),
      left: matched.left,
      right: matched.right,
      up: crop(sheet, FRAMES.up),
      down: crop(sheet, FRAMES.down),
      smoke,
    };
  } catch {
    // sheet missing — fall through to the placeholder
  }
  const f = (v: "straight" | "left" | "right" | "up" | "down"): CarFrame => {
    const image = drawPlaceholderCar(v);
    return { image, w: image.width, h: image.height };
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

/* ── roadside objects: pine, sign, pole (pixel art, drawn once) ── */

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

function makeSign(): HTMLCanvasElement {
  const [c, ctx] = canvas24(40, 56);
  if (!ctx) return c;
  ctx.fillStyle = "#777";
  ctx.fillRect(18, 30, 4, 26);
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(2, 4, 36, 26);
  ctx.fillStyle = "#e87722";
  ctx.fillRect(2, 4, 36, 4);
  ctx.fillStyle = "#20242e";
  ctx.font = "bold 9px monospace";
  ctx.fillText("26", 7, 18);
  ctx.fillText("427", 5, 27);
  return c;
}

function makePole(): HTMLCanvasElement {
  const [c, ctx] = canvas24(20, 64);
  if (!ctx) return c;
  ctx.fillStyle = "#4a4a52";
  ctx.fillRect(8, 10, 4, 54);
  ctx.fillStyle = "#92cc41";
  ctx.fillRect(2, 2, 16, 10);
  ctx.fillStyle = "#d7ff9e";
  ctx.fillRect(4, 4, 12, 6);
  return c;
}

export function makeRoadside(): RoadsideSprite[] {
  return [
    { image: makePine(), w: 48, h: 72, offset: 0, scale: 3.2 },
    { image: makeSign(), w: 40, h: 56, offset: 0, scale: 1.8 },
    { image: makePole(), w: 20, h: 64, offset: 0, scale: 1.5 },
  ];
}
