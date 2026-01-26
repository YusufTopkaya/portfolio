import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { CVDownloadButton } from "@/components/shared/CVDownloadButton";
import { languageCodes } from "@/lib/i18n/config";
import { getProfile } from "@/lib/i18n/server-content-loader";
import { translations } from "@/lib/i18n/translations";

interface PageProps {
  params: Promise<{
    lang: string;
  }>;
}

// Force static page generation
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
  const profile = await getProfile(lang);

  return {
    title: `${profile.personalInfo.name} - ${t.sections.about.resume}`,
    description: `View or download ${profile.personalInfo.name}'s resume/CV.`,
  };
}

export default async function ResumePage({ params }: PageProps) {
  const { lang } = await params;
  const profile = await getProfile(lang);
  const t = translations[lang];

  // Default to CV if available, otherwise empty string (should handle empty case gracefully)
  const cvUrl = profile.personalInfo.cv?.url || "";

  if (!cvUrl) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header
          profile={profile}
          translations={{
            downloadCV: t.actions.downloadCV,
          }}
          language={lang}
        />
        <main className="container mx-auto px-4 py-8 flex-1 flex items-center justify-center">
          <p>Resume not found.</p>
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

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        profile={profile}
        translations={{
          downloadCV: t.actions.downloadCV,
        }}
        language={lang}
      />
      <main className="container mx-auto px-4 py-8 flex-1 flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">{t.sections.about.resume}</h1>
          <CVDownloadButton
            url={cvUrl}
            fileName={profile.personalInfo.cv?.fileName || "cv.pdf"}
            label={t.actions.downloadPDF}
            language={lang}
          />
        </div>

        <div className="flex-1 w-full border rounded-lg overflow-hidden bg-muted/20 min-h-[600px] shadow-sm">
          <iframe
            src={cvUrl}
            className="w-full h-full min-h-[800px]"
            title="Resume PDF"
          />
        </div>
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
