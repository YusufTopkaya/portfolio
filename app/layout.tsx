import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "@/components/shared/ClientProviders";
import { GoogleTagManagerHead } from "@/components/shared/GoogleTagManager";
import MicrosoftClarity from "@/components/shared/MicrosoftClarity";
import { defaultLanguage } from "@/lib/i18n/config";
import { buildMetadataWithAbsoluteUrls } from "@/lib/i18n/metadata-utils";
import { getSEOMetadata } from "@/lib/i18n/server-content-loader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  // Optimize font loading for better performance
  display: "swap",
  preload: true,
  fallback: ["system-ui", "arial", "sans-serif"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // Optimize font loading for better performance
  display: "swap",
  preload: true,
  fallback: ["ui-monospace", "monospace"],
});

export async function generateMetadata(): Promise<Metadata> {
  const metadata = await getSEOMetadata(defaultLanguage);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    ...buildMetadataWithAbsoluteUrls(metadata, siteUrl),
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;

  return (
    <html lang={defaultLanguage} suppressHydrationWarning>
      <head>
        {/* Preload critical LCP image */}
        <link
          rel="preload"
          href="/images/profile.webp"
          as="image"
          type="image/webp"
        />
        {gtmId && <GoogleTagManagerHead GTM_ID={gtmId} />}
        <MicrosoftClarity />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClientProviders
          gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}
          gtmId={gtmId}
        >
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
