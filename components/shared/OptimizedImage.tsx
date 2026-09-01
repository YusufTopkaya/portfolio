"use client";

import { ImageIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface OptimizedImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
  fetchPriority?: "high" | "low" | "auto";
  quality?: number;
  objectFit?: "contain" | "cover";
  showLoadingSpinner?: boolean;
  fallbackIcon?: React.ReactNode;
  onLoadComplete?: () => void;
  onErrorCallback?: () => void;
  /** Timeout in ms before showing error state (default: 15000) */
  loadingTimeout?: number;
  /** Fallback image URL to try if main src fails */
  fallbackSrc?: string;
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
  fetchPriority,
  quality = 75,
  objectFit = "cover",
  showLoadingSpinner = true,
  fallbackIcon,
  onLoadComplete,
  onErrorCallback,
  loadingTimeout = 15000,
  fallbackSrc,
}: OptimizedImageProps) {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [triedFallback, setTriedFallback] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadStartTimeRef = useRef<number>(Date.now());

  // Reset state when src changes
  useEffect(() => {
    setCurrentSrc(src);
    setImageLoading(true);
    setImageError(false);
    setTriedFallback(false);
    loadStartTimeRef.current = Date.now();
  }, [src]);

  // Timeout mechanism - if image doesn't load within timeout, try fallback or show error
  useEffect(() => {
    if (!imageLoading) return;

    timeoutRef.current = setTimeout(() => {
      if (imageLoading) {
        // Try fallback if available and not already tried
        if (fallbackSrc && !triedFallback) {
          setCurrentSrc(fallbackSrc);
          setTriedFallback(true);
          loadStartTimeRef.current = Date.now();
        } else {
          setImageError(true);
          setImageLoading(false);
          onErrorCallback?.();
        }
      }
    }, loadingTimeout);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [
    imageLoading,
    loadingTimeout,
    fallbackSrc,
    triedFallback,
    onErrorCallback,
  ]);

  const handleLoad = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setImageLoading(false);
    onLoadComplete?.();
  };

  const handleError = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // Try fallback if available and not already tried
    if (fallbackSrc && !triedFallback) {
      setCurrentSrc(fallbackSrc);
      setTriedFallback(true);
      loadStartTimeRef.current = Date.now();
    } else {
      setImageError(true);
      setImageLoading(false);
      onErrorCallback?.();
    }
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
        src={currentSrc}
        alt={alt}
        fill={fill}
        width={width}
        height={height}
        sizes={sizes}
        className={`${className} ${objectFit === "cover" ? "object-cover" : "object-contain"}`}
        priority={priority}
        fetchPriority={fetchPriority}
        quality={quality}
        onLoad={handleLoad}
        onError={handleError}
      />
    </>
  );
}
