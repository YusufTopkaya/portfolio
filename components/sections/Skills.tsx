"use client";
import { SkillCategory } from "@/lib/i18n/content-loader";
import { DynamicIcon, getIconName } from "@/components/ui/DynamicIcon";

interface SkillsProps {
  skills: string[] | SkillCategory[];
  translations: {
    title: string;
  };
}

// Skill level badge component - simplified to avoid hydration issues
function SkillBadge({ level }: { level: string }) {
  // Use simple, static classes that won't change between server and client
  let badgeClasses = "px-2 py-1 rounded-full text-xs font-medium ";

  switch (level.toLowerCase()) {
    case "expert":
      badgeClasses += "bg-blue-500 text-white";
      break;
    case "proficient":
      badgeClasses += "border border-blue-400 text-blue-600";
      break;
    case "familiar":
      badgeClasses += "border border-gray-300 text-gray-600";
      break;
    default:
      badgeClasses += "border border-gray-300 text-gray-600";
      break;
  }

  return <span className={badgeClasses}>{level}</span>;
}

export function Skills({ skills, translations }: SkillsProps) {
  // If there are no skills, don't render anything
  if (!skills) {
    return null;
  }

  // Additional checks for empty data
  if (Array.isArray(skills) && skills.length === 0) {
    return null;
  }

  // Determine if skills are in SkillCategory format (structured) or simple string array
  const isSkillCategoryFormat =
    skills.length > 0 && typeof skills[0] === "object";

  return (
    <section className="container space-y-6 py-8 md:py-12 lg:py-24">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
        <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl">
          {translations.title}
        </h2>
      </div>

      {isSkillCategoryFormat ? (
        <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
          {/* New structured format with categories */}
          {(skills as SkillCategory[]).map((category, categoryIndex) => {
            const iconName = category.icon
              ? getIconName(category.icon)
              : "square"; // Fallback to square if no icon defined

            return (
              <div
                key={`category-${categoryIndex}-${category.name}`}
                className="border border-border rounded-lg p-6 space-y-4 hover:shadow-lg transition-shadow"
              >
                {/* Category header with dynamic icon */}
                <div className="flex items-center space-x-3">
                  <div className="text-blue-500 flex-shrink-0">
                    <DynamicIcon
                      name={iconName}
                      fallback="square"
                      className="w-5 h-5"
                    />
                  </div>
                  <h3 className="font-semibold text-lg text-foreground">
                    {category.name}
                  </h3>
                </div>

                {/* Divider */}
                <div className="w-full h-px bg-border"></div>

                {/* Skills list */}
                <div className="space-y-3">
                  {category.items.map((skill, skillIndex) => {
                    const skillIconName = skill.icon
                      ? getIconName(skill.icon)
                      : "circle"; // Fallback to circle if no icon defined

                    return (
                      <div
                        key={`skill-${categoryIndex}-${skillIndex}-${skill.name.substring(
                          0,
                          10
                        )}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div className="text-gray-400 flex-shrink-0">
                            <DynamicIcon
                              name={skillIconName}
                              fallback="circle"
                              className="w-4 h-4"
                            />
                          </div>
                          <span className="text-sm text-foreground font-medium">
                            {skill.name}
                          </span>
                        </div>
                        <SkillBadge level={skill.level} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Simple array format - original layout
        <div className="mx-auto max-w-[64rem]">
          <div className="flex flex-wrap gap-2 justify-center">
            {(skills as string[]).map((skill, index) => (
              <span
                key={`simple-skill-${index}-${skill.substring(0, 10)}`}
                className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-accent transition-colors"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
