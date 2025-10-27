"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageIcon } from "lucide-react";

interface OptimizedImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
  quality?: number;
  objectFit?: "contain" | "cover";
  showLoadingSpinner?: boolean;
  fallbackIcon?: React.ReactNode;
  onLoadComplete?: () => void;
  onErrorCallback?: () => void;
}

export function OptimizedImage({
  src,
  alt,
  fill,
  width,
  height,
  sizes,
  className = "",
  priority = false,
  quality = 75,
  objectFit = "cover",
  showLoadingSpinner = true,
  fallbackIcon,
  onLoadComplete,
  onErrorCallback,
}: OptimizedImageProps) {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const isSvg = src.endsWith('.svg') || src.includes('.svg?') || src.includes('data:image/svg+xml');

  const handleLoad = () => {
    setImageLoading(false);
    onLoadComplete?.();
  };

  const handleError = () => {
    setImageError(true);
    setImageLoading(false);
    onErrorCallback?.();
  };

  if (imageError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted">
        {fallbackIcon || (
          <ImageIcon className="w-1/3 h-1/3 text-muted-foreground/30" />
        )}
      </div>
    );
  }

  return (
    <>
      {imageLoading && showLoadingSpinner && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <Image
        src={src}
        alt={alt}
        fill={fill}
        width={width}
        height={height}
        sizes={sizes}
        className={`${className} ${objectFit === "cover" ? "object-cover" : "object-contain"}`}
        priority={priority}
        quality={quality}
        onLoad={handleLoad}
        onError={handleError}
        unoptimized={isSvg}
      />
    </>
  );
}
