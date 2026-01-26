import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  defaultLanguage,
  isValidLanguage,
  languageCodes,
} from "@/lib/i18n/config";
import logger from "@/lib/logger";

async function getLocale(request: NextRequest) {
  const acceptLanguage = request.headers.get("accept-language");
  const browserLang = acceptLanguage?.split(",")?.[0].split("-")?.[0];
  return browserLang && isValidLanguage(browserLang)
    ? browserLang
    : defaultLanguage;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next();

  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  const clientIp =
    (forwardedFor ? forwardedFor.split(",")[0].trim() : null) ||
    realIp ||
    request.headers.get("x-client-ip") ||
    "unknown";

  if (process.env.NODE_ENV === "development") {
    logger.info({
      method: request.method,
      url: request.url,
      pathname,
      ip: clientIp,
      userAgent: request.headers.get("user-agent"),
    });
  }

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );

  response.headers.set("Vary", "Accept-Encoding");

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/og-preview") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt"
  ) {
    if (pathname.startsWith("/api")) {
      response.headers.set(
        "Cache-Control",
        "public, max-age=300, s-maxage=3600",
      );
    } else {
      response.headers.set("Cache-Control", "public, max-age=86400");
    }
    return response;
  }

  if (pathname === "/") {
    const locale = await getLocale(request);
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  const langPattern = languageCodes.join("|");
  if (new RegExp(`^/(${langPattern})(?:/|$)`).test(pathname)) {
    response.headers.set(
      "Cache-Control",
      "public, max-age=3600, must-revalidate",
    );
    return response;
  }

  const locale = await getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|files/|images/|sitemap.xml|robots.txt).*)",
  ],
};
