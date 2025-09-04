/**
 * Main Security Wrapper for API Routes
 * Combines all security utilities into a single wrapper
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "./rate-limit";
import { setCorsHeaders, handleCorsPreflightResponse } from "./cors";

/**
 * Security wrapper for API routes
 * Applies rate limiting, CORS, and basic security headers
 */
export function withSecurity(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    // Get client IP
    const ip = getClientIP(request);

    // Apply rate limiting
    if (!rateLimit(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return handleCorsPreflightResponse();
    }

    try {
      // Call the original handler
      const response = await handler(request);

      // Add security headers to response
      if (response instanceof NextResponse) {
        setCorsHeaders(response);
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("X-Frame-Options", "DENY");
      }

      return response;
    } catch (error) {
      // Don't expose internal errors
      console.error("API Error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
