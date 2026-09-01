import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogCopyLLM } from "@/components/blog/BlogCopyLLM";
import { BlogTableOfContents } from "@/components/blog/BlogTableOfContents";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import {
  getAllBlogSlugs,
  getAvailableLanguagesForSlug,
  getBlogPost,
  getBlogPostResult,
} from "@/lib/blog";
import { formatDate, languageCodes, languages } from "@/lib/i18n/config";
import { getProfileResult } from "@/lib/i18n/server-content-loader";
import { translations } from "@/lib/i18n/translations";
import { extractTocItems } from "@/lib/toc";
import profile from "@/content/en/profile.json";
import { BlogContent } from "./BlogContent";

interface PageProps {
  params: Promise<{ lang: string; slug: string }>;
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const authorName = profile.personalInfo.name;

export const dynamic = "force-static";
export const revalidate = false;

export async function generateStaticParams() {
  return languageCodes.flatMap((lang) => {
    const slugs = getAllBlogSlugs(lang);
    return slugs.map((slug) => ({ lang, slug }));
  });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang, slug } = await params;
  const post = getBlogPost(slug, lang);
  if (!post) return {};

  const canonicalLang = post.lang === "neutral" ? lang : post.lang;
  const canonicalUrl = `${siteUrl}/${canonicalLang}/blog/${slug}`;

  const availableLangs = getAvailableLanguagesForSlug(slug);
  const languageAlternates = Object.fromEntries(
    availableLangs.map((loc) => [loc, `${siteUrl}/${loc}/blog/${slug}`]),
  );

  return {
    title: `${post.title} - ${authorName}`,
    description: post.description,
    keywords: post.keywords,
    authors: [{ name: post.author || authorName }],
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ...languageAlternates,
        "x-default": `${siteUrl}/en/blog/${slug}`,
      },
    },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: canonicalUrl,
      siteName: authorName,
      publishedTime: post.date,
      modifiedTime: post.modifiedDate || post.date,
      authors: [post.author || authorName],
      images: post.imageUrl
        ? [
            {
              url: post.imageUrl.startsWith("http")
                ? post.imageUrl
                : `${siteUrl}${post.imageUrl}`,
              width: 1200,
              height: 630,
              alt: post.title,
            },
          ]
        : [],
      locale: lang,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: post.imageUrl
        ? [
            post.imageUrl.startsWith("http")
              ? post.imageUrl
              : `${siteUrl}${post.imageUrl}`,
          ]
        : [],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { lang, slug } = await params;
  const postResult = getBlogPostResult(slug, lang);

  if (!postResult.ok) {
    notFound();
  }

  const post = postResult.value;

  const profileResult = await getProfileResult(lang);
  if (!profileResult.ok) {
    notFound();
  }
  const profile = profileResult.value;
  const t = translations[lang];

  const availableLangs = getAvailableLanguagesForSlug(slug);
  const otherLangs = availableLangs.filter((l) => l !== lang);

  const canonicalLang = post.lang === "neutral" ? lang : post.lang;
  const canonicalUrl = `${siteUrl}/${canonicalLang}/blog/${slug}`;

  const tocItems = extractTocItems(post.content);

  const techCategories = [
    "Tutorial",
    "Guide",
    "How-To",
    "Technology",
    "Development",
    "AI",
  ];
  const articleType =
    post.category && techCategories.includes(post.category)
      ? "TechArticle"
      : "Article";

  // Build translation links between language versions
  const otherVersions = availableLangs.filter((l) => l !== lang);
  const translationRefs = otherVersions.map((l) => ({
    "@type": articleType,
    "@id": `${siteUrl}/${l}/blog/${slug}#article`,
    url: `${siteUrl}/${l}/blog/${slug}`,
    inLanguage: l,
  }));

  const isOriginal = lang === "en";

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": articleType,
    "@id": `${siteUrl}/${lang}/blog/${slug}#article`,
    headline: post.title,
    description: post.description,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    author: {
      "@type": "Person",
      "@id": `${siteUrl}/#person`,
      name: post.author || authorName,
      url: siteUrl,
    },
    datePublished: post.date,
    dateModified: post.modifiedDate || post.date,
    publisher: {
      "@type": "Person",
      "@id": `${siteUrl}/#person`,
      name: authorName,
      url: siteUrl,
    },
    ...(post.imageUrl && {
      image: {
        "@type": "ImageObject",
        url: post.imageUrl.startsWith("http")
          ? post.imageUrl
          : `${siteUrl}${post.imageUrl}`,
        width: 1200,
        height: 630,
      },
    }),
    ...(post.keywords &&
      post.keywords.length > 0 && {
        keywords: post.keywords.join(", "),
      }),
    ...(post.wordCount && { wordCount: post.wordCount }),
    ...(post.category && { articleSection: post.category }),
    inLanguage: lang,
    isPartOf: {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: authorName,
      url: siteUrl,
    },
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", "article > p:first-of-type"],
    },
    ...(isOriginal &&
      translationRefs.length > 0 && {
        workTranslation: translationRefs,
      }),
    ...(!isOriginal && {
      translationOfWork: {
        "@type": articleType,
        "@id": `${siteUrl}/en/blog/${slug}#article`,
        url: `${siteUrl}/en/blog/${slug}`,
        inLanguage: "en",
      },
    }),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${siteUrl}/${lang}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${siteUrl}/${lang}/blog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: canonicalUrl,
      },
    ],
  };

  const faqSchema =
    post.faq && post.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          speakable: {
            "@type": "SpeakableSpecification",
            cssSelector: [".faq-question"],
          },
          mainEntity: post.faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.a,
            },
          })),
        }
      : null;

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        profile={profile}
        translations={{ downloadCV: t.actions.downloadCV }}
        language={lang}
      />
      <main className="container mx-auto px-4 py-12 max-w-3xl flex-1">
        <Link
          href={`/${lang}/blog`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          &larr; Back to Blog
        </Link>

        {post.imageUrl && (
          <div className="rounded-none overflow-hidden mb-8">
            <Image
              src={post.imageUrl}
              alt={post.title}
              fill
              className="!relative !w-full !h-auto"
              sizes="(max-width: 768px) 100vw, 768px"
              priority
            />
          </div>
        )}

        {otherLangs.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6 p-3 rounded-none border border-border bg-muted/30">
            <span>🌐</span>
            <span>
              {otherLangs.map((l, i) => {
                const langInfo = languages.find((lg) => lg.code === l);
                return (
                  <span key={l}>
                    {i > 0 && ", "}
                    <Link
                      href={`/${l}/blog/${slug}`}
                      className="font-medium text-primary hover:underline"
                      hrefLang={l}
                    >
                      {langInfo?.nativeName ?? l}
                    </Link>
                  </span>
                );
              })}
            </span>
          </div>
        )}

        <header className="mb-8">
          <div className="flex items-center gap-3 flex-wrap">
            <time
              dateTime={post.date}
              className="text-sm text-muted-foreground"
            >
              {formatDate(post.date, lang)}
            </time>
            {post.readingTime && (
              <span className="text-sm text-muted-foreground">
                · {post.readingTime} {t.sections.blog.minRead}
              </span>
            )}
            <BlogCopyLLM
              title={post.title}
              author={post.author || authorName}
              publishDate={post.date}
              slug={slug}
              lang={lang}
              content={post.content}
            />
          </div>
          <h1 className="mt-2 text-3xl font-bold leading-tight">
            {post.title}
          </h1>
          <p className="mt-3 text-muted-foreground">{post.description}</p>
          {post.mediumUrl && (
            <div className="mt-4">
              <a
                href={post.mediumUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Originally published on Medium &rarr;
              </a>
            </div>
          )}
        </header>

        <BlogTableOfContents
          items={tocItems}
          title={t.sections.blog.tableOfContents}
        />
        <BlogContent content={post.content} lang={lang} />
      </main>
      <Footer
        profile={profile}
        lang={lang}
        translations={{ allRightsReserved: t.footer.allRightsReserved }}
      />

      {/* Security: static build-time JSON escaped by JSON.stringify, no user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
    </div>
  );
}
