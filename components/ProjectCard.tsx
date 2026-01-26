"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { OptimizedImage } from "@/components/shared/OptimizedImage";
import { Card, CardContent } from "@/components/ui/card";
import { trackExternalLink } from "@/lib/analytics";
import type { Project } from "@/lib/i18n/content-loader";

interface ProjectCardProps {
  project: Project;
  translations: {
    tags: string;
    viewProject: string;
  };
}

export function ProjectCard({ project, translations }: ProjectCardProps) {
  const [imageError, setImageError] = useState(false);

  const shouldShowImage = project.imageUrl && !imageError;

  return (
    <Card className="overflow-hidden flex flex-col w-full group">
      <CardContent className="p-6 flex flex-col flex-1">
        <div className="flex items-center gap-3 mb-3">
          {shouldShowImage && (
            <div className="relative w-6 h-6 flex-shrink-0">
              <OptimizedImage
                src={project.imageUrl!}
                alt={`${project.title} project icon`}
                fill
                sizes="24px"
                objectFit="contain"
                showLoadingSpinner={false}
                onErrorCallback={() => setImageError(true)}
              />
            </div>
          )}
          <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">
            {project.projectUrl ? (
              <a
                href={project.projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackExternalLink(
                    project.projectUrl!,
                    `Project: ${project.title}`,
                  )
                }
              >
                {project.title}
              </a>
            ) : (
              project.title
            )}
          </h3>
        </div>
        <p className="text-muted-foreground mb-4 line-clamp-7 flex-1">
          {project.description}
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {project.tags.map((tag, tagIndex) => (
            <span
              key={tagIndex}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex justify-end pt-4 border-t border-border/50">
          {project.projectUrl && (
            <a
              href={project.projectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/90 transition-all duration-200 group/link"
              onClick={() =>
                trackExternalLink(
                  project.projectUrl!,
                  `Project: ${project.title}`,
                )
              }
            >
              {translations.viewProject}
              <ExternalLink className="h-4 w-4 ml-2 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
