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

  return {
    title: `Privacy Policy - ${profile.personalInfo.name}`,
    description: `Privacy policy for ${profile.personalInfo.name}'s personal portfolio website.`,
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
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Last updated: {lastUpdated}
          </p>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
              <p>
                This privacy policy explains how {profile.personalInfo.name}{" "}
                (&quot;I&quot;, &quot;me&quot;, or &quot;my&quot;) collects,
                uses, and protects information when you visit this personal
                portfolio website at {siteUrl.replace(/^https?:\/\//, "")}.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                2. Information I Collect
              </h2>
              <p>
                This website does not collect any personally identifiable
                information directly. However, the following third-party
                services may collect data:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>
                  <strong>Google Analytics / Google Tag Manager:</strong>{" "}
                  Collects anonymized usage data (page views, session duration,
                  referral source) to help me understand how visitors use the
                  site.
                </li>
                <li>
                  <strong>Microsoft Clarity:</strong> Collects anonymized
                  heatmap and session replay data to improve user experience.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. Cookies</h2>
              <p>
                Third-party analytics services listed above may set cookies.
                These cookies are used solely for analytics purposes and do not
                identify you personally. You can disable cookies through your
                browser settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. Data Sharing</h2>
              <p>
                I do not sell, trade, or transfer your personal data to third
                parties. Analytics data collected by Google and Microsoft is
                subject to their respective privacy policies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. External Links</h2>
              <p>
                This website contains links to external sites (GitHub, LinkedIn,
                Medium, etc.). I am not responsible for the privacy practices of
                those sites.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. Contact</h2>
              <p>
                If you have questions about this privacy policy, you can reach
                me at:{" "}
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
