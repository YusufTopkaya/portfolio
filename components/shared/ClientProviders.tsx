"use client";

import dynamic from "next/dynamic";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useEffect, useState } from "react";
import { RetroBackground } from "@/components/retro/RetroBackground";
import { RetroBootEffect } from "@/components/retro/RetroBootEffect";
import { RetroCat } from "@/components/retro/RetroCat";
import { RetroStockComputer } from "@/components/retro/RetroStockComputer";
import { ContentProtection } from "@/components/shared/ContentProtection";
import ErrorBoundary from "@/components/shared/ErrorBoundary";

/* the whole game (~10k lines of engine/sprites/net + the trystero
   fallback) stays out of the initial bundle: its chunk downloads on the
   first START click (or a ?race=CODE share link) — never before. The
   first click lands while the chunk is still loading, so the gate holds
   it pending and re-dispatches once the component announces itself via
   "twingo:mounted" */
const TwingoRacerLazy = dynamic(
  () => import("@/components/retro/TwingoRacer").then((m) => m.TwingoRacer),
  { ssr: false },
);

function TwingoRacerGate() {
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    let mounted = false;
    let pending = false;
    const onStart = () => {
      if (mounted) return; // the game's own listener has it from here
      pending = true;
      setWanted(true);
    };
    const onMounted = () => {
      mounted = true;
      window.removeEventListener("twingo:start", onStart);
      if (pending) window.dispatchEvent(new Event("twingo:start"));
    };
    window.addEventListener("twingo:start", onStart);
    window.addEventListener("twingo:mounted", onMounted);
    // a share link boots the game straight into the room — the component's
    // own ?race= effect does the join once mounted, no re-dispatch needed
    if (new URLSearchParams(window.location.search).get("race"))
      setWanted(true);
    return () => {
      window.removeEventListener("twingo:start", onStart);
      window.removeEventListener("twingo:mounted", onMounted);
    };
  }, []);
  if (!wanted) return null;
  return <TwingoRacerLazy />;
}

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
        <RetroCat />
        <RetroBootEffect />
        <RetroStockComputer />
        <TwingoRacerGate />
      </NextThemesProvider>
    </ErrorBoundary>
  );
}
