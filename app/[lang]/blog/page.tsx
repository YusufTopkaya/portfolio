import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { resolveCanonicalBlogUrl } from "@/lib/blog";
import { formatDate, languageCodes } from "@/lib/i18n/config";
import { getProfile } from "@/lib/i18n/server-content-loader";
import { translations } from "@/lib/i18n/translations";
import profile from "@/content/en/profile.json";

interface PageProps {
  params: Promise<{ lang: string }>;
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const authorName = profile.personalInfo.name;

export const dynamic = "force-static";
export const revalidate = false;

export function generateStaticParams() {
  return languageCodes.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const t = translations[lang];

  const languageAlternates = Object.fromEntries(
    languageCodes.map((loc) => [loc, `${siteUrl}/${loc}/blog`]),
  );

  return {
    title: `${t.sections.blog.title} - ${authorName}`,
    description: t.sections.blog.description,
    alternates: {
      canonical: `${siteUrl}/${lang}/blog`,
      languages: {
        ...languageAlternates,
        "x-default": `${siteUrl}/en/blog`,
      },
    },
    openGraph: {
      type: "website",
      title: `${t.sections.blog.title} - ${authorName}`,
      description: t.sections.blog.description,
      url: `${siteUrl}/${lang}/blog`,
      siteName: authorName,
      locale: lang,
    },
    twitter: {
      card: "summary_large_image",
      title: `${t.sections.blog.title} - ${authorName}`,
      description: t.sections.blog.description,
      
    },
  };
}

export default async function BlogPage({ params }: PageProps) {
  const { lang } = await params;
  const profile = await getProfile(lang);
  const t = translations[lang];
  const posts = profile.blogPosts ?? [];

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        profile={profile}
        translations={{ downloadCV: t.actions.downloadCV }}
        language={lang}
      />
      <main className="container mx-auto px-4 py-12 flex-1">
        <Link
          href={`/${lang}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          &larr; Home
        </Link>
        <div className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            {t.sections.blog.title}
          </h1>
          {t.sections.blog.description && (
            <p className="text-muted-foreground text-lg">
              {t.sections.blog.description}
            </p>
          )}
        </div>

        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, index) => {
            const internalUrl = post.slug
              ? resolveCanonicalBlogUrl(post.slug, lang)
              : null;
            const href = internalUrl ?? post.blogUrl ?? null;

            return (
              <article
                key={index}
                className="group rounded-none border border-border bg-card overflow-hidden shadow-glass-sm hover:shadow-glass transition-shadow duration-300"
              >
                {post.imageUrl && (
                  <div className="relative w-full h-48 overflow-hidden">
                    <Image
                      src={post.imageUrl}
                      alt={post.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                  </div>
                )}
                <div className="p-6">
                  <time className="text-sm text-muted-foreground">
                    {formatDate(post.date, lang)}
                  </time>
                  <h2 className="mt-2 text-xl font-semibold leading-tight mb-2 group-hover:text-primary transition-colors">
                    {internalUrl ? (
                      <Link href={internalUrl}>{post.title}</Link>
                    ) : post.blogUrl ? (
                      <a
                        href={post.blogUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {post.title}
                      </a>
                    ) : (
                      post.title
                    )}
                  </h2>
                  <p className="text-muted-foreground text-sm line-clamp-3 mb-4">
                    {post.description}
                  </p>
                  {href && (
                    <div className="flex items-center">
                      {internalUrl ? (
                        <Link
                          href={internalUrl}
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                          {t.sections.blog.readMore}
                        </Link>
                      ) : (
                        <a
                          href={post.blogUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                          {t.sections.blog.readMore}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>
      <Footer
        profile={profile}
        lang={lang}
        translations={{ allRightsReserved: t.footer.allRightsReserved }}
      />
    </div>
  );
}
