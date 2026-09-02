import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { languageCodes } from "@/lib/i18n/config";
import { getProfile } from "@/lib/i18n/server-content-loader";
import { translations } from "@/lib/i18n/translations";

// Safe: all data from static build-time JSON files, escaped via JSON.stringify
function PrivacyJsonLd({
  name,
  siteUrl,
  lang,
}: {
  name: string;
  siteUrl: string;
  lang: string;
}) {
  const langUrl = `${siteUrl}/${lang}`;
  const privacyUrl = `${langUrl}/privacy`;

  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name, item: langUrl },
      {
        "@type": "ListItem",
        position: 2,
        name: "Privacy Policy",
        item: privacyUrl,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

interface PageProps {
  params: Promise<{
    lang: string;
  }>;
}

// Pixel-art envelope in the NES.css spirit: dark 1px frame, paper body,
// stepped "V" flap. Rendered with crispEdges so it stays sharp at any size.
function PixelMailIcon() {
  return (
    <svg
      viewBox="0 0 16 12"
      aria-hidden="true"
      shapeRendering="crispEdges"
      className="h-4 w-auto shrink-0"
    >
      <rect x="1" y="1" width="14" height="10" fill="#ffffff" />
      <path fill="#212529" d="M0 0h16v12H0z M1 1h14v10H1z" fillRule="evenodd" />
      {/* stepped "V" flap: left arm, bottom row, right arm */}
      <path
        fill="#212529"
        d="M1 1h1v1h1v1h1v1h1v1h1v1h1v1H5V5H4V4H3V3H2V2H1z"
      />
      <path fill="#212529" d="M6 6h4v1H6z" />
      <path
        fill="#212529"
        d="M15 1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1H11V5H12V4H13V3H14V2H15z"
      />
    </svg>
  );
}

export const dynamic = "force-static";
export const revalidate = false;

export function generateStaticParams() {
  return languageCodes.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const profile = await getProfile(lang);
  const t = translations[lang];

  return {
    title: `${t.privacy.title} - ${profile.personalInfo.name}`,
    description: t.privacy.description.replaceAll(
      "{name}",
      profile.personalInfo.name,
    ),
    robots: { index: true, follow: true },
  };
}

export default async function PrivacyPage({ params }: PageProps) {
  const { lang } = await params;
  const profile = await getProfile(lang);
  const t = translations[lang];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const lastUpdated = "March 2026";

  return (
    <>
      <PrivacyJsonLd
        name={profile.personalInfo.name}
        siteUrl={siteUrl}
        lang={lang}
      />
      <div className="flex flex-col min-h-screen">
        <Header
          profile={profile}
          translations={{
            downloadCV: t.actions.downloadCV,
          }}
          language={lang}
        />
        <main className="container mx-auto px-4 py-8 flex-1 max-w-3xl">
          <Link
            href={`/${lang}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            ← {profile.personalInfo.name}
          </Link>
          <h1 className="text-3xl font-bold mb-2">{t.privacy.title}</h1>
          <p className="text-sm text-muted-foreground mb-8">
            {t.privacy.lastUpdated} {lastUpdated}
          </p>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-3">
                {t.privacy.introduction.heading}
              </h2>
              <p>
                {t.privacy.introduction.body
                  .replaceAll("{name}", profile.personalInfo.name)
                  .replaceAll("{site}", siteUrl.replace(/^https?:\/\//, ""))}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                {t.privacy.informationCollected.heading}
              </h2>
              <p>{t.privacy.informationCollected.intro}</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>
                  <strong>Google Analytics / Google Tag Manager:</strong>{" "}
                  {t.privacy.informationCollected.googleAnalytics}
                </li>
                <li>
                  <strong>Microsoft Clarity:</strong>{" "}
                  {t.privacy.informationCollected.microsoftClarity}
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                {t.privacy.cookies.heading}
              </h2>
              <p>{t.privacy.cookies.body}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                {t.privacy.dataSharing.heading}
              </h2>
              <p>{t.privacy.dataSharing.body}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                {t.privacy.externalLinks.heading}
              </h2>
              <p>{t.privacy.externalLinks.body}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                {t.privacy.contact.heading}
              </h2>
              <p>
                {t.privacy.contact.body}{" "}
                <a
                  href={`mailto:${profile.personalInfo.email}`}
                  className="inline-flex items-center gap-1.5 align-middle text-primary hover:underline"
                >
                  <PixelMailIcon />
                  {profile.personalInfo.email}
                </a>
              </p>
            </section>
          </div>
        </main>
        <Footer
          profile={profile}
          lang={lang}
          translations={{
            allRightsReserved: t.footer.allRightsReserved,
          }}
        />
      </div>
    </>
  );
}
