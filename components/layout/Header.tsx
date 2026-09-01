"use client";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { GlitchImage } from "@/components/retro/GlitchImage";
import { TypewriterText } from "@/components/retro/TypewriterText";
import { CVDownloadButton } from "@/components/shared/CVDownloadButton";
import { NoSSR } from "@/components/shared/NoSSR";
import { RadioIcon } from "@/components/shared/RadioIcon";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import type { Profile } from "@/lib/i18n/content-loader";

interface HeaderProps {
  profile: Profile;
  translations: {
    downloadCV: string;
  };
  language?: string;
}

export function Header({
  profile: profileData,
  translations,
  language,
}: HeaderProps) {
  const { name, position, about, company, cv, imageUrl, callsign } =
    profileData.personalInfo;

  return (
    <header className="relative overflow-hidden bg-background">
      {/* Subtle background accent */}
      <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent dark:from-accent/10 dark:to-transparent" />

      {/* Content */}
      <div className="relative container mx-auto px-4 md:px-6 py-4 md:py-8">
        {/* Top bar: compact retro panel, square pixel corners */}
        <div className="flex justify-end items-center gap-2 mb-6 md:mb-8">
          <div className="flex items-center gap-1 glass-subtle px-1.5 py-1">
            <ThemeToggle />
            <div className="w-0.5 h-5 bg-border" />
            <LanguageSwitcher />
          </div>
        </div>

        {/* Main content */}
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-5">
            <h1 className="text-4xl md:text-6xl font-bold text-foreground">
              <NoSSR fallback={name}>
                <TypewriterText text={name} speed={90} />
              </NoSSR>
            </h1>
            {callsign && (
              <div className="inline-flex items-center gap-2 text-lg md:text-xl text-muted-foreground font-mono glass-subtle px-4 py-2">
                <RadioIcon size={24} />
                {callsign}
              </div>
            )}
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground">
              {position}
              {company && company.trim() !== "" && (
                <span className="text-xl md:text-2xl text-muted-foreground">
                  {" "}
                  @{company}
                </span>
              )}
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              {about}
            </p>
            {cv?.url && cv?.fileName && (
              <CVDownloadButton
                url={cv.url}
                fileName={cv.fileName}
                label={translations.downloadCV}
                language={language}
                className="mt-4"
              />
            )}
          </div>
          <div className="flex justify-center">
            {/* Profile photo in a solid retro frame; hover distorts it like
                a magnet held near a CRT screen */}
            <div className="relative">
              <div className="relative w-[280px] h-[280px] md:w-[320px] md:h-[320px] overflow-hidden glass">
                <GlitchImage
                  src={imageUrl}
                  alt={`${name} - ${position} profile photo`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
