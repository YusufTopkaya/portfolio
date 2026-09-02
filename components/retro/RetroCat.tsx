"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pixel-art cat living on top of the floating CRT computer.
 * Frames come from a real 32x32-cell sprite sheet (11 cols x 53 rows,
 * public/images/cat-sprite.png) rendered with a pixelated CSS
 * background — no canvas, no animation libraries.
 *
 * - Arrival: teleports in through a green portal (public/images/
 *   portal-sprite.png, 8x3 cells of 64x64) right as the page-wide CRT
 *   boot animation settles, so the cat and the computer appear together.
 * - Idle: curled up asleep on the monitor, breathing (2 frames), Zzz.
 * - Hover: sits up and purrs, a pixel heart floats up (being petted).
 * - Click/tap: hops down (desktop) and strolls along the bottom of the
 *   page for a random 15-45s — with random grooming pauses — then
 *   walks back under the monitor, hops up and falls asleep again.
 *   On mobile the perch is the slim ticker bar itself, so there is no
 *   hop — the stroll starts right away.
 *
 * Every frame carries its painted bounds and ground line measured from
 * the sheet's alpha channel. The button hitbox is exactly the sleeping
 * sprite's painted area (no invisible hover zones), and each frame's
 * cell is offset so the paws always plant on the box bottom edge.
 * The sprite layers are pointer-events:none, so only the hitbox
 * itself is interactive. On resize the cat cancels whatever it is
 * doing and snaps back to its perch.
 */

const CELL = 32; // art px per frame cell
const SCALE = 4; // CSS px per art px (integer — pixel art stays crisp)
const CELL_PX = CELL * SCALE;
const SHEET_URL = "/images/cat-sprite.png";
const SHEET_W = 352 * SCALE;
const SHEET_H = 1696 * SCALE;

/** hitbox = the sleeping sprite's painted bounds (art px) */
const BOX_W = 21 * SCALE;
const BOX_H = 16 * SCALE;

const WALK_SPEED = 85; // px per second, rAF-driven smooth glide
const WALK_TICK_MS = 100; // walk frame duration — synced to the stride so feet don't slide
const GROOM_TICK_MS = 150;
const SLEEP_TICK_MS = 900; // breathing frame duration
const STROLL_MIN_MS = 15000;
const STROLL_MAX_MS = 45000;
const GROUND_MARGIN = 2;
/** page-wide CRT boot is 1400ms; the portal opens right after it settles */
const BOOT_SETTLE_MS = 1500;

/* green portal: sheet is 512x192 = 8 cols x 3 rows of 64x64.
   Row 1 reads as opening (flat line -> full swirl), row 2 as closing. */
const PORTAL_URL = "/images/portal-sprite.png";
const PORTAL_CELL = 64;
const PORTAL_SCALE = 2;
const PORTAL_PX = PORTAL_CELL * PORTAL_SCALE;
const PORTAL_TICK_MS = 65;
const PORTAL_SEQ = [
  ...Array.from({ length: 8 }, (_, c) => ({ row: 1, col: c })), // open
  ...Array.from({ length: 2 }, (_, i) => ({ row: 0, col: 6 + i })), // hold full swirl
  ...Array.from({ length: 6 }, (_, c) => ({ row: 2, col: c })), // close
];
/** cat pops in once the portal is fully open (first hold frame) */
const PORTAL_CAT_AT = 8;

/** col = cell column; bx/bw = painted horizontal bounds inside the cell
    (art px); ground = the cell-local y that should touch the surface.
    For sleeping the body's main mass (not the lowest tail-blob pixel)
    defines the ground line, so the cat visibly rests on the monitor
    instead of floating above it. */
interface Frame {
  col: number;
  bx: number;
  bw: number;
  ground: number;
}

const WALK_LEFT: Frame[] = [
  { col: 0, bx: 5, bw: 22, ground: 24 },
  { col: 1, bx: 5, bw: 22, ground: 23 },
  { col: 2, bx: 3, bw: 25, ground: 21 },
  { col: 3, bx: 5, bw: 24, ground: 23 },
  { col: 4, bx: 5, bw: 24, ground: 24 },
  { col: 5, bx: 5, bw: 23, ground: 23 },
  { col: 6, bx: 4, bw: 23, ground: 21 },
  { col: 7, bx: 5, bw: 22, ground: 23 },
];

const WALK_RIGHT: Frame[] = [
  { col: 0, bx: 5, bw: 22, ground: 24 },
  { col: 1, bx: 5, bw: 22, ground: 23 },
  { col: 2, bx: 4, bw: 25, ground: 21 },
  { col: 3, bx: 3, bw: 24, ground: 23 },
  { col: 4, bx: 3, bw: 24, ground: 24 },
  { col: 5, bx: 4, bw: 23, ground: 23 },
  { col: 6, bx: 5, bw: 23, ground: 21 },
  { col: 7, bx: 5, bw: 22, ground: 23 },
];

const GROOM: Frame[] = Array.from({ length: 8 }, (_, i) => ({
  col: i,
  bx: 9,
  bw: 13,
  ground: 26,
}));

const ANIMS = {
  // curled-up sleep, facing left, 2 breathing frames
  sleep: {
    row: 12,
    frames: [
      { col: 0, bx: 6, bw: 21, ground: 21 },
      { col: 1, bx: 6, bw: 21, ground: 21 },
    ],
  },
  // sitting front, eyes open — being petted
  awake: { row: 0, frames: [{ col: 0, bx: 9, bw: 18, ground: 23 }] },
  // crouch, used for both hops
  jump: { row: 2, frames: [{ col: 0, bx: 9, bw: 13, ground: 24 }] },
  // standing front, licking its paw — grooming pause
  groom: { row: 33, frames: GROOM },
  walkLeft: { row: 7, frames: WALK_LEFT },
  walkRight: { row: 6, frames: WALK_RIGHT },
} as const;

type AnimKey = keyof typeof ANIMS;
type Mode = "perch" | "jumpDown" | "walk" | "jumpUp";

/* tiny 7x6 pixel heart shown while the cat is petted */
const HEART = [
  ".HH.HH.",
  "HHHHHHH",
  "HHHHHHH",
  ".HHHHH.",
  "..HHH..",
  "...H...",
];
const HEART_SHADOW = HEART.flatMap((row, y) =>
  [...row].map((ch, x) =>
    ch === "H" ? `${x * 2}px ${y * 2}px 0 0 #e76e55` : "",
  ),
)
  .filter(Boolean)
  .join(",");

export function RetroCat() {
  const [mode, setMode] = useState<Mode>("perch");
  const [frameIdx, setFrameIdx] = useState(0);
  const [petted, setPetted] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [facingLeft, setFacingLeft] = useState(true);
  const [smooth, setSmooth] = useState(false);
  const [grooming, setGrooming] = useState(false);
  const [ready, setReady] = useState(false);
  const [portalIdx, setPortalIdx] = useState<number | null>(null);

  const dirRef = useRef(1);
  const returningRef = useRef(false);
  const groomingRef = useRef(false);
  const coarseRef = useRef(false);
  const perchRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posRef = useRef<{ x: number; y: number } | null>(null);
  posRef.current = pos;

  /* touch devices have no hover; taps must not trigger petting */
  useEffect(() => {
    coarseRef.current = window.matchMedia("(pointer: coarse)").matches;
  }, []);

  /* Arrival: once the page-wide CRT boot settles, open the green portal,
     pop the cat in mid-sequence, then close the portal */
  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      const t = window.setTimeout(() => setReady(true), BOOT_SETTLE_MS);
      return () => window.clearTimeout(t);
    }
    let interval: number | undefined;
    const start = window.setTimeout(() => {
      let i = 0;
      setPortalIdx(0);
      interval = window.setInterval(() => {
        i += 1;
        if (i >= PORTAL_SEQ.length) {
          window.clearInterval(interval);
          setPortalIdx(null);
          return;
        }
        if (i === PORTAL_CAT_AT) setReady(true);
        setPortalIdx(i);
      }, PORTAL_TICK_MS);
    }, BOOT_SETTLE_MS);
    return () => {
      window.clearTimeout(start);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  const measurePerch = useCallback(() => {
    // desktop: asleep on the floating CRT monitor
    const crt = document.getElementById("retro-crt-pc");
    // hidden with display:none on mobile (offsetParent is unreliable for
    // fixed elements — it is null in Chrome even when visible)
    if (crt && crt.getClientRects().length > 0) {
      const rect = crt.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - BOX_W / 2,
        // body mass lands flush on the monitor's top edge
        y: rect.top - BOX_H,
      };
    }
    // mobile: asleep on the slim stock ticker bar at the bottom edge
    const bar = document.getElementById("retro-ticker-bar");
    if (bar && bar.getClientRects().length > 0) {
      const rect = bar.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - BOX_W / 2,
        y: rect.top - BOX_H,
      };
    }
    return null;
  }, []);

  const isMobilePerch = useCallback(() => {
    const bar = document.getElementById("retro-ticker-bar");
    return !!bar && bar.getClientRects().length > 0;
  }, []);

  /* Track the perch position; snap to it while perched. Polled because
     the CRT boot animation distorts rects for the first ~1.3s and the
     layout can still shift while fonts load. */
  useEffect(() => {
    const update = () => {
      const perch = measurePerch();
      if (!perch) return;
      perchRef.current = perch;
      setPos((p) => (mode === "perch" || p === null ? perch : p));
    };
    update();
    const poll = window.setInterval(update, 1000);
    // resolution change: cancel whatever the cat is doing and snap it
    // back to its initial perch position
    const reset = () => {
      const perch = measurePerch();
      if (!perch) return;
      perchRef.current = perch;
      setSmooth(false);
      setPetted(false);
      setMode("perch");
      setPos(perch);
    };
    window.addEventListener("resize", reset);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("resize", reset);
    };
  }, [measurePerch, mode]);

  /* Frame clock: walk/groom cycle while on the ground, breathing
     while asleep */
  useEffect(() => {
    if (mode === "jumpDown" || mode === "jumpUp") return;
    if (mode === "perch" && petted) return; // static sit frame
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (mode === "perch" && reduceMotion) return;
    const tick =
      mode === "walk"
        ? grooming
          ? GROOM_TICK_MS
          : WALK_TICK_MS
        : SLEEP_TICK_MS;
    const t = window.setInterval(() => setFrameIdx((f) => f + 1), tick);
    return () => window.clearInterval(t);
  }, [mode, petted, grooming]);

  /* Strolling: smooth rAF glide along the page bottom for a random
     15-45s with random grooming pauses, then homeward */
  useEffect(() => {
    if (mode !== "walk") return;
    dirRef.current = Math.random() > 0.5 ? 1 : -1;
    returningRef.current = false;

    const duration =
      STROLL_MIN_MS + Math.random() * (STROLL_MAX_MS - STROLL_MIN_MS);

    // 1-2 grooming pauses at random moments during the free stroll
    const timers: number[] = [];
    const pauses = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < pauses; i++) {
      const start = 3000 + Math.random() * (duration - 8000);
      const length = 2000 + Math.random() * 2000;
      timers.push(
        window.setTimeout(() => {
          if (returningRef.current) return;
          groomingRef.current = true;
          setGrooming(true);
        }, start),
        window.setTimeout(() => {
          groomingRef.current = false;
          setGrooming(false);
        }, start + length),
      );
    }

    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const p = posRef.current;
      if (p && !groomingRef.current) {
        const max = window.innerWidth - BOX_W - 8;
        let nx: number;
        if (returningRef.current) {
          const dist = perchRef.current.x - p.x;
          if (Math.abs(dist) <= WALK_SPEED * dt + 1) {
            // arrived under the monitor: hop back up
            setFacingLeft(true);
            setSmooth(true);
            setMode("jumpUp");
            setPos(perchRef.current);
            window.setTimeout(() => {
              setSmooth(false);
              setMode("perch");
            }, 600);
            return;
          }
          dirRef.current = Math.sign(dist);
          nx = p.x + dirRef.current * WALK_SPEED * dt;
        } else {
          nx = p.x + dirRef.current * WALK_SPEED * dt;
          if (nx <= 8 || nx >= max) {
            dirRef.current *= -1;
            nx = Math.min(Math.max(nx, 8), max);
          }
        }
        setFacingLeft(dirRef.current < 0);
        setPos({ x: nx, y: p.y });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    timers.push(
      window.setTimeout(() => {
        // homeward: no more grooming
        returningRef.current = true;
        groomingRef.current = false;
        setGrooming(false);
      }, duration),
    );

    return () => {
      cancelAnimationFrame(raf);
      for (const t of timers) window.clearTimeout(t);
      groomingRef.current = false;
      setGrooming(false);
    };
  }, [mode]);

  const handleClick = () => {
    if (mode !== "perch") return;
    setPetted(false); // touch devices: the tap also fired mouseenter
    if (isMobilePerch()) {
      // the ticker bar already IS the ground — no hop, just stroll off
      setFacingLeft(false);
      setMode("walk");
      return;
    }
    setSmooth(true);
    setMode("jumpDown");
    // small forward drift makes the hop read like a real jump arc
    setPos((p) => (p ? { x: p.x + 20, y: measureGround() } : p));
    window.setTimeout(() => {
      setSmooth(false);
      setMode("walk");
    }, 550);
  };

  /* ground line for the stroll: on mobile the cat walks on top of the
     ticker bar, on desktop along the viewport's bottom edge */
  function measureGround() {
    const bar = document.getElementById("retro-ticker-bar");
    const base =
      bar && bar.getClientRects().length > 0
        ? bar.getBoundingClientRect().top
        : window.innerHeight;
    return base - BOX_H - GROUND_MARGIN;
  }

  if (!pos) return null;

  const animKey: AnimKey =
    mode === "walk"
      ? grooming
        ? "groom"
        : facingLeft
          ? "walkLeft"
          : "walkRight"
      : mode === "jumpDown" || mode === "jumpUp"
        ? "jump"
        : petted
          ? "awake"
          : "sleep";

  const anim = ANIMS[animKey];
  const frame = anim.frames[frameIdx % anim.frames.length];
  // gap between the frame's ground line and its cell bottom (art px)
  const gap = CELL - 1 - frame.ground;

  return (
    <button
      type="button"
      aria-label="Pixel cat — pet it, or click to wake it up"
      onClick={handleClick}
      onMouseEnter={() =>
        mode === "perch" && !coarseRef.current && setPetted(true)
      }
      onMouseLeave={() => setPetted(false)}
      className="fixed z-[55] select-none appearance-none border-0 bg-transparent p-0"
      style={{
        left: pos.x,
        top: pos.y,
        width: BOX_W,
        height: BOX_H,
        pointerEvents: ready ? "auto" : "none",
        cursor: ready ? "pointer" : "default",
        transition: smooth
          ? mode === "jumpDown"
            ? "top 0.5s cubic-bezier(0.55, 0, 0.9, 0.6), left 0.5s ease-out"
            : "top 0.55s cubic-bezier(0.2, 0.8, 0.3, 1.05), left 0.35s ease-out"
          : "none",
      }}
    >
      {/* green portal the cat teleports in through — rendered before the
          cat cell so the swirl stays behind the cat, vertically centered
          on the cat's body */}
      {portalIdx !== null && (
        <div
          className="pointer-events-none absolute"
          style={{
            bottom: Math.round(BOX_H / 2 - PORTAL_PX / 2),
            left: Math.round(BOX_W / 2 - PORTAL_PX / 2),
            width: PORTAL_PX,
            height: PORTAL_PX,
            backgroundImage: `url(${PORTAL_URL})`,
            backgroundPosition: `-${PORTAL_SEQ[portalIdx].col * PORTAL_PX}px -${PORTAL_SEQ[portalIdx].row * PORTAL_PX}px`,
            backgroundSize: `${512 * PORTAL_SCALE}px ${192 * PORTAL_SCALE}px`,
            imageRendering: "pixelated",
          }}
        />
      )}

      {/* the cat's cell, offset so the painted sprite fills the hitbox and
          its paws rest on the box bottom. pointer-events:none keeps hover
          confined to the hitbox — the cell pokes out below/above it. The
          purr class lives on the inner div so its transform animation
          never disturbs this placement. Fades in mid-portal. */}
      <div
        className="pointer-events-none absolute"
        style={{
          bottom: -gap * SCALE,
          left: -frame.bx * SCALE + Math.round((BOX_W - frame.bw * SCALE) / 2),
          width: CELL_PX,
          height: CELL_PX,
          opacity: ready ? 1 : 0,
          transition: "opacity 0.12s ease-in",
        }}
      >
        <div
          className={petted && mode === "perch" ? "cat-purr" : undefined}
          style={{
            width: CELL_PX,
            height: CELL_PX,
            backgroundImage: `url(${SHEET_URL})`,
            backgroundPosition: `-${frame.col * CELL_PX}px -${anim.row * CELL_PX}px`,
            backgroundSize: `${SHEET_W}px ${SHEET_H}px`,
            imageRendering: "pixelated",
          }}
        />
      </div>

      {/* floating Zzz while asleep */}
      {ready && mode === "perch" && !petted && (
        <div
          className="cat-zzz pointer-events-none absolute font-pixel"
          style={{
            left: 52,
            top: -14,
            fontSize: 10,
            color: "#8b95a8",
          }}
        >
          z
        </div>
      )}

      {/* floating heart while being petted */}
      {petted && mode === "perch" && (
        <div
          className="cat-heart pointer-events-none absolute"
          style={{ left: 34, top: -18 }}
        >
          <div style={{ width: 2, height: 2, boxShadow: HEART_SHADOW }} />
        </div>
      )}
    </button>
  );
}
