"use client";

import { useEffect, useRef } from "react";

/**
 * Matrix digital rain rendered on a full-screen canvas fixed behind the
 * page content. Column characters fade out via a translucent fill of the
 * current page background color, so the rain sits naturally on both the
 * light (beige) and dark (CRT) themes. Disabled under reduced motion.
 *
 * Spatial behaviour (document-space, NOT scroll-triggered):
 * - A destination-in alpha mask keeps the rain fully invisible over the
 *   hero, then ramps opacity 0 -> 100% as a fixed vertical gradient below
 *   the hero's bottom edge. Past the ramp it stays at 100%. The mask is
 *   anchored to document coordinates, so it scrolls with the content.
 * - Glyph positions are offset by scrollY * PARALLAX, so the background
 *   scrolls slower than the foreground content (depth illusion).
 */

const MATRIX_CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF$+-*/=%";
const FONT_SIZE = 16;
/** Background moves at 20% of the foreground scroll speed. */
const PARALLAX = 0.2;

export function RetroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dark = () => document.documentElement.classList.contains("dark");
    let bg = getComputedStyle(document.body).backgroundColor || "#0b0f1a";

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    let columns: number[] = [];
    const initColumns = () => {
      columns = Array(Math.ceil(canvas.width / FONT_SIZE))
        .fill(0)
        .map(() => Math.floor((Math.random() * canvas.height) / FONT_SIZE));
    };
    initColumns();
    window.addEventListener("resize", initColumns);

    let raf = 0;
    let frame = 0;

    // Document-space Y where the hero ends; the alpha ramp starts here.
    // Re-measured periodically because the hero height shifts while the
    // typewriter title is still typing.
    let heroEnd = 0;
    const measureHero = () => {
      const header = document.querySelector("header");
      heroEnd = header
        ? header.getBoundingClientRect().bottom + window.scrollY
        : window.innerHeight;
    };
    measureHero();
    window.addEventListener("resize", measureHero);

    const draw = () => {
      frame += 1;

      // Parallax: shift glyphs slower than the page scrolls.
      const scrollY = window.scrollY;
      const shift = scrollY * PARALLAX;
      const wrap = canvas.height + FONT_SIZE * 2;

      // ~15fps
      if (frame % 4 === 0) {
        if (frame % 60 === 0) {
          bg = getComputedStyle(document.body).backgroundColor || bg;
          measureHero();
        }
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = bg;
        ctx.globalAlpha = dark() ? 0.18 : 0.28;
        ctx.fillRect(0, 0, w, h);

        ctx.globalAlpha = dark() ? 0.8 : 0.5;
        ctx.fillStyle = dark() ? "#22ff66" : "#0a7d32";
        ctx.font = `${FONT_SIZE}px monospace`;
        for (let i = 0; i < columns.length; i++) {
          const char =
            MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
          const rawY = columns[i] * FONT_SIZE;
          // wrap keeps glyphs inside the viewport while scrolling
          const y = ((((rawY - shift) % wrap) + wrap) % wrap) - FONT_SIZE;
          ctx.fillText(char, i * FONT_SIZE, y);
          if (rawY > h && Math.random() > 0.975) {
            columns[i] = 0;
          }
          columns[i] += 1;
        }

        // Spatial alpha mask: invisible at the hero's bottom edge,
        // ramping to fully opaque ~60% of a viewport height below it.
        // Anchored to document coordinates, so it scrolls with the page.
        const rampDoc = window.innerHeight * 0.6;
        const y0 = heroEnd - scrollY;
        const y1 = y0 + rampDoc;
        const grad = ctx.createLinearGradient(0, y0, 0, y1);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,1)");
        ctx.globalCompositeOperation = "destination-in";
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", initColumns);
      window.removeEventListener("resize", measureHero);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
