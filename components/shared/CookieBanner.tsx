"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";

const CONSENT_KEY = "cookie-consent";
type ConsentValue = "accepted" | "declined";

interface CookieBannerProps {
  gtmId?: string;
  gaId?: string;
  clarityId?: string;
}

export function CookieBanner({ gtmId, gaId, clarityId }: CookieBannerProps) {
  const [consent, setConsent] = useState<ConsentValue | null>(null);
  const [show, setShow] = useState(false);
  const [lang, setLang] = useState("en");

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY) as ConsentValue | null;
    if (stored) {
      setConsent(stored);
    } else {
      setShow(true);
    }
    const pathLang = window.location.pathname.split("/")[1];
    if (pathLang && pathLang.length === 2) {
      setLang(pathLang);
    }
  }, []);

  // Initialize GTM dataLayer before the script loads
  useEffect(() => {
    if (consent === "accepted" && gtmId) {
      const w = window as typeof window & { dataLayer: unknown[] };
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
    }
  }, [consent, gtmId]);

  function accept() {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setConsent("accepted");
    setShow(false);
  }

  function decline() {
    localStorage.setItem(CONSENT_KEY, "declined");
    setConsent("declined");
    setShow(false);
  }

  const isProduction = process.env.NODE_ENV === "production";

  return (
    <>
      {consent === "accepted" && gtmId && (
        <Script
          id="gtm-consent"
          src={`https://www.googletagmanager.com/gtm.js?id=${gtmId}`}
          strategy="afterInteractive"
        />
      )}
      {consent === "accepted" && gaId && (
        <>
          <Script
            id="ga-consent"
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-config" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}
      {consent === "accepted" && clarityId && isProduction && (
        <Script
          id="clarity-consent"
          src={`https://www.clarity.ms/tag/${clarityId}`}
          strategy="afterInteractive"
        />
      )}

      {show && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-6">
          <div className="glass-bold border border-white/10 dark:border-white/5 rounded-none max-w-2xl mx-auto px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-lg">
            <p className="text-sm text-foreground/80 flex-1">
              This site uses cookies for analytics (Google Analytics, Microsoft
              Clarity).{" "}
              <Link
                href={`/${lang}/privacy`}
                className="text-primary hover:underline whitespace-nowrap"
              >
                Privacy Policy
              </Link>
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={decline}
                className="text-sm px-3 py-1.5 rounded-none text-muted-foreground hover:text-foreground transition-colors"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={accept}
                className="text-sm px-4 py-1.5 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
