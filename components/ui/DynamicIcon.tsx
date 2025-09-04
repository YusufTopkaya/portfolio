"use client";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import dynamic from "next/dynamic";
import { FC, memo } from "react";

// Types
export type IconName = keyof typeof dynamicIconImports;
type ReactComponent = FC<{ className?: string }>;

// Pre-load all Lucide icons for optimal performance
const icons = Object.keys(dynamicIconImports) as IconName[];
const icons_components = {} as Record<IconName, ReactComponent>;

// Build-time icon component creation - more efficient than runtime dynamic imports
for (const name of icons) {
  const IconComponent = dynamic(dynamicIconImports[name], {
    ssr: false,
    loading: () => (
      <div className="w-4 h-4 animate-pulse bg-gray-300 rounded" />
    ),
  }) as ReactComponent;
  icons_components[name] = IconComponent;
}

export type DynamicIconProps = {
  name: IconName;
  className?: string;
  fallback?: IconName;
};

export const DynamicIcon = memo(
  ({ name, fallback = "circle", ...props }: DynamicIconProps) => {
    const Icon = icons_components[name] || icons_components[fallback];
    if (!Icon) {
      // Ultimate fallback - a simple div
      return <div className={`${props.className} bg-gray-300 rounded`} />;
    }
    return <Icon {...props} />;
  }
);
DynamicIcon.displayName = "DynamicIcon";

// Dynamic icon resolver - supports any icon name from Lucide with robust fallback
export function getIconName(
  iconName?: string,
  fallback: IconName = "circle"
): IconName {
  if (!iconName) {
    return fallback;
  }

  // Convert to kebab-case (Lucide naming convention)
  const kebabCase = iconName
    .toLowerCase()
    .replace(/([A-Z])/g, "-$1")
    .replace(/^-/, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // Check if icon exists in dynamicIconImports
  if (kebabCase in dynamicIconImports) {
    return kebabCase as IconName;
  }

  // Try some common variations
  const variations = [
    iconName.toLowerCase().replace(/[^a-z0-9]/g, ""),
    iconName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    iconName
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
      .replace(/^-/, ""),
  ];

  for (const variation of variations) {
    if (variation in dynamicIconImports) {
      return variation as IconName;
    }
  }

  return fallback; // Fallback if icon not found
}

// Utility function to check if an icon exists
export function iconExists(iconName: string): boolean {
  const resolvedName = getIconName(iconName);
  return resolvedName !== "circle" || iconName === "circle";
}

// Get all available icon names (useful for development/debugging)
export function getAvailableIcons(): IconName[] {
  return icons;
}
