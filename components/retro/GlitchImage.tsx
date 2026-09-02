"use client";

import { useEffect, useRef, useState } from "react";

const SLICE_COUNT = 24;
const TARGET_AMPLITUDE = 10; // max horizontal wave offset in px
const SIGMA = 0.12; // gaussian falloff around the cursor row (0..1 of height)

interface GlitchImageProps {
  src: string;
  alt: string;
}

/**
 * "Magnet near a CRT" hover effect: the image is split into horizontal
 * slices and only the slices near the cursor row wave sideways
 * (gaussian falloff), with chromatic aberration and brightness flicker
 * while hovering. Motion decays smoothly on mouse leave.
 *
 * Slice geometry is computed in measured pixels (never % heights) and each
 * slice overlaps the next one by 1px. Percentage-based slice heights leave
 * hairline seams between slices on Firefox/Zen due to sub-pixel rounding.
 */
export function GlitchImage({ src, alt }: GlitchImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // wave state, mutated per animation frame
  const wave = useRef({ y: 0.5, amp: 0, target: 0, phase: 0 });
  const [, setFrame] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    let running = true;

    const tick = (now: number) => {
      if (!running) return;
      const w = wave.current;
      w.phase = now / 1000;
      // ease amplitude toward target (in on hover, out on leave)
      w.amp += (w.target - w.amp) * 0.15;
      // skip re-renders when fully idle
      if (w.target > 0 || w.amp > 0.01) {
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className="h-full w-full object-cover" />;
  }

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return;
    wave.current.y = (e.clientY - rect.top) / rect.height;
  };

  const { y, amp, phase } = wave.current;
  const active = amp > 0.15;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={alt}
      className="relative h-full w-full overflow-hidden"
      onMouseMove={handleMove}
      onMouseEnter={() => {
        wave.current.target = TARGET_AMPLITUDE;
      }}
      onMouseLeave={() => {
        wave.current.target = 0;
      }}
      style={{
        filter: active
          ? `brightness(${1 + 0.12 * Math.sin(phase * 47)})
             drop-shadow(2px 0 rgba(255, 71, 87, ${Math.min(0.6, amp / 12)}))
             drop-shadow(-2px 0 rgba(0, 217, 255, ${Math.min(0.6, amp / 12)}))`
          : undefined,
      }}
    >
      {height === 0 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
      ) : (
        Array.from({ length: SLICE_COUNT }, (_, i) => {
          const center = (i + 0.5) / SLICE_COUNT;
          const falloff = Math.exp(-((center - y) ** 2) / (2 * SIGMA ** 2));
          const offset = amp * falloff * Math.sin(phase * 8 + i * 0.6);
          // integer pixel band + 1px overlap onto the next band => no seams
          const top = Math.floor((i * height) / SLICE_COUNT);
          const sliceHeight =
            Math.floor(((i + 1) * height) / SLICE_COUNT) - top + 1;
          return (
            <div
              key={i}
              className="absolute left-0 w-full overflow-hidden"
              style={{
                top,
                height: sliceHeight,
                transform: offset ? `translateX(${offset}px)` : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="absolute left-0 w-full object-cover"
                style={{ top: -top, height }}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
