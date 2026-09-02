"use client";

import { useEffect } from "react";

const BOOT_DURATION_MS = 1400;

/**
 * Classic CRT television power-on played once on page load:
 * a bright dot stretches into a horizontal line, the picture expands,
 * then the screen settles with a "smacked TV" glitch shake.
 * Implemented by toggling the `crt-boot` class on <html>; the animation
 * itself (app/globals.css) runs on <body>, so the whole page takes part.
 */
export function RetroBootEffect() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("crt-boot");
    const timer = setTimeout(
      () => html.classList.remove("crt-boot"),
      BOOT_DURATION_MS,
    );
    return () => {
      clearTimeout(timer);
      html.classList.remove("crt-boot");
    };
  }, []);

  return null;
}
