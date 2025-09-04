/**
 * Input Validation and Sanitization Utilities
 * Prevents XSS, parameter pollution, and other input-based attacks
 */

/**
 * Sanitize string input to prevent XSS attacks
 */
export function sanitizeString(
  input: string,
  maxLength: number = 1000
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
export function validateURL(
  url: string,
  allowedHosts: string[]
): { valid: boolean; url?: URL; error?: string } {
  try {
    const urlObj = new URL(url);

    // Only allow HTTPS for security
    if (urlObj.protocol !== "https:") {
      return { valid: false, error: "Only HTTPS URLs are allowed" };
    }

    // Check against allowed hosts
    if (!allowedHosts.some((host) => urlObj.hostname.endsWith(host))) {
      return { valid: false, error: "Domain not allowed" };
    }

    return { valid: true, url: urlObj };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}
