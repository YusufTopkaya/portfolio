"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/react";
import GoogleAnalytics from "@/components/shared/GoogleAnalytics";
import MicrosoftClarity from "@/components/shared/MicrosoftClarity";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { SpeedInsights } from "@vercel/speed-insights/next";

interface ClientProvidersProps {
  children: React.ReactNode;
  gaId?: string;
  clarityId?: string;
}

export function ClientProviders({ children, gaId, clarityId }: ClientProvidersProps) {
  return (
    <ErrorBoundary>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange={false}
        storageKey="theme"
      >
        {children}
      </NextThemesProvider>

      <Analytics />

      {gaId && <GoogleAnalytics GA_MEASUREMENT_ID={gaId} />}
      
      {clarityId && <MicrosoftClarity clarityProjectId={clarityId} />}

      <SpeedInsights />
    </ErrorBoundary>
  );
}
