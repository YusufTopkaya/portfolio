"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/toc";

interface BlogTableOfContentsProps {
  items: TocItem[];
  title?: string;
}

export function BlogTableOfContents({
  items,
  title = "In this article",
}: BlogTableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const headings = document.querySelectorAll("h2[id]");
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActiveId(visible.target.id);
      },
      {
        rootMargin: "-80px 0px -70% 0px",
        threshold: 0,
      },
    );

    for (const h of headings) observer.observe(h);
    return () => observer.disconnect();
  }, []);

  if (items.length < 3) return null;

  return (
    <nav
      aria-label="Table of contents"
      className="mb-10 rounded-none bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-5"
    >
      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
        {title}
      </p>
      {/* biome-ignore lint/a11y/noRedundantRoles: role="list" needed for VoiceOver/Safari when list-style:none is applied */}
      {/* biome-ignore lint/a11y/useSemanticElements: same reason - restores list semantics stripped by list-none */}
      <ol role="list" className="space-y-1.5 list-none m-0 p-0">
        {items.map((item) => (
          <li key={item.id} className="m-0">
            <a
              href={`#${item.id}`}
              aria-current={activeId === item.id ? "true" : undefined}
              className={`text-sm transition-colors no-underline flex items-start gap-2 ${
                activeId === item.id
                  ? "text-primary"
                  : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <span className="shrink-0 w-1 h-1 rounded-none bg-zinc-300 dark:bg-zinc-600 mt-2" />
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
