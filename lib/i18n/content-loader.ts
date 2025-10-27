import { translations, Translations } from "./translations";

export interface Project {
  title: string;
  description: string;
  projectUrl: string;
  tags: string[];
  imageUrl?: string;
}

export interface BlogPost {
  title: string;
  description: string;
  blogUrl: string;
  date: string;
  imageUrl?: string;
}

export interface Skill {
  name: string;
}

export interface Certificate {
  title: string;
  issuer: string;
  issueDate: string;
  credentialId?: string;
  credentialUrl?: string;
}

export enum SkillLevel {
  EXPERT = "expert",
  PROFICIENT = "proficient",
  FAMILIAR = "familiar",
}

export interface SkillItem {
  name: string;
  level: string;
  levelType: SkillLevel;
  icon?: string;
}

export interface SkillCategory {
  name: string;
  icon?: string;
  items: SkillItem[];
}

export interface Profile {
  personalInfo: {
    name: string;
    position: string;
    company: string;
    about: string;
    imageUrl: string;
    callsign?: string;
    cv?: {
      url: string;
      fileName: string;
    };
  };
  skills?: string[] | SkillCategory[];
  certificates?: Certificate[];
  projects?: Project[];
  blogPosts?: BlogPost[];
  socialLinks: Array<{
    name: string;
    url: string;
  }>;
}

export interface SEOMetadata {
  title: string;
  description: string;
  keywords: string[];
  openGraph: {
    title: string;
    description: string;
    siteName: string;
    url?: string;
    images: Array<{
      url: string;
      width: number;
      height: number;
      alt: string;
    }>;
  };
  twitter: {
    card: "summary" | "summary_large_image" | "player" | "app";
    site: string;
    creator: string;
    images: {
      url: string;
      alt: string;
    };
  };
}

export function getTranslation(
  key: string,
  locale: keyof Translations
): string {
  const keys = key.split(".");
  let translation: unknown = translations[locale];

  for (const k of keys) {
    if (translation && typeof translation === "object" && k in translation) {
      translation = (translation as Record<string, unknown>)[k];
    } else {
      return key;
    }
  }

  return typeof translation === "string" ? translation : key;
}
