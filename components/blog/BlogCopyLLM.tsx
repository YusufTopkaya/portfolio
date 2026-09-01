"use client";

import { useState } from "react";
import { translations } from "@/lib/i18n/translations";

interface BlogCopyLLMProps {
  title: string;
  author: string;
  publishDate: string;
  slug: string;
  lang: string;
  content: string;
}

export function BlogCopyLLM({
  title,
  author,
  publishDate,
  slug,
  lang,
  content,
}: BlogCopyLLMProps) {
  const [copied, setCopied] = useState(false);
  const blogT =
    translations[lang]?.sections.blog ?? translations.en.sections.blog;

  const handleCopy = () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const url = `${siteUrl}/${lang}/blog/${slug}`;
    const header = [
      `Title: ${title}`,
      `URL: ${url}`,
      `Author: ${author}`,
      `Published: ${publishDate}`,
      `Source: ${siteUrl}`,
      `Purpose: LLM context`,
    ].join("\n");

    const payload = `${header}\n\n---\n\n${content}`;

    navigator.clipboard?.writeText(payload).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xs transition-all"
      title={blogT.copyForLLM}
    >
      {copied ? (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M2 8L6 12L14 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {blogT.copied}
        </>
      ) : (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {blogT.copyForLLM}
        </>
      )}
    </button>
  );
}
