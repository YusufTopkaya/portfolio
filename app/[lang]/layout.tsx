import type { Metadata } from "next";
import { defaultLanguage, getLanguageByCode } from "@/lib/i18n/config";
import { buildMetadataWithAbsoluteUrls } from "@/lib/i18n/metadata-utils";
import { getSEOMetadata } from "@/lib/i18n/server-content-loader";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{
    lang: string;
  }>;
}

export async function generateMetadata({
  params,
}: LayoutProps): Promise<Metadata> {
  const { lang } = await params;
  const metadata = await getSEOMetadata(lang);
  const defaultMetadata =
    lang !== defaultLanguage ? await getSEOMetadata(defaultLanguage) : metadata;
  const language = getLanguageByCode(lang);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const result = buildMetadataWithAbsoluteUrls(metadata, siteUrl, {
    url: `${siteUrl}/${lang}`,
    locale: language?.locale,
  });

  if (lang !== defaultLanguage) {
    result.openGraph = {
      ...result.openGraph,
      images: result.openGraph?.images || defaultMetadata.openGraph?.images,
    };
    result.twitter = {
      ...result.twitter,
      images: result.twitter?.images || defaultMetadata.twitter?.images,
    };
  }

  return result;
}

export default async function Layout({ children, params }: LayoutProps) {
  await params; // Ensure params is resolved
  return <>{children}</>;
}
