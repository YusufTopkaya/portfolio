import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    rules: [
      // Allow all search engines
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      // Google
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      // Bing
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      // Yahoo
      {
        userAgent: "Slurp",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      // AI Crawlers - OpenAI
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      // AI Crawlers - Anthropic (Claude)
      {
        userAgent: "anthropic-ai",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      {
        userAgent: "Claude-Web",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      // AI Crawlers - Others
      {
        userAgent: "CCBot",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      {
        userAgent: "Applebot-Extended",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      {
        userAgent: "Bytespider",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      {
        userAgent: "Diffbot",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      {
        userAgent: "FacebookBot",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      {
        userAgent: "ImagesiftBot",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      {
        userAgent: "Omgilibot",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      {
        userAgent: "Omgili",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
      // Cohere AI
      {
        userAgent: "cohere-ai",
        allow: "/",
        disallow: ["/api/", "/og-preview", "/_next/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
