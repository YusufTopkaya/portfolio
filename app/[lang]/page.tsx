import { getProfile, getSEOMetadata } from "@/lib/i18n/server-content-loader";
import { translations } from "@/lib/i18n/translations";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Projects } from "@/components/sections/Projects";
import { Blog } from "@/components/sections/Blog";
import { Skills } from "@/components/sections/Skills";
import { Certificates } from "@/components/sections/Certificates";
import { Metadata } from "next";
import { languageCodes } from "@/lib/i18n/config";

interface PageProps {
  params: Promise<{
    lang: string;
  }>;
}

// Force static page generation
export const dynamic = "force-static";
export const revalidate = false;

// Generate static pages for all supported languages
export function generateStaticParams() {
  return languageCodes.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const metadata = await getSEOMetadata(lang);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    ...metadata,
    metadataBase: new URL(siteUrl),
    openGraph: {
      ...metadata.openGraph,
      url: `${siteUrl}/${lang}`,
      locale: lang,
    },
  };
}

export default async function Home({ params }: PageProps) {
  const { lang } = await params;
  const profile = await getProfile(lang);
  const t = translations[lang];

  const hasBlogPosts = profile.blogPosts && profile.blogPosts.length > 0;
  const hasProjects = profile.projects && profile.projects.length > 0;
  const hasSkills =
    profile.skills &&
    Array.isArray(profile.skills) &&
    profile.skills.length > 0;
  const hasCertificates =
    profile.certificates && profile.certificates.length > 0;

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        profile={profile}
        translations={{
          downloadCV: t.actions.downloadCV,
        }}
      />
      <main className="container mx-auto px-4 py-8">
        {hasBlogPosts && (
          <Blog
            profile={profile}
            translations={{
              title: t.sections.blog.title,
              description: t.sections.blog.description || "",
              readMore: t.sections.blog.readMore,
            }}
          />
        )}
        {hasProjects && profile.projects && (
          <Projects
            projects={profile.projects}
            translations={{
              title: t.sections.projects.title,
              tags: t.sections.projects.tags,
              viewProject: t.sections.projects.viewProject,
            }}
          />
        )}
        {hasCertificates && profile.certificates && (
          <Certificates
            certificates={profile.certificates}
            translations={{
              title: t.sections.certificates.title,
              viewCredential: t.sections.certificates.viewCredential,
            }}
          />
        )}
        {hasSkills && profile.skills && (
          <Skills
            skills={profile.skills}
            translations={{
              title: t.sections.about.skills,
            }}
          />
        )}
      </main>
      <Footer
        profile={profile}
        translations={{
          allRightsReserved: t.footer.allRightsReserved,
        }}
      />
    </div>
  );
}
