"use client";

import { Profile } from "@/lib/i18n/content-loader";
import { BlogPostCard } from "@/components/BlogPostCard";

interface BlogProps {
  profile: Profile;
  translations: {
    title: string;
    description: string;
    readMore: string;
  };
}

export function Blog({ profile, translations: t }: BlogProps) {
  // If there are no blog posts, don't render anything
  if (!profile.blogPosts?.length) {
    return null;
  }

  return (
    <section id="blog" className="container space-y-6 py-8 md:py-12 lg:py-24">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
        <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
          {t.title}
        </h2>
        <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
          {t.description}
        </p>
      </div>

      <div
        className={`mx-auto grid justify-center gap-4 ${
          profile.blogPosts.length === 1
            ? "max-w-[24rem] grid-cols-1"
            : profile.blogPosts.length === 2
            ? "grid-cols-1 sm:grid-cols-2 max-w-[48rem]"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-[64rem]"
        }`}
      >
        {profile.blogPosts.map((post, index) => (
          <BlogPostCard
            key={index}
            post={post}
            index={index}
            translations={{
              readMore: t.readMore,
            }}
          />
        ))}
      </div>
    </section>
  );
}
