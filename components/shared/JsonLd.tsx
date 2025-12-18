import { languageCodes } from "@/lib/i18n/config";
import type { Profile } from "@/lib/i18n/content-loader";

interface JsonLdProps {
  profile: Profile;
  siteUrl: string;
  siteName: string;
}

export function JsonLd({ profile, siteUrl, siteName }: JsonLdProps) {
  const { personalInfo, socialLinks, skills } = profile;

  // Extract skill names for knowsAbout
  const skillNames: string[] = [];
  if (Array.isArray(skills)) {
    for (const category of skills) {
      if (typeof category === "object" && "items" in category) {
        for (const item of category.items) {
          skillNames.push(item.name);
        }
      } else if (typeof category === "string") {
        skillNames.push(category);
      }
    }
  }

  // Extract social links URLs
  const sameAs = socialLinks?.map((link) => link.url) || [];

  // Person Schema
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: personalInfo.name,
    jobTitle: personalInfo.position,
    worksFor: personalInfo.company
      ? {
          "@type": "Organization",
          name: personalInfo.company,
        }
      : undefined,
    description: personalInfo.about,
    url: siteUrl,
    image: personalInfo.imageUrl.startsWith("/")
      ? `${siteUrl}${personalInfo.imageUrl}`
      : personalInfo.imageUrl,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    knowsAbout: skillNames.length > 0 ? skillNames : undefined,
  };

  // WebSite Schema
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: siteUrl,
    inLanguage: languageCodes,
    author: {
      "@type": "Person",
      name: personalInfo.name,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(personSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteSchema),
        }}
      />
    </>
  );
}
