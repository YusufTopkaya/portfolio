"use client";

import { ProjectCard } from "@/components/ProjectCard";
import type { Profile } from "@/lib/i18n/content-loader";

interface ProjectsProps {
  projects: Profile["projects"];
  translations: {
    title: string;
    tags: string;
    viewProject: string;
  };
}

export function Projects({ projects, translations }: ProjectsProps) {
  // If there are no projects, don't render anything
  if (!projects?.length) {
    return null;
  }

  return (
    <section className="container space-y-6 py-8 md:py-12 lg:py-24">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
        <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
          {translations.title}
        </h2>
      </div>

      <div
        className={`mx-auto grid justify-center gap-4 ${
          projects.length === 1
            ? "max-w-[24rem] grid-cols-1"
            : projects.length === 2
              ? "grid-cols-1 sm:grid-cols-2 max-w-[48rem]"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-[64rem]"
        }`}
      >
        {projects.map((project, index) => (
          <ProjectCard
            key={index}
            project={project}
            translations={{
              tags: translations.tags,
              viewProject: translations.viewProject,
            }}
          />
        ))}
      </div>
    </section>
  );
}
