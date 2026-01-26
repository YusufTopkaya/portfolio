"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { OptimizedImage } from "@/components/shared/OptimizedImage";
import { Card, CardContent } from "@/components/ui/card";
import { trackExternalLink } from "@/lib/analytics";
import type { BlogPost } from "@/lib/i18n/content-loader";

interface BlogPostCardProps {
  post: BlogPost;
  index: number;
  translations: {
    readMore: string;
  };
}

export function BlogPostCard({ post, index, translations }: BlogPostCardProps) {
  const [imageError, setImageError] = useState(false);

  const shouldShowImage = post.imageUrl && !imageError;
  const isLocalImage = post.imageUrl?.startsWith("/");

  return (
    <Card className="overflow-hidden flex flex-col w-full group">
      {shouldShowImage && (
        <div className="relative w-full aspect-[16/9] overflow-hidden">
          <OptimizedImage
            src={post.imageUrl!}
            alt={`Blog post thumbnail: ${post.title}`}
            key={index}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            quality={75}
            objectFit="cover"
            priority={isLocalImage || index === 0}
            loadingTimeout={8000}
            onErrorCallback={() => setImageError(true)}
            className="group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      )}
      <CardContent className="p-6 flex flex-col flex-1">
        <div className="flex-1">
          <h3 className="font-heading text-lg mb-3 group-hover:text-primary transition-colors">
            {post.blogUrl ? (
              <a
                href={post.blogUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackExternalLink(post.blogUrl!, `Blog: ${post.title}`)
                }
              >
                {post.title}
              </a>
            ) : (
              post.title
            )}
          </h3>
          <p
            className={`text-sm text-muted-foreground ${
              shouldShowImage ? "line-clamp-7" : "line-clamp-15"
            }`}
          >
            {post.description}
          </p>
        </div>
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-border/50">
          <span className="text-sm text-muted-foreground glass-subtle rounded-full px-3 py-1">
            {post.date}
          </span>
          {post.blogUrl && (
            <a
              href={post.blogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-all duration-200 group/link whitespace-nowrap"
              onClick={() =>
                trackExternalLink(post.blogUrl!, `Blog: ${post.title}`)
              }
            >
              {translations.readMore}
              <ExternalLink className="h-4 w-4 ml-1.5 flex-shrink-0 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
