"use client";
import { DynamicIcon, getIconName } from "@/components/ui/DynamicIcon";
import { type SkillCategory, SkillLevel } from "@/lib/i18n/content-loader";

interface SkillsProps {
  skills: string[] | SkillCategory[];
  translations: {
    title: string;
  };
}

// Skill level badge component - simplified to avoid hydration issues
function SkillBadge({
  level,
  levelType,
}: {
  level: string;
  levelType: SkillLevel;
}) {
  // Use direct static classes to avoid any hydration issues
  let badgeClasses = "px-2 py-1 rounded-full text-xs font-medium ";

  switch (levelType) {
    case SkillLevel.EXPERT:
      badgeClasses += "bg-primary text-primary-foreground";
      break;
    case SkillLevel.PROFICIENT:
      badgeClasses += "border border-primary/50 text-primary bg-primary/5";
      break;
    case SkillLevel.FAMILIAR:
      badgeClasses +=
        "border border-muted-foreground/30 text-muted-foreground bg-muted/50";
      break;
    default:
      badgeClasses +=
        "border border-muted-foreground/30 text-muted-foreground bg-muted/50";
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
        <div
          className={`mx-auto grid justify-center gap-4 ${
            skills.length === 1
              ? "max-w-[24rem] grid-cols-1"
              : skills.length === 2
              ? "grid-cols-1 sm:grid-cols-2 max-w-[48rem]"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-[64rem]"
          }`}
        >
          {/* New structured format with categories */}
          {(skills as SkillCategory[]).map((category, categoryIndex) => {
            const iconName = category.icon
              ? getIconName(category.icon)
              : "square"; // Fallback to square if no icon defined

            return (
              <div
                key={categoryIndex}
                className="border border-border rounded-lg p-6 space-y-4 hover:shadow-lg transition-shadow w-full"
              >
                {/* Category header with dynamic icon */}
                <div className="flex items-center space-x-3">
                  <div className="text-primary flex-shrink-0">
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
                        key={skillIndex}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div className="text-muted-foreground flex-shrink-0">
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
                        <SkillBadge
                          level={skill.level}
                          levelType={skill.levelType}
                        />
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
        <div
          className={`mx-auto grid justify-center gap-4 ${
            skills.length === 1
              ? "max-w-[24rem] grid-cols-1"
              : skills.length === 2
              ? "grid-cols-1 sm:grid-cols-2 max-w-[48rem]"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-[64rem]"
          }`}
        >
          {(skills as string[]).map((skill, index) => (
            <div
              key={index}
              className="border border-border rounded-lg p-4 hover:shadow-lg transition-shadow w-full"
            >
              <span className="text-sm font-medium text-foreground">
                {skill}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

