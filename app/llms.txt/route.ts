import profile from "@/content/en/profile.json";
import { getAllBlogPosts } from "@/lib/blog";
import type { BlogPost } from "@/lib/i18n/content-loader";

export const dynamic = "force-static";

export function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { personalInfo, projects, socialLinks } = profile;
  const blogPosts = profile.blogPosts as BlogPost[];

  const projectLines = projects
    .map((p) => `- [${p.title}](${p.projectUrl}): ${p.description}`)
    .join("\n");

  const localPosts = getAllBlogPosts("en");
  const localSlugs = new Set(localPosts.map((p) => p.slug));

  const blogLines = blogPosts
    .map((b) => {
      const slug = (b as { slug?: string }).slug;
      const url =
        slug && localSlugs.has(slug) ? `${siteUrl}/en/blog/${slug}` : b.blogUrl;
      return `- [${b.title}](${url}): ${b.description}`;
    })
    .join("\n");

  // Add local posts not in profile.json
  const profileSlugs = new Set(
    blogPosts.map((b) => (b as { slug?: string }).slug).filter(Boolean),
  );
  const extraLines = localPosts
    .filter((p) => !profileSlugs.has(p.slug))
    .map(
      (p) => `- [${p.title}](${siteUrl}/en/blog/${p.slug}): ${p.description}`,
    )
    .join("\n");

  const allBlogLines = [blogLines, extraLines].filter(Boolean).join("\n");

  const socialLines = socialLinks
    .map((s) => `- [${s.name}](${s.url})`)
    .join("\n");

  const content = `# ${personalInfo.name}

> ${personalInfo.about}

For complete professional profile see: ${siteUrl}/llms-full.txt
RSS Feed: ${siteUrl}/feed.xml

## Pages

- [Portfolio](${siteUrl}/en): Homepage with skills, projects, and blog posts
- [Resume](${siteUrl}/en/resume): Full CV and work experience
${personalInfo.cv ? `- [CV PDF](${siteUrl}${personalInfo.cv.url}): Downloadable resume` : ""}

## Projects

${projectLines}

## Blog Posts

${allBlogLines}

## Contact

${(personalInfo as { email?: string }).email ? `- Email: ${(personalInfo as { email?: string }).email}\n` : ""}${socialLines}

## Full Profile

- [Complete AI Context](${siteUrl}/llms-full.txt): Comprehensive professional profile for AI deep-context consumption
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
