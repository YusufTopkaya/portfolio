import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withSecurity } from "@/lib/security-wrapper";
import { validateAndSanitizeInput, validateURL } from "@/lib/validation";

// Configuration for download security
const ALLOWED_HOSTS = ["raw.githubusercontent.com", "github.com"];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const REQUEST_TIMEOUT = 10000; // 10 seconds

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/zip",
  "text/plain",
  "application/octet-stream",
];

async function downloadHandler(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate and sanitize the URL
  const sanitizedUrl = validateAndSanitizeInput(url) as string;

  // Validate URL format and domain
  const validation = validateURL(sanitizedUrl, ALLOWED_HOSTS);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const response = await fetch(sanitizedUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Check content length
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const blob = await response.blob();

    // Validate and set safe content type
    const contentType =
      response.headers.get("Content-Type") || "application/octet-stream";
    const safeContentType = ALLOWED_CONTENT_TYPES.includes(contentType)
      ? contentType
      : "application/octet-stream";

    const headers = new Headers();
    headers.set("Content-Type", safeContentType);
    headers.set("Content-Disposition", "attachment");
    headers.set("X-Content-Type-Options", "nosniff");

    return new NextResponse(blob, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Failed to download file:", error);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }
}

// Apply security wrapper
export const GET = withSecurity(downloadHandler);
