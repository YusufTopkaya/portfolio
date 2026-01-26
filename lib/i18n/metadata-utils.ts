import type { Metadata } from "next";
import { defaultLanguage, languageCodes } from "./config";
import type { Profile, SEOMetadata, SkillCategory } from "./content-loader";

export function extractKeywordsFromProfile(profile: Profile): string[] {
  const keywords = new Set<string>();

  // Personal Info
  if (profile.personalInfo.name) keywords.add(profile.personalInfo.name);
  if (profile.personalInfo.position)
    keywords.add(profile.personalInfo.position);

  // Projects
  if (profile.projects) {
    for (const project of profile.projects) {
      keywords.add(project.title);
      if (project.tags) {
        for (const tag of project.tags) {
          keywords.add(tag);
        }
      }
    }
  }

  // Skills
  if (profile.skills) {
    for (const skill of profile.skills) {
      if (typeof skill === "string") {
        keywords.add(skill);
      } else {
        // SkillCategory
        const category = skill as SkillCategory;
        if (category.items) {
          for (const item of category.items) {
            keywords.add(item.name);
          }
        }
      }
    }
  }

  // Blog Posts
  if (profile.blogPosts) {
    for (const post of profile.blogPosts) {
      keywords.add(post.title);
    }
  }

  return Array.from(keywords);
}

export function buildMetadataWithAbsoluteUrls(
  metadata: SEOMetadata,
  siteUrl: string,
  additionalConfig?: {
    url?: string;
    locale?: string;
  },
): Metadata {
  const baseUrl = new URL(siteUrl);
  const currentLang = additionalConfig?.locale || defaultLanguage;

  // Build hreflang alternates for all languages
  const languages: Record<string, string> = {};
  for (const lang of languageCodes) {
    languages[lang] = `${siteUrl}/${lang}`;
  }
  // Add x-default pointing to the default language
  languages["x-default"] = `${siteUrl}/${defaultLanguage}`;

  return {
    ...metadata,
    metadataBase: baseUrl,
    alternates: {
      canonical: `${siteUrl}/${currentLang}`,
      languages,
    },
    openGraph: {
      ...metadata.openGraph,
      url: additionalConfig?.url || siteUrl,
      locale: additionalConfig?.locale,
      images: metadata.openGraph?.images?.map((img) => ({
        ...img,
        url: new URL(img.url, baseUrl).toString(),
      })),
    },
    twitter: {
      ...metadata.twitter,
      images: metadata.twitter?.images
        ? {
            ...metadata.twitter.images,
            url: new URL(metadata.twitter.images.url, baseUrl).toString(),
          }
        : undefined,
    },
  };
}
