import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    rules: [
      // Allow all search engines
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      // Google
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      // Bing
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      // Yahoo
      {
        userAgent: "Slurp",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      // AI Crawlers - OpenAI
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      // AI Crawlers - Anthropic (Claude)
      {
        userAgent: "anthropic-ai",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      {
        userAgent: "Claude-Web",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      // AI Crawlers - Others
      {
        userAgent: "CCBot",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      {
        userAgent: "Applebot-Extended",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      {
        userAgent: "Bytespider",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      {
        userAgent: "Diffbot",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      {
        userAgent: "FacebookBot",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      {
        userAgent: "ImagesiftBot",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      {
        userAgent: "Omgilibot",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      {
        userAgent: "Omgili",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
      // Cohere AI
      {
        userAgent: "cohere-ai",
        allow: "/",
        disallow: ["/api/", "/og-preview"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
