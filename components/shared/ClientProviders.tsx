"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ContentProtection } from "@/components/shared/ContentProtection";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import GoogleAnalytics from "@/components/shared/GoogleAnalytics";
import { GoogleTagManagerBody } from "@/components/shared/GoogleTagManager";

interface ClientProvidersProps {
  children: React.ReactNode;
  gaId?: string;
  gtmId?: string;
}

export function ClientProviders({
  children,
  gaId,
  gtmId,
}: ClientProvidersProps) {
  return (
    <ErrorBoundary>
      <ContentProtection />
      {gtmId && <GoogleTagManagerBody GTM_ID={gtmId} />}
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange={false}
        storageKey="theme"
      >
        {children}
      </NextThemesProvider>

      {gaId && <GoogleAnalytics GA_MEASUREMENT_ID={gaId} />}
    </ErrorBoundary>
  );
}
