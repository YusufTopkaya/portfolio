import { getSEOMetadata } from "@/lib/i18n/server-content-loader";
import { getLanguageByCode, defaultLanguage } from "@/lib/i18n/config";
import type { Metadata } from "next";

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

  return {
    ...metadata,
    metadataBase: new URL(siteUrl),
    openGraph: {
      ...metadata.openGraph,
      ...defaultMetadata.openGraph,
      url: `${siteUrl}/${lang}`,
      locale: language?.locale,
    },
    twitter: defaultMetadata.twitter,
  };
}

export default async function Layout({ children, params }: LayoutProps) {
  await params; // Ensure params is resolved
  return <>{children}</>;
}
