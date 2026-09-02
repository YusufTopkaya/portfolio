/**
 * Sprite loading for the Twingo racer.
 *
 * The Twingo MK1 sheet (public/images/twingo-sprite.png) has a black
 * background, so it is keyed to transparency at load time (r+g+b <= 60 →
 * alpha 0), then frames are cropped by a rect table measured with a
 * projection-profile scan of the sheet. Layout: band 0 = straight rear
 * view in 4 sizes, band 1 = slight-left 3/4 view, band 2 = slight-right
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

const SHEET_URL = "/images/twingo-sprite.png";

/* frame rects in sheet pixels, measured via projection profiles */
const FRAMES = {
  straight: { x: 105, y: 0, w: 392, h: 306 },
  left: { x: 43, y: 334, w: 499, h: 285 },
  right: { x: 60, y: 656, w: 468, h: 293 },
  up: { x: 105, y: 0, w: 392, h: 306 },
  down: { x: 105, y: 0, w: 392, h: 306 },
};

function keyBlackToAlpha(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] + px[i + 1] + px[i + 2] <= 60) px[i + 3] = 0;
  }
  ctx.putImageData(data, 0, 0);
  return c;
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
    const sheet = keyBlackToAlpha(img);
    const smoke = [0, 1, 2].map((i) => {
      const image = drawSmoke(i);
      return { image, w: image.width, h: image.height };
    });
    return {
      straight: crop(sheet, FRAMES.straight),
      left: crop(sheet, FRAMES.left),
      right: crop(sheet, FRAMES.right),
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
    { image: makePine(), w: 48, h: 72, offset: 0 },
    { image: makeSign(), w: 40, h: 56, offset: 0 },
    { image: makePole(), w: 20, h: 64, offset: 0 },
  ];
}
