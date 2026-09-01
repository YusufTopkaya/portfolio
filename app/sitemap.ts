import type { MetadataRoute } from "next";
import {
  getAllBlogSlugs,
  getAvailableLanguagesForSlug,
  getBlogPost,
} from "@/lib/blog";
import { defaultLanguage, languageCodes } from "@/lib/i18n/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const lastModified = new Date();

  // Build alternates object for hreflang with x-default
  const alternates: Record<string, string> = {};
  for (const lang of languageCodes) {
    alternates[lang] = `${siteUrl}/${lang}`;
  }
  alternates["x-default"] = `${siteUrl}/${defaultLanguage}`;

  // Language-specific homepage routes
  const languageRoutes = languageCodes.map((lang) => ({
    url: `${siteUrl}/${lang}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 1.0,
    alternates: {
      languages: alternates,
    },
  }));

  // Resume routes for all languages
  const resumeAlternates: Record<string, string> = {};
  for (const lang of languageCodes) {
    resumeAlternates[lang] = `${siteUrl}/${lang}/resume`;
  }
  resumeAlternates["x-default"] = `${siteUrl}/${defaultLanguage}/resume`;

  const resumeRoutes = languageCodes.map((lang) => ({
    url: `${siteUrl}/${lang}/resume`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.9,
    alternates: {
      languages: resumeAlternates,
    },
  }));

  // Privacy policy routes for all languages
  const privacyAlternates: Record<string, string> = {};
  for (const lang of languageCodes) {
    privacyAlternates[lang] = `${siteUrl}/${lang}/privacy`;
  }
  privacyAlternates["x-default"] = `${siteUrl}/${defaultLanguage}/privacy`;

  const privacyRoutes = languageCodes.map((lang) => ({
    url: `${siteUrl}/${lang}/privacy`,
    lastModified,
    changeFrequency: "yearly" as const,
    priority: 0.5,
    alternates: {
      languages: privacyAlternates,
    },
  }));

  // Blog listing routes for all languages
  const blogAlternates: Record<string, string> = {};
  for (const lang of languageCodes) {
    blogAlternates[lang] = `${siteUrl}/${lang}/blog`;
  }
  blogAlternates["x-default"] = `${siteUrl}/${defaultLanguage}/blog`;

  const blogListRoutes = languageCodes.map((lang) => ({
    url: `${siteUrl}/${lang}/blog`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.8,
    alternates: { languages: blogAlternates },
  }));

  // Individual blog post routes — only for languages with actual content
  const blogSlugs = getAllBlogSlugs();
  const blogPostRoutes = blogSlugs.flatMap((slug) => {
    const post = getBlogPost(slug, defaultLanguage);
    const postLastModified = post
      ? new Date(post.modifiedDate || post.date)
      : lastModified;

    const availableLangs = getAvailableLanguagesForSlug(slug);

    const postAlternates: Record<string, string> = {};
    for (const lang of availableLangs) {
      postAlternates[lang] = `${siteUrl}/${lang}/blog/${slug}`;
    }
    postAlternates["x-default"] = `${siteUrl}/${defaultLanguage}/blog/${slug}`;

    return availableLangs.map((lang) => ({
      url: `${siteUrl}/${lang}/blog/${slug}`,
      lastModified: postLastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      alternates: { languages: postAlternates },
    }));
  });

  return [
    ...languageRoutes,
    ...resumeRoutes,
    ...privacyRoutes,
    ...blogListRoutes,
    ...blogPostRoutes,
    {
      url: `${siteUrl}/llms.txt`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
    {
      url: `${siteUrl}/llms-full.txt`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
  ];
}
