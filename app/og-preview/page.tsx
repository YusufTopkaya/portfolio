"use client";

import { useEffect, useState } from "react";
import { languages } from "@/lib/i18n/config";

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
            : "bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:text-white"
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
          : "bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white ring-1 ring-slate-700 hover:ring-slate-600"
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
  color,
  children,
}: {
  number: number;
  title: string;
  color: "emerald" | "blue" | "violet";
  children: React.ReactNode;
}) {
  const colors = {
    emerald:
      "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400",
    blue: "from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-400",
    violet:
      "from-violet-500/20 to-violet-500/5 border-violet-500/30 text-violet-400",
  };

  const numberColors = {
    emerald: "bg-emerald-500 text-white",
    blue: "bg-blue-500 text-white",
    violet: "bg-violet-500 text-white",
  };

  return (
    <div
      className={`relative bg-gradient-to-br ${colors[color]} border rounded-xl p-5 backdrop-blur-sm`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex-shrink-0 w-8 h-8 ${numberColors[color]} rounded-full flex items-center justify-center font-bold text-sm shadow-lg`}
        >
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <h4
            className={`text-lg font-semibold mb-3 ${colors[color].split(" ").pop()}`}
          >
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
  const [bgColor, setBgColor] = useState("#0f172a");
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="flex items-center gap-3 text-slate-400">
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-6">
            {/* Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <svg
                  className="w-5 h-5 text-white"
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
                <h1 className="text-lg font-bold text-white">
                  OG Banner Generator
                </h1>
                <p className="text-xs text-slate-400">
                  Create social media preview images
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4 flex-1">
              {/* Language Select */}
              <div className="flex items-center gap-2">
                <label htmlFor="lang-select" className="text-sm text-slate-400">
                  Language
                </label>
                <select
                  id="lang-select"
                  value={selectedLang}
                  onChange={(e) => setSelectedLang(e.target.value)}
                  className="bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm"
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
                <label htmlFor="bg-color" className="text-sm text-slate-400">
                  Background
                </label>
                <div className="flex items-center gap-1">
                  <input
                    id="bg-color"
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-2 border-slate-700"
                  />
                  <input
                    type="text"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="bg-slate-800 text-white text-xs font-mono px-2 py-1.5 rounded-lg border border-slate-700 w-20 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                    aria-label="Background color hex value"
                  />
                </div>
              </div>

              {/* Guide Lines Toggle */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <div
                  className={`w-10 h-6 rounded-full transition-colors ${showGuides ? "bg-violet-500" : "bg-slate-700"} relative`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${showGuides ? "left-5" : "left-1"}`}
                  />
                </div>
                <span className="text-sm text-slate-400 group-hover:text-slate-300">
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
              <div className="ml-auto text-xs text-slate-500 font-mono">
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
            className={`relative rounded-xl overflow-hidden shadow-2xl ${showGuides ? "ring-2 ring-rose-500/50 ring-offset-4 ring-offset-slate-900" : "ring-1 ring-slate-700"}`}
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
                <div className="space-y-4">
                  <h1 className="text-6xl font-bold text-white">{name}</h1>
                  {callsign && (
                    <div className="flex items-center gap-2 text-xl text-slate-400 font-mono">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
                        <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
                        <circle cx="12" cy="12" r="2" />
                        <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
                        <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
                      </svg>
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
                  <div className="relative w-[300px] h-[300px] rounded-full overflow-hidden border-4 border-slate-700/50 shadow-xl">
                    {/* biome-ignore lint/performance/noImgElement: Using native img for screenshot tool, not for web display */}
                    <img
                      src={imageUrl}
                      alt={`${name} - ${position}`}
                      className="w-full h-full object-cover"
                    />
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
        <div className="flex flex-wrap items-center justify-center gap-3 mb-8 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
          <span className="text-sm text-slate-400">Quick copy:</span>
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors ring-1 ring-blue-500/30"
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
            <ol className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-slate-500">1.</span>
                Select language & disable guides
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-500">2.</span>
                DevTools → Select{" "}
                <CopyButton
                  text="#og-banner"
                  label="selector"
                  variant="compact"
                />
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-500">3.</span>
                Right-click → Screenshot Node
              </li>
            </ol>
            <div className="mt-3 p-2 bg-slate-900/50 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">⌨️ Shortcuts:</p>
              <div className="text-xs text-slate-500 space-y-0.5">
                <div>
                  <kbd className="bg-slate-700 px-1 rounded">Ctrl+Shift+S</kbd>{" "}
                  Zen/Firefox
                </div>
                <div>
                  <kbd className="bg-slate-700 px-1 rounded">Ctrl+Shift+P</kbd>{" "}
                  Chrome
                </div>
              </div>
            </div>
          </StepCard>

          <StepCard number={2} title="Convert to WebP" color="blue">
            <ol className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-slate-500">1.</span>
                Open squoosh.app
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-500">2.</span>
                Drop PNG, select WebP format
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-500">3.</span>
                Quality: <strong className="text-blue-400">85-90</strong>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-500">4.</span>
                Target: <strong className="text-blue-400">&lt;100KB</strong>
              </li>
            </ol>
          </StepCard>

          <StepCard number={3} title="Add to Project" color="violet">
            <ol className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-slate-500">1.</span>
                Rename to WebP filename
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-500">2.</span>
                Copy to{" "}
                <code className="text-violet-400 text-xs">/public/images/</code>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-500">3.</span>
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
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-white">Progress Tracker</h3>
              <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full">
                {completedLangs.size} / {languages.length} completed
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-sm font-mono text-slate-400">
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
                          ? "bg-violet-500/20 ring-1 ring-violet-500/50"
                          : "bg-slate-800/50 hover:bg-slate-700/50 ring-1 ring-slate-700/50"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                        isCompleted
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-700 group-hover:bg-slate-600"
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
                        className={`text-sm font-medium truncate ${isCompleted ? "text-emerald-400" : "text-slate-300"}`}
                      >
                        {lang.nativeName}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {lang.code.toUpperCase()}
                      </div>
                    </div>
                    {isSelected && !isCompleted && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-violet-500 rounded-full animate-pulse" />
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
