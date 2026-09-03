// Build cockpit sprites from the generated Twingo interior JPGs.
// - DASH_SRC: wheel-less interior — the dash master, so the area behind
//   the (separately drawn) steering wheel is real paint, not a flat fill
// - WHEEL_SRC: the original interior WITH the wheel — the wheel sprite
//   (3 rotation frames) is still cut from this one
// - crops the baked SCORE/TIME/STAGE hud strip off the top
// - keys the painted checkerboard (fake transparency) to real alpha
//   inside the glass areas (windshield, side windows, mirror glass)
// - emits public/images/twingo-cockpit.png (480x270 RGBA master)
// - emits public/images/twingo-cockpit-wheel.png (3 frames side by side)
// - detects the instrument-cluster screen and the rearview-mirror glass
//   on the 480x270 output and prints both as engine constants
// Run: node scripts/build-cockpit.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const DASH_SRC =
  "C:/Users/Yusuf/Downloads/Gemini_Generated_Image_4nb8v4nb8v4nb8v4.jpg";
const WHEEL_SRC =
  "C:/Users/Yusuf/Downloads/Gemini_Generated_Image_8wrnve8wrnve8wrn.jpg";
const OUT_DIR = "public/images";
mkdirSync(OUT_DIR, { recursive: true });

const TOP_CROP = 140; // baked HUD strip + its dither ghost, source px

// glass regions in SOURCE coordinates (after top crop offset removed below)
const GLASS_RECTS = [
  { x: 40, y: 110, w: 2650, h: 605 }, // windshield (+ mirror glass inside)
  { x: 0, y: 230, w: 62, h: 270 }, // left side window
  { x: 2690, y: 230, w: 62, h: 270 }, // right side window
];

// steering wheel circle in WHEEL_SRC coords (measured on a 200px grid)
const WHEEL = { cx: 634, cy: 1004, r: 408 };
// dash warning-light strip visible THROUGH the wheel's top opening:
// transparent in the wheel sprite so it doesn't rotate with the rim
const STRIP = { x: 500, y: 805, w: 410, h: 75 };
const WHEEL_RECT = {
  x: WHEEL.cx - WHEEL.r - 10,
  y: WHEEL.cy - WHEEL.r - 10,
  size: WHEEL.r * 2 + 20,
};
const WHEEL_ANGLES = [-24, 0, 24]; // left, center, right

async function loadKeyedRgba(src, { keyGlass }) {
  const { data, info } = await sharp(src)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const C = info.channels; // 3
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
  if (keyGlass) {
    // checker keying inside glass rects
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
        if (rgba[d + 3] !== 0 || !isHalo(rgba[d], rgba[d + 1], rgba[d + 2]))
          continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
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
  }
  return { rgba, W, OH };
}

// --- dash master: wheel-less interior, glass keyed, no wheel erase ---
const dash = await loadKeyedRgba(DASH_SRC, { keyGlass: true });
const masterPng = await sharp(dash.rgba, {
  raw: { width: dash.W, height: dash.OH, channels: 4 },
})
  .resize(480, 270, { kernel: "nearest" })
  .png()
  .toBuffer();
await sharp(masterPng).toFile(`${OUT_DIR}/twingo-cockpit.png`);
console.log("wrote", `${OUT_DIR}/twingo-cockpit.png`);

// --- wheel frames from the ORIGINAL interior (circle-masked cutout) ---
const wheelSrc = await loadKeyedRgba(WHEEL_SRC, { keyGlass: false });
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
    if (sx < 0 || sy < 0 || sx >= wheelSrc.W || sy >= wheelSrc.OH || !inCircle || inStrip) {
      wheel[d + 3] = 0;
      continue;
    }
    const s = (sy * wheelSrc.W + sx) * 4;
    wheel[d] = wheelSrc.rgba[s];
    wheel[d + 1] = wheelSrc.rgba[s + 1];
    wheel[d + 2] = wheelSrc.rgba[s + 2];
    wheel[d + 3] = wheelSrc.rgba[s + 3];
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
const SCALE = 480 / wheelSrc.W;
const fw = Math.round(wr.size * SCALE);
const sheet = sharp({
  create: {
    width: fw * frames.length,
    height: fw,
    channels: 4,
    background: transparent,
  },
});
const composites = [];
for (let i = 0; i < frames.length; i++) {
  composites.push({
    input: await sharp(frames[i])
      .resize(fw, fw, { kernel: "nearest" })
      .png()
      .toBuffer(),
    left: i * fw,
    top: 0,
  });
}
await sheet.composite(composites).png().toFile(`${OUT_DIR}/twingo-cockpit-wheel.png`);
console.log("wrote", `${OUT_DIR}/twingo-cockpit-wheel.png`, `${fw * 3}x${fw}`);

// --- region detection on the 480x270 master ---
const { data: mdata, info: minfo } = await sharp(masterPng)
  .raw()
  .toBuffer({ resolveWithObject: true });
const MW = minfo.width;
const MH = minfo.height;
const at = (x, y) => {
  const i = (y * MW + x) * 4;
  return [mdata[i], mdata[i + 1], mdata[i + 2], mdata[i + 3]];
};

// connected transparent components (alpha=0): windshield, side windows,
// mirror glass. 4-neighbour flood fill over a label map.
const labels = new Int32Array(MW * MH).fill(-1);
const comps = [];
for (let y = 0; y < MH; y++) {
  for (let x = 0; x < MW; x++) {
    const idx = y * MW + x;
    if (labels[idx] !== -1 || at(x, y)[3] !== 0) continue;
    const id = comps.length;
    let minX = x;
    let maxX = x;
    let minY = y;
    let maxY = y;
    let count = 0;
    const stack = [idx];
    labels[idx] = id;
    while (stack.length) {
      const cur = stack.pop();
      const cx = cur % MW;
      const cy = (cur / MW) | 0;
      count++;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const ni = ny * MW + nx;
        if (labels[ni] === -1 && at(nx, ny)[3] === 0) {
          labels[ni] = id;
          stack.push(ni);
        }
      }
    }
    comps.push({ minX, minY, maxX, maxY, count });
  }
}
comps.sort((a, b) => b.count - a.count);
console.log(
  "transparent components (x,y,w,h,count):",
  comps
    .slice(0, 6)
    .map(
      (c) =>
        `[${c.minX},${c.minY} ${c.maxX - c.minX + 1}x${c.maxY - c.minY + 1} n=${c.count}]`,
    )
    .join(" "),
);
// mirror glass = the small component in the top band, horizontally central
const mirror = comps.find(
  (c) =>
    c.count < 4000 &&
    c.maxY < MH * 0.35 &&
    c.minX > MW * 0.3 &&
    c.maxX < MW * 0.7,
);

// cluster screen: dark-green rectangle mid-dash (bright green digits on
// deep green glass — distinct from every grey/blue dash surface)
let cMinX = MW;
let cMinY = MH;
let cMaxX = -1;
let cMaxY = -1;
let cCount = 0;
for (let y = Math.round(MH * 0.25); y < MH * 0.6; y++) {
  for (let x = Math.round(MW * 0.3); x < MW * 0.7; x++) {
    const [r, g, b, a] = at(x, y);
    if (a > 200 && g > 45 && g < 130 && g > r + 18 && g > b + 18) {
      cCount++;
      if (x < cMinX) cMinX = x;
      if (x > cMaxX) cMaxX = x;
      if (y < cMinY) cMinY = y;
      if (y > cMaxY) cMaxY = y;
    }
  }
}
const cluster =
  cCount > 50
    ? { minX: cMinX, minY: cMinY, maxX: cMaxX, maxY: cMaxY, count: cCount }
    : null;

console.log("mirror glass:", JSON.stringify(mirror));
console.log("cluster screen:", JSON.stringify(cluster));

const frac = (r) =>
  r
    ? {
        xF: +(r.minX / MW).toFixed(4),
        yF: +(r.minY / MH).toFixed(4),
        wF: +((r.maxX - r.minX + 1) / MW).toFixed(4),
        hF: +((r.maxY - r.minY + 1) / MH).toFixed(4),
      }
    : null;

// engine constants: geometry as fractions of the dash rect
console.log(
  "engine constants:",
  JSON.stringify({
    wheelCxF: +(WHEEL.cx / wheelSrc.W).toFixed(4),
    wheelCyF: +((WHEEL.cy - TOP_CROP) / wheelSrc.OH).toFixed(4),
    wheelFwF: +(wr.size / wheelSrc.W).toFixed(4),
    wheelFhF: +(wr.size / wheelSrc.OH).toFixed(4),
    mirror: frac(mirror),
    cluster: frac(cluster),
  }),
);
process.exit(0);
