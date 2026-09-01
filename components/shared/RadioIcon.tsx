"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
// Static import
import radioIconData from "../../public/icons/wired-outline-1505-radio-walkie-talkie-hover-pinch.json";
import { LordIcon } from "./LordIcon";

interface RadioIconProps {
  size?: number;
  className?: string;
  interval?: number;
}

export function RadioIcon({
  size = 20,
  className = "",
  interval = 3000,
}: RadioIconProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // @lordicon/react colorize only accepts hex colors — CSS keywords like
  // "currentColor" are not supported in canvas/lottie rendering.
  const color = !mounted || resolvedTheme === "dark" ? "#9ca3af" : "#6b7280";

  return (
    <LordIcon
      iconData={radioIconData}
      size={size}
      className={className}
      color={color}
      autoplay={true}
      interval={interval}
      onHover={true}
    />
  );
}
