import { getAllBlogSlugs } from "@/lib/blog";
import type { Profile } from "@/lib/i18n/content-loader";

interface JsonLdProps {
  profile: Profile;
  siteUrl: string;
  siteName: string;
  lang: string;
}

// Safe: All data comes from static JSON profile files at build time, not user input.
// JSON.stringify also escapes any special characters, preventing injection.

export function JsonLd({ profile, siteUrl, siteName, lang }: JsonLdProps) {
  const {
    personalInfo,
    socialLinks,
    skills,
    certificates,
    blogPosts,
    projects,
  } = profile;

  const langUrl = `${siteUrl}/${lang}`;
  const personId = `${siteUrl}/#person`;
  const websiteId = `${siteUrl}/#website`;

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

  const sameAs = socialLinks?.map((link) => link.url) || [];

  const hasCredential =
    certificates && certificates.length > 0
      ? certificates.map((cert) => ({
          "@type": "EducationalOccupationalCredential" as const,
          name: cert.title,
          credentialCategory: "certificate",
          recognizedBy: {
            "@type": "Organization" as const,
            name: cert.issuer,
          },
          ...(cert.credentialUrl ? { url: cert.credentialUrl } : {}),
        }))
      : undefined;

  const imageUrl = personalInfo.imageUrl.startsWith("/")
    ? `${siteUrl}${personalInfo.imageUrl}`
    : personalInfo.imageUrl;

  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": personId,
    name: personalInfo.name,
    jobTitle: personalInfo.position,
    worksFor: personalInfo.company
      ? {
          "@type": "Organization",
          name: personalInfo.company,
          ...(personalInfo.companyUrl ? { url: personalInfo.companyUrl } : {}),
        }
      : undefined,
    description: personalInfo.about,
    url: langUrl,
    image: imageUrl,
    email: personalInfo.email || undefined,
    telephone: personalInfo.phoneNumber || undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    knowsAbout: skillNames.length > 0 ? skillNames : undefined,
    hasCredential,
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: [".hero-title", ".hero-description"],
    },
  };

  const profilePageSchema = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${siteUrl}/#profilepage`,
    name: siteName,
    url: langUrl,
    dateCreated: "2025-01-01",
    dateModified: new Date().toISOString().split("T")[0],
    mainEntity: { "@id": personId },
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId,
    name: siteName,
    url: siteUrl,
    inLanguage: lang,
    author: { "@id": personId },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/{search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const faqSchema =
    skillNames.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: `What technologies does ${personalInfo.name} specialize in?`,
              acceptedAnswer: {
                "@type": "Answer",
                text: `${personalInfo.name} specializes in ${skillNames.slice(0, 8).join(", ")}, and more. See the full skills list on the portfolio.`,
              },
            },
            {
              "@type": "Question",
              name: `Where does ${personalInfo.name} work?`,
              acceptedAnswer: {
                "@type": "Answer",
                text: `${personalInfo.name} works as ${personalInfo.position}${personalInfo.company ? ` at ${personalInfo.company}` : ""}.`,
              },
            },
            {
              "@type": "Question",
              name: `How can I contact ${personalInfo.name}?`,
              acceptedAnswer: {
                "@type": "Answer",
                text: `You can reach ${personalInfo.name} via email at ${personalInfo.email || "the contact details on this portfolio"}.`,
              },
            },
          ],
        }
      : null;

  const featuredProject = projects?.find((p) => p.featured === true);

  const softwareAppSchema = featuredProject
    ? {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: featuredProject.title,
        description: featuredProject.description,
        url: featuredProject.projectUrl,
        codeRepository: featuredProject.projectUrl,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        author: { "@id": personId },
        license: "https://opensource.org/licenses/MIT",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      }
    : null;

  const localBlogSlugs = new Set(getAllBlogSlugs());

  const blogListSchema =
    blogPosts && blogPosts.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: blogPosts.map((post, index) => {
            const postUrl =
              post.slug && localBlogSlugs.has(post.slug)
                ? `${siteUrl}/${lang}/blog/${post.slug}`
                : post.blogUrl || "";
            const postImage = post.imageUrl
              ? post.imageUrl.startsWith("http")
                ? post.imageUrl
                : `${siteUrl}${post.imageUrl}`
              : undefined;
            return {
              "@type": "ListItem",
              position: index + 1,
              item: {
                "@type": "BlogPosting",
                headline: post.title,
                description: post.description || "",
                url: postUrl,
                ...(post.date ? { datePublished: post.date } : {}),
                author: {
                  "@type": "Person",
                  "@id": personId,
                  name: personalInfo.name,
                },
                ...(postImage ? { image: postImage } : {}),
                inLanguage: lang,
                isPartOf: { "@type": "WebSite", "@id": websiteId },
              },
            };
          }),
        }
      : null;

  const schemas = [
    personSchema,
    profilePageSchema,
    websiteSchema,
    ...(faqSchema ? [faqSchema] : []),
    ...(softwareAppSchema ? [softwareAppSchema] : []),
    ...(blogListSchema ? [blogListSchema] : []),
  ];

  return (
    <>
      {schemas.map((schema) => (
        <script
          key={schema["@type"]}
          type="application/ld+json"
          // Safe: content from static build-time JSON, escaped by JSON.stringify
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema),
          }}
        />
      ))}
    </>
  );
}
