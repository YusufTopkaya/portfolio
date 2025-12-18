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
    if (!autoplay || !interval) return;

    const intervalId = setInterval(() => {
      if (playerRef.current) {
        playerRef.current.playFromBeginning();
      }
    }, interval);

    return () => clearInterval(intervalId);
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
