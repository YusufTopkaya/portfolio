"use client";
import { DynamicIcon, getIconName } from "@/components/ui/DynamicIcon";
import { type SkillCategory, SkillLevel } from "@/lib/i18n/content-loader";

interface SkillsProps {
  skills: string[] | SkillCategory[];
  translations: {
    title: string;
  };
}

// Skill level badge component with glassmorphism
function SkillBadge({
  level,
  levelType,
}: {
  level: string;
  levelType: SkillLevel;
}) {
  let badgeClasses =
    "px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm transition-all duration-200 ";

  switch (levelType) {
    case SkillLevel.EXPERT:
      badgeClasses += "bg-primary/90 text-primary-foreground shadow-glow-sm";
      break;
    case SkillLevel.PROFICIENT:
      badgeClasses += "bg-primary/20 text-primary border border-primary/30";
      break;
    case SkillLevel.FAMILIAR:
      badgeClasses +=
        "bg-muted/50 text-muted-foreground border border-muted-foreground/20";
      break;
    default:
      badgeClasses +=
        "bg-muted/50 text-muted-foreground border border-muted-foreground/20";
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
    <section className="container space-y-8 py-12 md:py-16 lg:py-24">
      <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
        <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-6xl text-gradient">
          {translations.title}
        </h2>
      </div>

      {isSkillCategoryFormat ? (
        <div
          className={`mx-auto grid justify-center gap-6 ${
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
              : "square";

            return (
              <div
                key={categoryIndex}
                className="glass glass-hover rounded-2xl p-6 space-y-4 w-full group/card"
              >
                {/* Category header with dynamic icon */}
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <DynamicIcon
                      name={iconName}
                      fallback="square"
                      className="w-5 h-5"
                    />
                  </div>
                  <h3 className="font-semibold text-lg text-foreground group-hover/card:text-primary transition-colors">
                    {category.name}
                  </h3>
                </div>

                {/* Divider with gradient */}
                <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent" />

                {/* Skills list */}
                <div className="space-y-3">
                  {category.items.map((skill, skillIndex) => {
                    const skillIconName = skill.icon
                      ? getIconName(skill.icon)
                      : "circle";

                    return (
                      <div
                        key={skillIndex}
                        className="flex items-center justify-between gap-2 group"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0">
                            <DynamicIcon
                              name={skillIconName}
                              fallback="circle"
                              className="w-4 h-4"
                            />
                          </div>
                          <span className="text-sm text-foreground font-medium group-hover:text-primary transition-colors">
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
        // Simple array format
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
              className="glass glass-hover rounded-xl p-4 w-full"
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
