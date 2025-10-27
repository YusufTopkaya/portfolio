import type { Metadata } from "next";
import { SEOMetadata } from "./content-loader";

export function buildMetadataWithAbsoluteUrls(
  metadata: SEOMetadata,
  siteUrl: string,
  additionalConfig?: {
    url?: string;
    locale?: string;
  }
): Metadata {
  const baseUrl = new URL(siteUrl);

  return {
    ...metadata,
    metadataBase: baseUrl,
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
