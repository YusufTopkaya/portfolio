"use client";

import {
  Children,
  createContext,
  isValidElement,
  use,
  useCallback,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import docker from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import { translations } from "@/lib/i18n/translations";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("csharp", csharp);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("docker", docker);
SyntaxHighlighter.registerLanguage("dockerfile", docker);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);

// Context to reliably detect block code (code inside pre) vs inline code
const IsBlockCodeContext = createContext(false);

type BlogT = typeof translations.en.sections.blog;
const BlogTranslationsContext = createContext<BlogT>(
  translations.en.sections.blog,
);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, "")
    .replaceAll(/[\s_]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function extractText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children
      .map((child) => {
        if (typeof child === "string") return child;
        if (
          child !== null &&
          typeof child === "object" &&
          "props" in child &&
          child.props !== null &&
          typeof child.props === "object" &&
          "children" in child.props
        ) {
          return extractText(
            (child.props as { children: React.ReactNode }).children,
          );
        }
        return "";
      })
      .join("");
  }
  return "";
}

interface HeadingProps {
  level: 1 | 2 | 3 | 4;
  children?: React.ReactNode;
}

function HeadingWithAnchor({ level, children }: HeadingProps) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
  const text = extractText(children);
  const id = slugify(text);
  const [copied, setCopied] = useState(false);
  const blogT = use(BlogTranslationsContext);

  const handleCopy = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    window.location.hash = id;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [id]);

  return (
    <Tag id={id} className="group relative scroll-mt-20">
      {children}
      <span className="relative inline-flex items-center align-middle ml-2">
        <button
          type="button"
          onClick={handleCopy}
          aria-label={blogT.copyLink}
          className="inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>
        {copied && (
          <span className="absolute left-6 top-1/2 -translate-y-1/2 bg-foreground text-background text-xs font-medium px-2 py-1 rounded-none whitespace-nowrap pointer-events-none z-10">
            {blogT.copied}
          </span>
        )}
      </span>
    </Tag>
  );
}

function isMarkdownTable(content: string): boolean {
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return false;
  const tableLines = lines.filter(
    (line) => line.trim().startsWith("|") && line.trim().includes("|"),
  );
  return tableLines.length >= Math.ceil(lines.length * 0.7);
}

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

function parseMarkdownTable(content: string): ParsedTable {
  const lines = content
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const headers: string[] = [];
  const rows: string[][] = [];

  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (/^\|[\s\-:]+\|/.test(line)) continue;

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (headers.length === 0) {
      headers.push(...cells);
    } else {
      rows.push(cells);
    }
  }

  return { headers, rows };
}

function MarkdownTable({ content }: { content: string }) {
  const { headers, rows } = parseMarkdownTable(content);

  return (
    <div className="not-prose my-6 max-w-full overflow-x-auto rounded-none border border-zinc-200 dark:border-zinc-700">
      <table className="w-full text-sm text-left border-collapse min-w-[500px]">
        <thead>
          <tr className="bg-zinc-100 dark:bg-zinc-800">
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-200 whitespace-nowrap border-b border-zinc-200 dark:border-zinc-700"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={
                rowIdx % 2 === 0
                  ? "bg-white dark:bg-zinc-900"
                  : "bg-zinc-50 dark:bg-zinc-800/50"
              }
            >
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300 border-b border-zinc-100 dark:border-zinc-800 font-mono"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const blogT = use(BlogTranslationsContext);

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={blogT.copyCode}
      className="absolute bottom-2 right-2 flex items-center justify-center size-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity rounded-none text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 z-10"
    >
      {copied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </button>
  );
}

interface BlockCodeProps {
  children: React.ReactNode;
  className?: string;
}

function BlockCode({ children, className }: BlockCodeProps) {
  const content =
    typeof children === "string" ? children : String(children ?? "");

  if (!className && isMarkdownTable(content)) {
    return <MarkdownTable content={content} />;
  }

  const language = className?.replace("language-", "") ?? "";

  if (language && language !== "text") {
    return (
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: "1rem 1.25rem",
          background: "transparent",
          fontSize: "0.875rem",
          lineHeight: "1.625",
        }}
        codeTagProps={{
          style: { fontFamily: "var(--font-mono, ui-monospace, monospace)" },
        }}
      >
        {content.replace(/\n$/, "")}
      </SyntaxHighlighter>
    );
  }

  return (
    <code className="block min-w-max px-5 py-4 text-sm text-zinc-300 font-mono leading-relaxed whitespace-pre">
      {children}
    </code>
  );
}

interface CodeProps {
  children?: React.ReactNode;
  className?: string;
}

function Code({ children, className }: CodeProps) {
  const isBlock = use(IsBlockCodeContext);
  if (!isBlock) {
    return (
      <code className="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded text-[0.875em] font-mono">
        {children}
      </code>
    );
  }
  return <BlockCode className={className}>{children}</BlockCode>;
}

function BlogImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <span className="block my-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full rounded-none border border-zinc-200 dark:border-zinc-700"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

interface BlogContentProps {
  content: string;
  lang: string;
}

export function BlogContent({ content, lang }: BlogContentProps) {
  const blogT =
    translations[lang]?.sections.blog ?? translations.en.sections.blog;
  return (
    <BlogTranslationsContext.Provider value={blogT}>
      <article className="prose prose-neutral dark:prose-invert max-w-none min-w-0 overflow-x-hidden">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <HeadingWithAnchor level={1}>{children}</HeadingWithAnchor>
            ),
            h2: ({ children }) => (
              <HeadingWithAnchor level={2}>{children}</HeadingWithAnchor>
            ),
            h3: ({ children }) => (
              <HeadingWithAnchor level={3}>{children}</HeadingWithAnchor>
            ),
            h4: ({ children }) => (
              <HeadingWithAnchor level={4}>{children}</HeadingWithAnchor>
            ),
            pre: ({ children }) => {
              let codeContent = "";
              let codeClassName = "";
              Children.forEach(children, (child) => {
                if (isValidElement(child)) {
                  const props = child.props as {
                    children?: React.ReactNode;
                    className?: string;
                  };
                  codeContent =
                    typeof props.children === "string"
                      ? props.children
                      : codeContent;
                  codeClassName = props.className || "";
                }
              });

              const isTable = !codeClassName && isMarkdownTable(codeContent);

              if (isTable) {
                return (
                  <IsBlockCodeContext.Provider value={true}>
                    {children}
                  </IsBlockCodeContext.Provider>
                );
              }

              const langMatch = /language-(\w+)/.exec(codeClassName);
              const language = langMatch ? langMatch[1] : null;

              return (
                <IsBlockCodeContext.Provider value={true}>
                  <section
                    className="not-prose my-6 group relative rounded-none border border-zinc-800 dark:border-zinc-700 bg-zinc-950 dark:bg-zinc-900 overflow-x-auto"
                    aria-label={
                      language ? `${language} code block` : "code block"
                    }
                  >
                    <CopyButton content={codeContent} />
                    <pre className="m-0 border-0 bg-transparent">
                      {children}
                    </pre>
                  </section>
                </IsBlockCodeContext.Provider>
              );
            },
            code: Code,
            a: ({ href, children, ...props }) => {
              const isExternal =
                href?.startsWith("http") || href?.startsWith("//");
              return (
                <a
                  href={href}
                  {...(isExternal && {
                    target: "_blank",
                    rel: "noopener noreferrer",
                  })}
                  className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
                  {...props}
                >
                  {children}
                </a>
              );
            },
            img: ({ src, alt }) => {
              if (!src || typeof src !== "string") return null;
              return <BlogImage src={src} alt={alt ?? ""} />;
            },
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-primary/50 pl-4 my-6 italic text-muted-foreground">
                {children}
              </blockquote>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-outside ml-6 my-4 space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-outside ml-6 my-4 space-y-1">
                {children}
              </ol>
            ),
            table: ({ children }) => (
              <div className="not-prose my-6 overflow-x-auto rounded-none border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-sm text-left border-collapse min-w-[500px]">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => <thead>{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children, ...props }) => {
              const isHeader =
                (props as { node?: { parentNode?: { tagName?: string } } }).node
                  ?.parentNode?.tagName === "thead";
              return (
                <tr
                  className={
                    isHeader
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : "even:bg-white dark:even:bg-zinc-900 odd:bg-zinc-50 dark:odd:bg-zinc-800/50"
                  }
                >
                  {children}
                </tr>
              );
            },
            th: ({ children }) => (
              <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-200 whitespace-nowrap border-b border-zinc-200 dark:border-zinc-700">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300 border-b border-zinc-100 dark:border-zinc-800 font-mono">
                {children}
              </td>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed">{children}</li>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </BlogTranslationsContext.Provider>
  );
}
