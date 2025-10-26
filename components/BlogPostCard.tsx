"use client";

import { type BlogPost } from "@/lib/i18n/content-loader";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import { useState } from "react";
import { ExternalLink } from "lucide-react";

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

  return (
    <Card className="overflow-hidden flex flex-col hover:shadow-lg transition-shadow w-full">
      {shouldShowImage && (
        <div className="relative w-full aspect-[16/9]">
          <Image
            src={post.imageUrl!}
            alt={post.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            priority={index === 0}
            loading={"lazy"}
            quality={75}
            onError={() => setImageError(true)}
          />
        </div>
      )}
      <CardContent className="p-6 flex flex-col flex-1">
        <div className="flex-1">
          <h3 className="font-heading text-lg mb-3">{post.title}</h3>
          <p
            className={`text-sm text-muted-foreground ${
              shouldShowImage ? "line-clamp-7" : "line-clamp-15"
            }`}
          >
            {post.description}
          </p>
        </div>
        <div className="flex justify-between items-center mt-4">
          <span className="text-sm text-muted-foreground">{post.date}</span>
          {post.blogUrl && (
            <a
              href={post.blogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/90 transition-colors"
            >
              {translations.readMore}
              <ExternalLink className="h-4 w-4 ml-2" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
