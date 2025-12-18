/**
 * CORS (Cross-Origin Resource Sharing) Utilities
 * Handle cross-origin requests securely
 */

import { NextResponse } from "next/server";

/**
 * Default allowed origins
 */
const DEFAULT_ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
];

/**
 * Set CORS headers on response
 */
export function setCorsHeaders(
  response: NextResponse,
  allowedOrigins: string[] = DEFAULT_ORIGINS,
): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", allowedOrigins[0]);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreflightResponse(
  allowedOrigins?: string[],
): NextResponse {
  const response = new NextResponse(null, { status: 200 });
  return setCorsHeaders(response, allowedOrigins);
}
