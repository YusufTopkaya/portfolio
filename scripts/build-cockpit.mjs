// Build cockpit sprites from the generated Twingo interior JPG.
// - crops the baked SCORE/TIME/STAGE hud strip off the top
// - keys the painted checkerboard (fake transparency) to real alpha
//   inside the glass areas (windshield, side windows, mirror glass)
// - emits public/images/twingo-cockpit.png (480x270 RGBA master)
// - cuts the steering wheel (circle mask) and emits 3 rotation frames
//   side by side: public/images/twingo-cockpit-wheel.png
// Run: node scripts/build-cockpit.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "C:/Users/Yusuf/Downloads/Gemini_Generated_Image_8wrnve8wrnve8wrn.jpg";
const OUT_DIR = "public/images";
mkdirSync(OUT_DIR, { recursive: true });

const TOP_CROP = 140; // baked HUD strip + its dither ghost, source px

// glass regions in SOURCE coordinates (after top crop offset removed below)
const GLASS_RECTS = [
  { x: 40, y: 110, w: 2650, h: 605 }, // windshield (+ mirror glass inside)
  { x: 0, y: 230, w: 62, h: 270 }, // left side window
  { x: 2690, y: 230, w: 62, h: 270 }, // right side window
];

// steering wheel circle in source coords (measured on a 200px grid)
const WHEEL = { cx: 634, cy: 1004, r: 408 };
// dash warning-light strip visible THROUGH the wheel's top opening:
// stays painted in the master (it belongs to the dash), transparent in
// the wheel sprite so it doesn't rotate with the rim
const STRIP = { x: 500, y: 805, w: 410, h: 75 };
// dark footwell fill replacing the painted wheel in the master
const WHEEL_FILL = { r: 38, g: 38, b: 54 };
const WHEEL_RECT = {
  x: WHEEL.cx - WHEEL.r - 10,
  y: WHEEL.cy - WHEEL.r - 10,
  size: WHEEL.r * 2 + 20,
};
const WHEEL_ANGLES = [-24, 0, 24]; // left, center, right

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const C = info.channels; // 3

// --- RGBA working buffer with the top HUD strip removed ---
const OH = H - TOP_CROP;
const rgba = Buffer.alloc(W * OH * 4);
for (let y = 0; y < OH; y++) {
  for (let x = 0; x < W; x++) {
    const s = ((y + TOP_CROP) * W + x) * C;
    const d = (y * W + x) * 4;
    rgba[d] = data[s];
    rgba[d + 1] = data[s + 1];
    rgba[d + 2] = data[s + 2];
    rgba[d + 3] = 255;
  }
}

// --- checker keying inside glass rects ---
const isChecker = (r, g, b) => {
  const mn = Math.min(r, g, b);
  const mx = Math.max(r, g, b);
  return mn >= 190 && mx - mn <= 14;
};
for (const rect of GLASS_RECTS) {
  const y0 = Math.max(0, rect.y - TOP_CROP);
  const y1 = Math.min(OH, rect.y - TOP_CROP + rect.h);
  for (let y = y0; y < y1; y++) {
    for (let x = rect.x; x < Math.min(W, rect.x + rect.w); x++) {
      const d = (y * W + x) * 4;
      if (isChecker(rgba[d], rgba[d + 1], rgba[d + 2])) rgba[d + 3] = 0;
    }
  }
}
// one dilation pass: neutral near-transparent edge pixels also go
// (jpg blend halo between checker and dark frames)
const isHalo = (r, g, b) => {
  const mn = Math.min(r, g, b);
  const mx = Math.max(r, g, b);
  return mn >= 165 && mx - mn <= 20;
};
const alpha0 = [];
for (let y = 0; y < OH; y++) {
  for (let x = 0; x < W; x++) {
    const d = (y * W + x) * 4;
    if (rgba[d + 3] !== 0 || !isHalo(rgba[d], rgba[d + 1], rgba[d + 2])) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= OH) continue;
      if (rgba[(ny * W + nx) * 4 + 3] === 0) {
        alpha0.push(d);
        break;
      }
    }
  }
}
for (const d of alpha0) rgba[d + 3] = 0;

// snapshot BEFORE the wheel erase — the wheel sprite is cut from this
const preErase = Buffer.from(rgba);

// --- erase the painted wheel from the master (navy footwell fill) so the
//     rotating wheel sprite can sit on top without a ghost rim; the dash
//     strip inside the opening stays painted ---
for (let y = 0; y < OH; y++) {
  for (let x = 0; x < W; x++) {
    const sy = y + TOP_CROP;
    if ((x - WHEEL.cx) ** 2 + (sy - WHEEL.cy) ** 2 > (WHEEL.r + 3) ** 2) continue;
    if (
      x >= STRIP.x &&
      x < STRIP.x + STRIP.w &&
      sy >= STRIP.y &&
      sy < STRIP.y + STRIP.h
    )
      continue;
    const d = (y * W + x) * 4;
    rgba[d] = WHEEL_FILL.r;
    rgba[d + 1] = WHEEL_FILL.g;
    rgba[d + 2] = WHEEL_FILL.b;
    rgba[d + 3] = 255;
  }
}

// --- master cockpit overlay: 480x270 (slight vertical stretch, invisible
//     at pixel-art scale, keeps the frame exactly 16:9) ---
await sharp(rgba, { raw: { width: W, height: OH, channels: 4 } })
  .resize(480, 270, { kernel: "nearest" })
  .png()
  .toFile(`${OUT_DIR}/twingo-cockpit.png`);
console.log("wrote", `${OUT_DIR}/twingo-cockpit.png`);

// --- wheel frames: circle-masked cutout, 3 rotation frames ---
const wr = WHEEL_RECT;
const wheel = Buffer.alloc(wr.size * wr.size * 4);
for (let y = 0; y < wr.size; y++) {
  for (let x = 0; x < wr.size; x++) {
    const sx = wr.x + x;
    const sy = wr.y + y - TOP_CROP;
    const d = (y * wr.size + x) * 4;
    const inCircle =
      (sx - WHEEL.cx) ** 2 + (sy + TOP_CROP - WHEEL.cy) ** 2 <= WHEEL.r ** 2;
    const inStrip =
      sx >= STRIP.x &&
      sx < STRIP.x + STRIP.w &&
      sy + TOP_CROP >= STRIP.y &&
      sy + TOP_CROP < STRIP.y + STRIP.h;
    if (sx < 0 || sy < 0 || sx >= W || sy >= OH || !inCircle || inStrip) {
      wheel[d + 3] = 0;
      continue;
    }
    const s = (sy * W + sx) * 4;
    wheel[d] = preErase[s];
    wheel[d + 1] = preErase[s + 1];
    wheel[d + 2] = preErase[s + 2];
    wheel[d + 3] = preErase[s + 3];
  }
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const frames = [];
for (const angle of WHEEL_ANGLES) {
  // sharp.rotate by a non-right angle can shrink the opaque bounds; the
  // wheel is a circle so its extent must stay identical across frames —
  // re-center the rotated result onto the original square canvas
  const rotated = await sharp(wheel, {
    raw: { width: wr.size, height: wr.size, channels: 4 },
  })
    .rotate(angle, { background: transparent })
    .png()
    .toBuffer();
  const meta = await sharp(rotated).metadata();
  const rw = meta.width ?? wr.size;
  const rh = meta.height ?? wr.size;
  // rotate() may expand the canvas — re-center to the original square
  const centered =
    rw >= wr.size && rh >= wr.size
      ? await sharp(rotated)
          .extract({
            left: Math.round((rw - wr.size) / 2),
            top: Math.round((rh - wr.size) / 2),
            width: wr.size,
            height: wr.size,
          })
          .png()
          .toBuffer()
      : rotated;
  const cw = rw >= wr.size ? wr.size : rw;
  const ch = rh >= wr.size ? wr.size : rh;
  const buf = await sharp({
    create: {
      width: wr.size,
      height: wr.size,
      channels: 4,
      background: transparent,
    },
  })
    .composite([
      {
        input: centered,
        left: Math.round((wr.size - cw) / 2),
        top: Math.round((wr.size - ch) / 2),
      },
    ])
    .png()
    .toBuffer();
  frames.push(buf);
}
// assemble the sheet side by side at runtime-friendly size:
// frame size = source size scaled by the same factor as the master
const SCALE = 480 / W;
const fw = Math.round(wr.size * SCALE);
const fh = fw;
const sheet = sharp({
  create: {
    width: fw * frames.length,
    height: fh,
    channels: 4,
    background: transparent,
  },
});
const composites = [];
for (let i = 0; i < frames.length; i++) {
  composites.push({
    input: await sharp(frames[i]).resize(fw, fh, { kernel: "nearest" }).png().toBuffer(),
    left: i * fw,
    top: 0,
  });
}
await sheet.composite(composites).png().toFile(`${OUT_DIR}/twingo-cockpit-wheel.png`);
console.log("wrote", `${OUT_DIR}/twingo-cockpit-wheel.png`, `${fw * 3}x${fh}`);
// engine constants: wheel geometry as fractions of the dash rect
console.log(
  "engine constants:",
  JSON.stringify({
    wheelCxF: +(WHEEL.cx / W).toFixed(4),
    wheelCyF: +((WHEEL.cy - TOP_CROP) / OH).toFixed(4),
    wheelFwF: +(wr.size / W).toFixed(4),
    wheelFhF: +(wr.size / OH).toFixed(4),
  }),
);
process.exit(0);
