// Build cockpit sprites from the generated Twingo interior JPGs.
// - DASH_SRC: wheel-less interior — the dash master, so the area behind
//   the (separately drawn) steering wheel is real paint, not a flat fill
// - WHEEL_SRC: the original interior WITH the wheel
// - crops the baked SCORE/TIME/STAGE hud strip off the top
// - keys the painted checkerboard (fake transparency) to real alpha
//   inside the glass areas (windshield, side windows, mirror glass),
//   then deletes leftover jpg specks (small opaque blobs inside glass)
// - the wheel sprite is isolated by DIFF-KEYING the two renders: inside
//   the wheel circle, pixels that differ between the sources ARE the
//   wheel (rim, spokes, hub). Static dash parts visible through the rim
//   openings stay in the master, so only real wheel pixels rotate.
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
// the dash warning-light strip: the generator redrew it at a different
// spot in the wheel-less render, so diff-keying catches it — exclude it
// explicitly (it belongs to the dash, it must not rotate with the rim)
const STRIP = { x: 460, y: 795, w: 490, h: 100 };
// same story for the dash shelf + trim visible through the wheel's top
// opening (redrawn between the two renders). It sits fully inside the
// rim's inner radius and no spoke reaches up there, so a radial-bound
// band excludes it without biting the rim ring
const SHELF = { y0: 645, y1: 800, rMax: 335 };
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
  if (!keyGlass) return { rgba, W, OH };

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

  // speck cleanup: jpg smudge leaves isolated checker cells un-keyed —
  // tiny opaque blobs floating inside the glass. Label opaque components
  // inside each glass rect (8-connectivity) and drop the small ones that
  // don't touch the rect border (the mirror frame/stem are large)
  const MIN_SPECK = 300; // source px
  for (const rect of GLASS_RECTS) {
    const rx0 = rect.x;
    const ry0 = Math.max(0, rect.y - TOP_CROP);
    const rx1 = Math.min(W, rect.x + rect.w);
    const ry1 = Math.min(OH, rect.y - TOP_CROP + rect.h);
    const rw = rx1 - rx0;
    const rh = ry1 - ry0;
    if (rw <= 0 || rh <= 0) continue;
    const comp = new Int32Array(rw * rh).fill(-1);
    const sizes = [];
    for (let y = ry0; y < ry1; y++) {
      for (let x = rx0; x < rx1; x++) {
        const li = (y - ry0) * rw + (x - rx0);
        if (comp[li] !== -1 || rgba[(y * W + x) * 4 + 3] === 0) continue;
        const id = sizes.length;
        let count = 0;
        let touchesBorder = false;
        const stack = [li];
        comp[li] = id;
        while (stack.length) {
          const c = stack.pop();
          const cx = c % rw;
          const cy = (c / rw) | 0;
          count++;
          if (cx === 0 || cy === 0 || cx === rw - 1 || cy === rh - 1)
            touchesBorder = true;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
              const ni = ny * rw + nx;
              if (
                comp[ni] === -1 &&
                rgba[(ry0 + ny) * W * 4 + (rx0 + nx) * 4 + 3] !== 0
              ) {
                comp[ni] = id;
                stack.push(ni);
              }
            }
          }
        }
        sizes.push({ count, touchesBorder });
      }
    }
    let removed = 0;
    for (let y = ry0; y < ry1; y++) {
      for (let x = rx0; x < rx1; x++) {
        const id = comp[(y - ry0) * rw + (x - rx0)];
        if (id < 0) continue;
        const s = sizes[id];
        if (!s.touchesBorder && s.count < MIN_SPECK) {
          rgba[(y * W + x) * 4 + 3] = 0;
          removed++;
        }
      }
    }
    console.log(
      `glass rect ${rx0},${ry0}: ${sizes.length} opaque components, removed ${removed} speck px`,
    );
  }
  return { rgba, W, OH };
}

// --- dash master: wheel-less interior, glass keyed, specks cleaned ---
const dash = await loadKeyedRgba(DASH_SRC, { keyGlass: true });
const masterPng = await sharp(dash.rgba, {
  raw: { width: dash.W, height: dash.OH, channels: 4 },
})
  .resize(480, 270, { kernel: "nearest" })
  .png()
  .toBuffer();
await sharp(masterPng).toFile(`${OUT_DIR}/twingo-cockpit.png`);
console.log("wrote", `${OUT_DIR}/twingo-cockpit.png`);

// --- wheel sprite: diff-keying between the two renders ---
const wheelSrc = await loadKeyedRgba(WHEEL_SRC, { keyGlass: false });
const wr = WHEEL_RECT;

// the two renders differ by a couple of px — find the integer offset
// aligning DASH onto WHEEL by median RGB diff over the wheel rect
// (median: the wheel blob itself always diffs, static dash dominates)
let best = { ox: 0, oy: 0, score: Number.POSITIVE_INFINITY };
for (let oy = -4; oy <= 4; oy++) {
  for (let ox = -4; ox <= 4; ox++) {
    const diffs = [];
    for (let y = wr.y; y < wr.y + wr.size; y += 6) {
      for (let x = wr.x; x < wr.x + wr.size; x += 6) {
        const ay = y - TOP_CROP + oy;
        const ax = x + ox;
        const by = y - TOP_CROP;
        if (ay < 0 || ax < 0 || ay >= dash.OH || ax >= dash.W) continue;
        if (by < 0 || by >= wheelSrc.OH || x >= wheelSrc.W) continue;
        const da = (ay * dash.W + ax) * 4;
        const db = (by * wheelSrc.W + x) * 4;
        diffs.push(
          Math.max(
            Math.abs(dash.rgba[da] - wheelSrc.rgba[db]),
            Math.abs(dash.rgba[da + 1] - wheelSrc.rgba[db + 1]),
            Math.abs(dash.rgba[da + 2] - wheelSrc.rgba[db + 2]),
          ),
        );
      }
    }
    diffs.sort((a, b) => a - b);
    const median = diffs[Math.floor(diffs.length / 2)] ?? 0;
    if (median < best.score) best = { ox, oy, score: median };
  }
}
console.log("wheel alignment offset:", best);
const { ox, oy } = best;

// mask: pixels that differ between the renders, inside the wheel circle
const mask = new Uint8Array(wr.size * wr.size); // 1 = wheel pixel
for (let y = 0; y < wr.size; y++) {
  for (let x = 0; x < wr.size; x++) {
    const sx = wr.x + x;
    const sy = wr.y + y;
    const r2 = (sx - WHEEL.cx) ** 2 + (sy - WHEEL.cy) ** 2;
    const inCircle = r2 <= WHEEL.r ** 2;
    const inStrip =
      sx >= STRIP.x &&
      sx < STRIP.x + STRIP.w &&
      sy >= STRIP.y &&
      sy < STRIP.y + STRIP.h;
    const inShelf =
      sy >= SHELF.y0 && sy <= SHELF.y1 && r2 < SHELF.rMax ** 2;
    if (!inCircle || inStrip || inShelf) continue;
    const by = sy - TOP_CROP;
    const ay = by + oy;
    const ax = sx + ox;
    if (by < 0 || by >= wheelSrc.OH || sx >= wheelSrc.W) continue;
    if (ay < 0 || ax < 0 || ay >= dash.OH || ax >= dash.W) continue;
    const da = (ay * dash.W + ax) * 4;
    const db = (by * wheelSrc.W + sx) * 4;
    const diff = Math.max(
      Math.abs(dash.rgba[da] - wheelSrc.rgba[db]),
      Math.abs(dash.rgba[da + 1] - wheelSrc.rgba[db + 1]),
      Math.abs(dash.rgba[da + 2] - wheelSrc.rgba[db + 2]),
    );
    if (diff > 16) mask[y * wr.size + x] = 1;
  }
}
// keep only the largest connected masked component: the wheel is one big
// blob; jpg noise specks and faint rim echoes are small islands
{
  const comp = new Int32Array(wr.size * wr.size).fill(-1);
  const sizes = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || comp[i] !== -1) continue;
    const id = sizes.length;
    let count = 0;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const c = stack.pop();
      count++;
      const cx = c % wr.size;
      const cy = (c / wr.size) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= wr.size || ny >= wr.size) continue;
        const ni = ny * wr.size + nx;
        if (mask[ni] && comp[ni] === -1) {
          comp[ni] = id;
          stack.push(ni);
        }
      }
    }
    sizes.push(count);
  }
  let biggest = 0;
  for (let i = 1; i < sizes.length; i++)
    if (sizes[i] > sizes[biggest]) biggest = i;
  for (let i = 0; i < mask.length; i++)
    if (mask[i] && comp[i] !== biggest) mask[i] = 0;
  console.log("wheel mask: kept", sizes[biggest], "px of", sizes.length, "components");
}
// 1px dilation with a looser threshold: catch the wheel's anti-aliased
// edge pixels the strict diff missed
{
  const grown = Uint8Array.from(mask);
  for (let y = 0; y < wr.size; y++) {
    for (let x = 0; x < wr.size; x++) {
      if (mask[y * wr.size + x]) continue;
      let nearWheel = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= wr.size || ny >= wr.size) continue;
        if (mask[ny * wr.size + nx]) {
          nearWheel = true;
          break;
        }
      }
      if (!nearWheel) continue;
      const sx = wr.x + x;
      const sy = wr.y + y;
      if (
        sx >= STRIP.x &&
        sx < STRIP.x + STRIP.w &&
        sy >= STRIP.y &&
        sy < STRIP.y + STRIP.h
      )
        continue;
      if (
        sy >= SHELF.y0 &&
        sy <= SHELF.y1 &&
        (sx - WHEEL.cx) ** 2 + (sy - WHEEL.cy) ** 2 < SHELF.rMax ** 2
      )
        continue;
      const by = sy - TOP_CROP;
      const ay = by + oy;
      const ax = sx + ox;
      if (by < 0 || by >= wheelSrc.OH || sx >= wheelSrc.W) continue;
      if (ay < 0 || ax < 0 || ay >= dash.OH || ax >= dash.W) continue;
      const da = (ay * dash.W + ax) * 4;
      const db = (by * wheelSrc.W + sx) * 4;
      const diff = Math.max(
        Math.abs(dash.rgba[da] - wheelSrc.rgba[db]),
        Math.abs(dash.rgba[da + 1] - wheelSrc.rgba[db + 1]),
        Math.abs(dash.rgba[da + 2] - wheelSrc.rgba[db + 2]),
      );
      if (diff > 8) grown[y * wr.size + x] = 1;
    }
  }
  mask.set(grown);
}

// cut the sprite from the WHEEL render, masked to real wheel pixels
const wheel = Buffer.alloc(wr.size * wr.size * 4);
for (let y = 0; y < wr.size; y++) {
  for (let x = 0; x < wr.size; x++) {
    const d = (y * wr.size + x) * 4;
    if (!mask[y * wr.size + x]) continue; // alpha stays 0
    const sx = wr.x + x;
    const sy = wr.y + y - TOP_CROP;
    if (sx < 0 || sy < 0 || sx >= wheelSrc.W || sy >= wheelSrc.OH) continue;
    const s = (sy * wheelSrc.W + sx) * 4;
    wheel[d] = wheelSrc.rgba[s];
    wheel[d + 1] = wheelSrc.rgba[s + 1];
    wheel[d + 2] = wheelSrc.rgba[s + 2];
    wheel[d + 3] = 255;
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
