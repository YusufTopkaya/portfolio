"use client";

import { Player } from "@lordicon/react";
import { useEffect, useRef } from "react";

interface LordIconProps {
  iconData: object;
  size?: number;
  className?: string;
  color?: string;
  autoplay?: boolean;
  interval?: number; // Auto-animation interval (ms)
  onHover?: boolean; // Play on hover
}

export function LordIcon({
  iconData,
  size = 24,
  className = "",
  color = "currentColor",
  autoplay = false,
  interval = 3000,
  onHover = true,
}: LordIconProps) {
  const playerRef = useRef<Player>(null);

  useEffect(() => {
    // Play animation on mount with a small delay for hydration
    if (autoplay && playerRef.current) {
      const initialTimeout = setTimeout(() => {
        playerRef.current?.playFromBeginning();
      }, 100);

      // Set up interval for repeated animations
      if (interval) {
        const intervalId = setInterval(() => {
          playerRef.current?.playFromBeginning();
        }, interval);

        return () => {
          clearTimeout(initialTimeout);
          clearInterval(intervalId);
        };
      }

      return () => clearTimeout(initialTimeout);
    }
  }, [autoplay, interval]);

  const handleHover = () => {
    if (onHover && playerRef.current) {
      playerRef.current.playFromBeginning();
    }
  };

  const handleReady = () => {
    if (autoplay && playerRef.current) {
      playerRef.current.playFromBeginning();
    }
  };

  return (
    <div
      onMouseEnter={handleHover}
      className={`${onHover ? "cursor-pointer" : ""} inline-block ${className}`}
      suppressHydrationWarning
    >
      <Player
        ref={playerRef}
        icon={iconData}
        size={size}
        colorize={color}
        onReady={handleReady}
      />
    </div>
  );
}
