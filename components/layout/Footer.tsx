"use client";

import { trackExternalLink } from "@/lib/analytics";
import type { Profile } from "@/lib/i18n/content-loader";

interface FooterProps {
  profile: Profile;
  translations: {
    allRightsReserved: string;
  };
}

export function Footer({ profile, translations }: FooterProps) {
  const handleSocialClick = (linkName: string, url: string) => {
    // Fire-and-forget analytics tracking for external social links
    try {
      trackExternalLink(url, `Social: ${linkName}`);
    } catch (e) {
      // Silently ignore tracking errors so they don't affect UX
      console.warn("Analytics tracking failed for social link:", url, e);
    }
  };

  return (
    <footer className="relative mt-16">
      {/* Glass footer container */}
      <div className="glass-bold border-t border-white/10 dark:border-white/5">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            {/* Social links with glass pills */}
            <div className="flex gap-3 flex-wrap justify-center">
              {profile.socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-subtle rounded-full px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-primary/10 transition-all duration-300"
                  onClick={() => handleSocialClick(link.name, link.url)}
                >
                  {link.name}
                </a>
              ))}
            </div>
            {/* Copyright */}
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} {profile.personalInfo.name}.{" "}
              {translations.allRightsReserved}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
