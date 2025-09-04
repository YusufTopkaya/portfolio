/**
 * Rate Limiting Utilities
 * Simple memory-based rate limiting for API routes
 */

// In-memory storage for rate limiting (use Redis in production)
const rateLimitMap = new Map<string, number[]>();

/**
 * Simple rate limiting function
 * @param ip - Client IP address
 * @param limit - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns true if request is allowed, false if rate limited
 */
export function rateLimit(
  ip: string,
  limit: number = 100,
  windowMs: number = 15 * 60 * 1000
): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const requests = rateLimitMap.get(ip)!;
  // Remove old requests outside the window
  const validRequests = requests.filter((time: number) => time > windowStart);

  if (validRequests.length >= limit) {
    return false; // Rate limit exceeded
  }

  validRequests.push(now);
  rateLimitMap.set(ip, validRequests);
  return true;
}

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIP = request.headers.get("x-real-ip");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return realIP || "unknown";
}
