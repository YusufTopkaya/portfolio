import type { Metadata } from "next";
import { defaultLanguage, languageCodes } from "./config";
import type { SEOMetadata } from "./content-loader";

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
