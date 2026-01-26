"use client";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CVDownloadButton } from "@/components/shared/CVDownloadButton";
import { OptimizedImage } from "@/components/shared/OptimizedImage";
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
      {/* Subtle background accent - Apple Liquid Glass style */}
      <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent dark:from-accent/10 dark:to-transparent" />

      {/* Content */}
      <div className="relative container mx-auto px-4 md:px-6 py-8">
        {/* Top bar with glass effect */}
        <div className="flex justify-end items-center gap-3 mb-8">
          <div className="flex items-center gap-3 glass-subtle rounded-full px-2 py-1">
            <ThemeToggle />
            <div className="w-px h-6 bg-border" />
            <LanguageSwitcher />
          </div>
        </div>

        {/* Main content */}
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-5">
            <h1 className="text-4xl md:text-6xl font-bold text-foreground">
              {name}
            </h1>
            {callsign && (
              <div className="inline-flex items-center gap-2 text-lg md:text-xl text-muted-foreground font-mono glass-subtle rounded-full px-4 py-2">
                <RadioIcon color="currentColor" size={24} />
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
            {/* Profile image with glass border */}
            <div className="relative">
              <div className="absolute -inset-2 bg-accent/10 dark:bg-accent/20 rounded-full blur-xl" />
              <div className="relative w-[280px] h-[280px] md:w-[320px] md:h-[320px] rounded-full overflow-hidden glass border border-border">
                <OptimizedImage
                  src={imageUrl}
                  alt={`${name} - ${position} profile photo`}
                  fill
                  sizes="320px"
                  className="hover:scale-105 transition-transform duration-500"
                  priority
                  objectFit="cover"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
