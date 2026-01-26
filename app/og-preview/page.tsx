"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { LordIcon } from "@/components/shared/LordIcon";
import { languages } from "@/lib/i18n/config";
import radioIconData from "@/public/icons/wired-outline-1505-radio-walkie-talkie-hover-pinch.json";

interface PersonalInfo {
  name: string;
  position: string;
  about: string;
  company?: string;
  imageUrl: string;
  callsign?: string;
}

interface Profile {
  personalInfo: PersonalInfo;
}

// Copy button component
function CopyButton({
  text,
  label,
  variant = "default",
}: {
  text: string;
  label: string;
  variant?: "default" | "compact";
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className={`group inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-all ${
          copied
            ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50"
            : "glass-subtle text-muted-foreground hover:bg-accent/10 hover:text-foreground"
        }`}
        title={`Copy ${label}`}
      >
        <span className="truncate max-w-[150px]">{text}</span>
        {copied ? (
          <svg
            className="w-3 h-3 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="w-3 h-3 flex-shrink-0 opacity-50 group-hover:opacity-100"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-sm transition-all ${
        copied
          ? "bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/50"
          : "glass-subtle text-muted-foreground hover:bg-accent/10 hover:text-foreground"
      }`}
      title={`Copy ${label}`}
    >
      <span>{text}</span>
      {copied ? (
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4 flex-shrink-0 opacity-50 group-hover:opacity-100"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}

// Step card component
function StepCard({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  color: "emerald" | "blue" | "violet";
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold text-sm shadow-lg">
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-lg font-semibold mb-3 text-foreground">
            {title}
          </h4>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function OGPreviewPage() {
  const [selectedLang, setSelectedLang] = useState("en");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [bgColor, setBgColor] = useState("#0d1117");
  const [completedLangs, setCompletedLangs] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/og-profile?lang=${selectedLang}`)
      .then((res) => res.json())
      .then((data) => setProfile(data))
      .catch(() => {
        import(`@/content/${selectedLang}/profile.json`)
          .then((mod) => setProfile(mod.default))
          .catch(console.error);
      });
  }, [selectedLang]);

  const toggleLangComplete = (code: string) => {
    setCompletedLangs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <svg
            className="w-5 h-5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  const { name, position, about, company, imageUrl, callsign } =
    profile.personalInfo;
  const progress = (completedLangs.size / languages.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle background accent - Apple Liquid Glass style */}
      <div className="fixed inset-0 bg-gradient-to-b from-accent/5 to-transparent dark:from-accent/10 dark:to-transparent pointer-events-none" />

      {/* Header */}
      <div className="glass-bold border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-6">
            {/* Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-lg">
                <svg
                  className="w-5 h-5 text-accent-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">
                  OG Banner Generator
                </h1>
                <p className="text-xs text-muted-foreground">
                  Create social media preview images
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4 flex-1">
              {/* Language Select */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="lang-select"
                  className="text-sm text-muted-foreground"
                >
                  Language
                </label>
                <select
                  id="lang-select"
                  value={selectedLang}
                  onChange={(e) => setSelectedLang(e.target.value)}
                  className="glass-subtle text-foreground px-3 py-2 rounded-lg border border-border focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all text-sm"
                >
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.nativeName} ({lang.code.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Background Color */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="bg-color"
                  className="text-sm text-muted-foreground"
                >
                  Background
                </label>
                <div className="flex items-center gap-1">
                  <input
                    id="bg-color"
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-2 border-border"
                  />
                  <input
                    type="text"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="glass-subtle text-foreground text-xs font-mono px-2 py-1.5 rounded-lg border border-border w-20 focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                  />
                </div>
              </div>

              {/* Guide Lines Toggle */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <div
                  className={`w-10 h-6 rounded-full transition-colors ${showGuides ? "bg-accent" : "bg-muted"} relative`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-background shadow transition-all ${showGuides ? "left-5" : "left-1"}`}
                  />
                </div>
                <span className="text-sm text-muted-foreground group-hover:text-foreground">
                  Guides
                </span>
                <input
                  type="checkbox"
                  checked={showGuides}
                  onChange={(e) => setShowGuides(e.target.checked)}
                  className="sr-only"
                />
              </label>

              {/* Specs */}
              <div className="ml-auto text-xs text-muted-foreground font-mono">
                1200×630px • 65px padding
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* OG Banner Preview */}
        <div className="flex justify-center mb-8">
          <div
            className={`relative rounded-xl overflow-hidden shadow-2xl ${showGuides ? "ring-2 ring-rose-500/50 ring-offset-4 ring-offset-background" : "ring-1 ring-border"}`}
          >
            <div
              id="og-banner"
              style={{
                width: "1200px",
                height: "630px",
                padding: "0 65px",
                backgroundColor: bgColor,
              }}
              className="flex items-center"
            >
              <div className="grid grid-cols-2 gap-8 items-center w-full">
                <div className="space-y-5">
                  <h1 className="text-6xl font-bold text-white">{name}</h1>
                  {callsign && (
                    <div className="inline-flex items-center gap-2 text-lg text-slate-400 font-mono bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 border border-white/10">
                      <LordIcon
                        iconData={radioIconData}
                        size={24}
                        color="#94a3b8"
                        autoplay={false}
                        onHover={false}
                      />
                      {callsign}
                    </div>
                  )}
                  <h2 className="text-3xl font-semibold text-white">
                    {position}
                    {company && company.trim() !== "" && (
                      <span className="text-2xl text-slate-300">
                        {" "}
                        @{company}
                      </span>
                    )}
                  </h2>
                  <p className="text-xl text-slate-300 leading-relaxed">
                    {about}
                  </p>
                </div>
                <div className="flex justify-end">
                  {/* Profile image with glow effect - matches main header */}
                  <div className="relative">
                    <div className="absolute -inset-3 bg-blue-500/20 rounded-full blur-xl" />
                    <div className="relative w-[300px] h-[300px] rounded-full overflow-hidden bg-white/10 backdrop-blur-sm border border-white/20 shadow-xl">
                      <Image
                        src={imageUrl}
                        alt={`${name} - ${position}`}
                        fill
                        className="object-cover"
                        sizes="300px"
                        priority
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {showGuides && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-rose-500/40" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-rose-500/40" />
                <div className="absolute left-[65px] top-0 bottom-0 w-px bg-emerald-500/60" />
                <div className="absolute right-[65px] top-0 bottom-0 w-px bg-emerald-500/60" />
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-rose-500/80 text-white text-xs px-2 py-0.5 rounded">
                  center
                </div>
                <div className="absolute top-1/2 left-2 bg-emerald-500/80 text-white text-xs px-2 py-0.5 rounded">
                  safe
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-8 p-4 glass rounded-xl">
          <span className="text-sm text-muted-foreground">Quick copy:</span>
          <CopyButton text={`og-banner.${selectedLang}.png`} label="PNG" />
          <CopyButton text={`og-banner.${selectedLang}.webp`} label="WebP" />
          <CopyButton
            text={`public/images/og-banner.${selectedLang}.webp`}
            label="Full path"
          />
          <a
            href="https://squoosh.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors ring-1 ring-accent/30"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            squoosh.app
          </a>
        </div>

        {/* Instructions Grid */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <StepCard number={1} title="Take Screenshot (PNG)" color="emerald">
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground/50">1.</span>
                Select language & disable guides
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground/50">2.</span>
                DevTools → Select{" "}
                <CopyButton
                  text="#og-banner"
                  label="selector"
                  variant="compact"
                />
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground/50">3.</span>
                Right-click → Screenshot Node
              </li>
            </ol>
            <div className="mt-3 p-2 glass-subtle rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">⌨️ Shortcuts:</p>
              <div className="text-xs text-muted-foreground/70 space-y-0.5">
                <div>
                  <kbd className="bg-muted px-1 rounded">Ctrl+Shift+S</kbd>{" "}
                  Zen/Firefox
                </div>
                <div>
                  <kbd className="bg-muted px-1 rounded">Ctrl+Shift+P</kbd>{" "}
                  Chrome
                </div>
              </div>
            </div>
          </StepCard>

          <StepCard number={2} title="Convert to WebP" color="blue">
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground/50">1.</span>
                Open squoosh.app
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground/50">2.</span>
                Drop PNG, select WebP format
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground/50">3.</span>
                Quality: <strong className="text-accent">85-90</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground/50">4.</span>
                Target: <strong className="text-accent">&lt;100KB</strong>
              </li>
            </ol>
          </StepCard>

          <StepCard number={3} title="Add to Project" color="violet">
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground/50">1.</span>
                Rename to WebP filename
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground/50">2.</span>
                Copy to{" "}
                <code className="text-accent text-xs">/public/images/</code>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground/50">3.</span>
                Check off in progress tracker
              </li>
            </ol>
            <div className="mt-3 p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <p className="text-xs text-amber-400">
                💡 PNG → WebP keeps quality, reduces size
              </p>
            </div>
          </StepCard>
        </div>

        {/* Progress Tracker */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-foreground">
                Progress Tracker
              </h3>
              <span className="text-xs text-muted-foreground glass-subtle px-2 py-1 rounded-full">
                {completedLangs.size} / {languages.length} completed
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-sm font-mono text-muted-foreground">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {languages.map((lang) => {
                const isCompleted = completedLangs.has(lang.code);
                const isSelected = selectedLang === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => toggleLangComplete(lang.code)}
                    className={`group relative flex items-center gap-2 p-3 rounded-lg transition-all text-left ${
                      isCompleted
                        ? "bg-emerald-500/20 ring-1 ring-emerald-500/50"
                        : isSelected
                          ? "bg-accent/20 ring-1 ring-accent/50"
                          : "glass-subtle hover:bg-accent/10"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                        isCompleted
                          ? "bg-emerald-500 text-white"
                          : "bg-muted group-hover:bg-accent/20"
                      }`}
                    >
                      {isCompleted && (
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-medium truncate ${isCompleted ? "text-emerald-400" : "text-foreground"}`}
                      >
                        {lang.nativeName}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {lang.code.toUpperCase()}
                      </div>
                    </div>
                    {isSelected && !isCompleted && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-accent rounded-full animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
