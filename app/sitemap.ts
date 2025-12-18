import type { MetadataRoute } from "next";
import { defaultLanguage, languageCodes } from "@/lib/i18n/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const lastModified = new Date();

  // Build alternates object for hreflang
  const alternates: Record<string, string> = {};
  for (const lang of languageCodes) {
    alternates[lang] = `${siteUrl}/${lang}`;
  }

  // Create language-specific routes with alternates
  const languageRoutes = languageCodes.map((lang) => ({
    url: `${siteUrl}/${lang}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 1,
    alternates: {
      languages: alternates,
    },
  }));

  // Create root route that redirects to default language
  const rootRoute = {
    url: siteUrl,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 1,
    alternates: {
      languages: {
        ...alternates,
        "x-default": `${siteUrl}/${defaultLanguage}`,
      },
    },
  };

  return [rootRoute, ...languageRoutes];
}
