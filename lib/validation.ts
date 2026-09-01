/**
 * Input Validation and Sanitization Utilities
 * Prevents XSS, parameter pollution, and other input-based attacks
 */

import { Err } from "tsentials/errors";
import { Result } from "tsentials/result";

/**
 * Sanitize string input to prevent XSS attacks
 */
export function sanitizeString(
  input: string,
  maxLength: number = 1000,
): string {
  return input
    .replace(/[<>]/g, "") // Remove < and > characters
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
    .replace(/data:/gi, "") // Remove data: protocol
    .trim()
    .slice(0, maxLength);
}

/**
 * Validate and sanitize input recursively (HPP equivalent)
 */
export function validateAndSanitizeInput(data: unknown): unknown {
  if (typeof data === "string") {
    return sanitizeString(data);
  }

  if (Array.isArray(data)) {
    // Prevent parameter pollution by taking only first element
    return validateAndSanitizeInput(data[0]);
  }

  if (typeof data === "object" && data !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof key === "string" && key.length < 100) {
        sanitized[key] = validateAndSanitizeInput(value);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Validate URL and check against allowed domains
 */
export function validateURL(url: string, allowedHosts: string[]): Result<URL> {
  const parsed = Result.try(
    () => new URL(url),
    () => Err.validation("Url.Invalid", "Invalid URL format"),
  );

  return Result.then(parsed, (urlObj) => {
    // Only allow HTTPS for security
    if (urlObj.protocol !== "https:") {
      return Result.failure(
        Err.forbidden("Url.Protocol", "Only HTTPS URLs are allowed"),
      );
    }

    // Check against allowed hosts
    if (!allowedHosts.some((host) => urlObj.hostname.endsWith(host))) {
      return Result.failure(Err.forbidden("Url.Host", "Domain not allowed"));
    }

    return Result.success(urlObj);
  });
}
