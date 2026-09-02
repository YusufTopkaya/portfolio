"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { RetroBackground } from "@/components/retro/RetroBackground";
import { RetroBootEffect } from "@/components/retro/RetroBootEffect";
import { RetroStockComputer } from "@/components/retro/RetroStockComputer";
import { ContentProtection } from "@/components/shared/ContentProtection";
import ErrorBoundary from "@/components/shared/ErrorBoundary";

interface ClientProvidersProps {
  children: React.ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
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
        <ContentProtection />
        <RetroBackground />
        <RetroBootEffect />
        <RetroStockComputer />
      </NextThemesProvider>
    </ErrorBoundary>
  );
}
