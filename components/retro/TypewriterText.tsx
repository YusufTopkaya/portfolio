"use client";

import { useEffect, useState } from "react";

interface TypewriterTextProps {
  text: string;
  /** Milliseconds between characters. */
  speed?: number;
}

/**
 * Minimal typewriter that inherits all typography from its parent
 * (pixel font, size and color come from the surrounding h1 styles).
 * Types the text once, then leaves a blinking block cursor.
 *
 * An invisible copy of the final text is stacked underneath (same grid
 * cell) so the surrounding layout reserves the final height from the
 * start — the name wraps to two lines while typing and would otherwise
 * push the rest of the hero down mid-animation.
 */
export function TypewriterText({ text, speed = 90 }: TypewriterTextProps) {
  const [length, setLength] = useState(0);
  const done = length >= text.length;

  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => setLength((l) => l + 1), speed);
    return () => clearTimeout(timer);
  }, [length, done, speed]);

  const cursor = (
    <span
      aria-hidden="true"
      className="inline-block animate-pulse"
      style={{ marginLeft: 2 }}
    >
      ▮
    </span>
  );

  return (
    <span aria-label={text} className="inline-grid">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {text}
        {cursor}
      </span>
      <span aria-hidden="true" className="col-start-1 row-start-1">
        {text.slice(0, length)}
        {cursor}
      </span>
    </span>
  );
}
