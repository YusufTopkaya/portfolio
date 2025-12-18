"use client";

// Static import
import radioIconData from "../../public/icons/wired-outline-1505-radio-walkie-talkie-hover-pinch.json";
import { LordIcon } from "./LordIcon";

interface RadioIconProps {
  size?: number;
  className?: string;
  color?: string;
  interval?: number;
}

export function RadioIcon({
  size = 20,
  className = "",
  color = "currentColor",
  interval = 3000,
}: RadioIconProps) {
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
