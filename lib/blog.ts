import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { Err } from "tsentials/errors";
import { Result } from "tsentials/result";
import profile from "@/content/en/profile.json";

const defaultAuthor = profile.personalInfo.name;

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  mediumUrl: string;
  imageUrl: string;
  content: string;
  lang: string;
  keywords?: string[];
  author?: string;
  modifiedDate?: string;
  category?: string;
  faq?: { q: string; a: string }[];
  readingTime?: number;
  wordCount?: number;
}

export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  mediumUrl: string;
  imageUrl: string;
  lang: string;
  keywords?: string[];
  author?: string;
  modifiedDate?: string;
  category?: string;
  faq?: { q: string; a: string }[];
  readingTime?: number;
  wordCount?: number;
}

const BLOG_DIR = path.join(process.cwd(), "content/blog");
const DEFAULT_LANG = "en";

function getBlogDirForLang(lang: string): string {
  return path.join(BLOG_DIR, lang);
}

// Get all slugs that have content for a given language (including English fallback)
export function getAllBlogSlugs(_lang?: string): string[] {
  const enDir = getBlogDirForLang(DEFAULT_LANG);

  if (!fs.existsSync(enDir)) return [];

  // English is the canonical source of all slugs
  const enSlugs = fs
    .readdirSync(enDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(".md", ""));

  return enSlugs;
}

// Read a single blog markdown file as a Result — a missing/unreadable file
// becomes a structured AppError instead of a swallowed exception.
function readBlogFile(slug: string, lang: string): Result<BlogPost> {
  return Result.try(
    (): BlogPost => {
      const filePath = path.join(getBlogDirForLang(lang), `${slug}.md`);
      const rawContent = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(rawContent);
      const wordCount = content.split(/\s+/).length;
      const readingTime = Math.ceil(wordCount / 200);
      return {
        ...(data as Omit<BlogPostMeta, "lang" | "slug">),
        content,
        slug,
        lang,
        keywords: (data.keywords as string[]) ?? [],
        author: (data.author as string) ?? defaultAuthor,
        modifiedDate: data.modifiedDate as string | undefined,
        category: (data.category as string) ?? "Technology",
        faq: (data.faq as { q: string; a: string }[]) ?? [],
        wordCount,
        readingTime,
      };
    },
    () =>
      Err.notFound("Blog.NotFound", `Post '${slug}' not found in '${lang}'`),
  );
}

// Read a blog post for a given language, falling back to English.
// The lang -> en fallback uses Result.compensate so the English file is only
// read when the requested language fails — matching the original lazy
// short-circuit (no extra read on the happy path).
export function getBlogPostResult(
  slug: string,
  lang?: string,
): Result<BlogPost> {
  const effectiveLang = lang || DEFAULT_LANG;
  if (effectiveLang === DEFAULT_LANG) {
    return readBlogFile(slug, DEFAULT_LANG);
  }

  return Result.compensate(readBlogFile(slug, effectiveLang), () =>
    readBlogFile(slug, DEFAULT_LANG),
  );
}

// Backward-compatible wrapper — keeps the BlogPost | null contract for existing
// consumers while delegating to the Result-based pipeline underneath.
export function getBlogPost(slug: string, lang?: string): BlogPost | null {
  return Result.match(
    getBlogPostResult(slug, lang),
    (post) => post,
    () => null,
  );
}

// Resolve the canonical URL for a blog post, using the actual language the file exists in
export function resolveCanonicalBlogUrl(slug: string, lang: string): string {
  const candidates =
    lang === DEFAULT_LANG ? [DEFAULT_LANG] : [lang, DEFAULT_LANG];
  for (const l of candidates) {
    if (fs.existsSync(path.join(getBlogDirForLang(l), `${slug}.md`))) {
      return `/${l}/blog/${slug}`;
    }
  }
  return `/${DEFAULT_LANG}/blog/${slug}`;
}

// Returns language codes that have an actual markdown file for this slug
export function getAvailableLanguagesForSlug(slug: string): string[] {
  try {
    const entries = fs.readdirSync(BLOG_DIR, { withFileTypes: true });
    const langDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    return langDirs.filter((lang) =>
      fs.existsSync(path.join(BLOG_DIR, lang, `${slug}.md`)),
    );
  } catch {
    return [DEFAULT_LANG];
  }
}

// Get all blog posts for a given language (with English fallback)
export function getAllBlogPosts(lang?: string): BlogPostMeta[] {
  const effectiveLang = lang || DEFAULT_LANG;
  const slugs = getAllBlogSlugs(effectiveLang);

  const posts = slugs
    .map((slug) => getBlogPost(slug, effectiveLang))
    .filter((post): post is BlogPost => post !== null)
    .map(({ content: _, ...meta }): BlogPostMeta => meta);

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}
