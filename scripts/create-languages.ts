#!/usr/bin/env npx tsx
/**
 * Create Languages Script
 *
 * Usage:
 *   npm run lang:add -- en fr de    # Create multiple languages
 *   npm run lang:add -- ja          # Create single language
 *   npm run lang:list               # List all supported languages
 *
 * This script:
 * - Creates content/{lang}/ directory with profile.json and metadata.json
 * - Updates lib/i18n/config.ts with new language
 * - Updates lib/i18n/translations.ts with UI translations
 */

import * as fs from "node:fs";
import * as path from "node:path";

// Supported languages with their metadata
const SUPPORTED_LANGUAGES: Record<
  string,
  {
    name: string;
    nativeName: string;
    locale: string;
    direction: "ltr" | "rtl";
    translations: {
      nav: {
        home: string;
        about: string;
        projects: string;
        blog: string;
        certificates: string;
      };
      sections: {
        about: {
          title: string;
          skills: string;
          languages: string;
          frontend: string;
          backend: string;
          databases: string;
          tools: string;
        };
        projects: { title: string; viewProject: string; tags: string };
        blog: {
          title: string;
          readMore: string;
          publishedOn: string;
          description: string;
        };
        certificates: { title: string; viewCredential: string };
      };
      actions: { downloadCV: string };
      footer: { allRightsReserved: string };
    };
  }
> = {
  en: {
    name: "English",
    nativeName: "English",
    locale: "en-US",
    direction: "ltr",
    translations: {
      nav: {
        home: "Home",
        about: "About",
        projects: "Projects",
        blog: "Blog",
        certificates: "Certificates",
      },
      sections: {
        about: {
          title: "About Me",
          skills: "Skills",
          languages: "Programming Languages",
          frontend: "Frontend",
          backend: "Backend",
          databases: "Databases",
          tools: "Tools & Technologies",
        },
        projects: {
          title: "Projects",
          viewProject: "View Project",
          tags: "Tags",
        },
        blog: {
          title: "Posts",
          readMore: "Read Article",
          publishedOn: "Published on",
          description: "Latest articles and technical blog posts",
        },
        certificates: {
          title: "Certificates & Licenses",
          viewCredential: "View Credential",
        },
      },
      actions: { downloadCV: "Download CV" },
      footer: { allRightsReserved: "All rights reserved." },
    },
  },
  tr: {
    name: "Turkish",
    nativeName: "Türkçe",
    locale: "tr-TR",
    direction: "ltr",
    translations: {
      nav: {
        home: "Ana Sayfa",
        about: "Hakkımda",
        projects: "Projeler",
        blog: "Blog",
        certificates: "Sertifikalar",
      },
      sections: {
        about: {
          title: "Hakkımda",
          skills: "Yetenekler",
          languages: "Programlama Dilleri",
          frontend: "Frontend",
          backend: "Backend",
          databases: "Veritabanları",
          tools: "Araçlar & Teknolojiler",
        },
        projects: {
          title: "Projeler",
          viewProject: "Projeyi Görüntüle",
          tags: "Etiketler",
        },
        blog: {
          title: "Yazılar",
          readMore: "Yazıyı Oku",
          publishedOn: "Yayınlanma Tarihi",
          description: "En son makaleler ve teknik blog yazıları",
        },
        certificates: {
          title: "Sertifikalar & Lisanslar",
          viewCredential: "Sertifikayı Görüntüle",
        },
      },
      actions: { downloadCV: "CV'yi İndir" },
      footer: { allRightsReserved: "Tüm hakları saklıdır." },
    },
  },
  de: {
    name: "German",
    nativeName: "Deutsch",
    locale: "de-DE",
    direction: "ltr",
    translations: {
      nav: {
        home: "Startseite",
        about: "Über mich",
        projects: "Projekte",
        blog: "Blog",
        certificates: "Zertifikate",
      },
      sections: {
        about: {
          title: "Über mich",
          skills: "Fähigkeiten",
          languages: "Programmiersprachen",
          frontend: "Frontend",
          backend: "Backend",
          databases: "Datenbanken",
          tools: "Tools & Technologien",
        },
        projects: {
          title: "Projekte",
          viewProject: "Projekt ansehen",
          tags: "Tags",
        },
        blog: {
          title: "Beiträge",
          readMore: "Artikel lesen",
          publishedOn: "Veröffentlicht am",
          description: "Aktuelle Artikel und technische Blogbeiträge",
        },
        certificates: {
          title: "Zertifikate & Lizenzen",
          viewCredential: "Zertifikat ansehen",
        },
      },
      actions: { downloadCV: "Lebenslauf herunterladen" },
      footer: { allRightsReserved: "Alle Rechte vorbehalten." },
    },
  },
  fr: {
    name: "French",
    nativeName: "Français",
    locale: "fr-FR",
    direction: "ltr",
    translations: {
      nav: {
        home: "Accueil",
        about: "À propos",
        projects: "Projets",
        blog: "Blog",
        certificates: "Certificats",
      },
      sections: {
        about: {
          title: "À propos de moi",
          skills: "Compétences",
          languages: "Langages de programmation",
          frontend: "Frontend",
          backend: "Backend",
          databases: "Bases de données",
          tools: "Outils & Technologies",
        },
        projects: {
          title: "Projets",
          viewProject: "Voir le projet",
          tags: "Tags",
        },
        blog: {
          title: "Articles",
          readMore: "Lire l'article",
          publishedOn: "Publié le",
          description: "Derniers articles et publications techniques",
        },
        certificates: {
          title: "Certificats & Licences",
          viewCredential: "Voir le certificat",
        },
      },
      actions: { downloadCV: "Télécharger le CV" },
      footer: { allRightsReserved: "Tous droits réservés." },
    },
  },
  es: {
    name: "Spanish",
    nativeName: "Español",
    locale: "es-ES",
    direction: "ltr",
    translations: {
      nav: {
        home: "Inicio",
        about: "Sobre mí",
        projects: "Proyectos",
        blog: "Blog",
        certificates: "Certificados",
      },
      sections: {
        about: {
          title: "Sobre mí",
          skills: "Habilidades",
          languages: "Lenguajes de programación",
          frontend: "Frontend",
          backend: "Backend",
          databases: "Bases de datos",
          tools: "Herramientas y Tecnologías",
        },
        projects: {
          title: "Proyectos",
          viewProject: "Ver proyecto",
          tags: "Etiquetas",
        },
        blog: {
          title: "Publicaciones",
          readMore: "Leer artículo",
          publishedOn: "Publicado el",
          description: "Últimos artículos y publicaciones técnicas",
        },
        certificates: {
          title: "Certificados y Licencias",
          viewCredential: "Ver certificado",
        },
      },
      actions: { downloadCV: "Descargar CV" },
      footer: { allRightsReserved: "Todos los derechos reservados." },
    },
  },
  nl: {
    name: "Dutch",
    nativeName: "Nederlands",
    locale: "nl-NL",
    direction: "ltr",
    translations: {
      nav: {
        home: "Home",
        about: "Over mij",
        projects: "Projecten",
        blog: "Blog",
        certificates: "Certificaten",
      },
      sections: {
        about: {
          title: "Over mij",
          skills: "Vaardigheden",
          languages: "Programmeertalen",
          frontend: "Frontend",
          backend: "Backend",
          databases: "Databases",
          tools: "Tools & Technologieën",
        },
        projects: {
          title: "Projecten",
          viewProject: "Bekijk project",
          tags: "Tags",
        },
        blog: {
          title: "Artikelen",
          readMore: "Lees artikel",
          publishedOn: "Gepubliceerd op",
          description: "Laatste artikelen en technische blogposts",
        },
        certificates: {
          title: "Certificaten & Licenties",
          viewCredential: "Bekijk certificaat",
        },
      },
      actions: { downloadCV: "Download CV" },
      footer: { allRightsReserved: "Alle rechten voorbehouden." },
    },
  },
  pt: {
    name: "Portuguese",
    nativeName: "Português",
    locale: "pt-BR",
    direction: "ltr",
    translations: {
      nav: {
        home: "Início",
        about: "Sobre",
        projects: "Projetos",
        blog: "Blog",
        certificates: "Certificados",
      },
      sections: {
        about: {
          title: "Sobre mim",
          skills: "Habilidades",
          languages: "Linguagens de programação",
          frontend: "Frontend",
          backend: "Backend",
          databases: "Bancos de dados",
          tools: "Ferramentas & Tecnologias",
        },
        projects: {
          title: "Projetos",
          viewProject: "Ver projeto",
          tags: "Tags",
        },
        blog: {
          title: "Publicações",
          readMore: "Ler artigo",
          publishedOn: "Publicado em",
          description: "Últimos artigos e posts técnicos",
        },
        certificates: {
          title: "Certificados & Licenças",
          viewCredential: "Ver certificado",
        },
      },
      actions: { downloadCV: "Baixar CV" },
      footer: { allRightsReserved: "Todos os direitos reservados." },
    },
  },
  it: {
    name: "Italian",
    nativeName: "Italiano",
    locale: "it-IT",
    direction: "ltr",
    translations: {
      nav: {
        home: "Home",
        about: "Chi sono",
        projects: "Progetti",
        blog: "Blog",
        certificates: "Certificati",
      },
      sections: {
        about: {
          title: "Chi sono",
          skills: "Competenze",
          languages: "Linguaggi di programmazione",
          frontend: "Frontend",
          backend: "Backend",
          databases: "Database",
          tools: "Strumenti & Tecnologie",
        },
        projects: {
          title: "Progetti",
          viewProject: "Vedi progetto",
          tags: "Tag",
        },
        blog: {
          title: "Articoli",
          readMore: "Leggi articolo",
          publishedOn: "Pubblicato il",
          description: "Ultimi articoli e post tecnici",
        },
        certificates: {
          title: "Certificati & Licenze",
          viewCredential: "Vedi certificato",
        },
      },
      actions: { downloadCV: "Scarica CV" },
      footer: { allRightsReserved: "Tutti i diritti riservati." },
    },
  },
  pl: {
    name: "Polish",
    nativeName: "Polski",
    locale: "pl-PL",
    direction: "ltr",
    translations: {
      nav: {
        home: "Strona główna",
        about: "O mnie",
        projects: "Projekty",
        blog: "Blog",
        certificates: "Certyfikaty",
      },
      sections: {
        about: {
          title: "O mnie",
          skills: "Umiejętności",
          languages: "Języki programowania",
          frontend: "Frontend",
          backend: "Backend",
          databases: "Bazy danych",
          tools: "Narzędzia i Technologie",
        },
        projects: {
          title: "Projekty",
          viewProject: "Zobacz projekt",
          tags: "Tagi",
        },
        blog: {
          title: "Wpisy",
          readMore: "Czytaj artykuł",
          publishedOn: "Opublikowano",
          description: "Najnowsze artykuły i posty techniczne",
        },
        certificates: {
          title: "Certyfikaty i Licencje",
          viewCredential: "Zobacz certyfikat",
        },
      },
      actions: { downloadCV: "Pobierz CV" },
      footer: { allRightsReserved: "Wszelkie prawa zastrzeżone." },
    },
  },
  ja: {
    name: "Japanese",
    nativeName: "日本語",
    locale: "ja-JP",
    direction: "ltr",
    translations: {
      nav: {
        home: "ホーム",
        about: "自己紹介",
        projects: "プロジェクト",
        blog: "ブログ",
        certificates: "資格",
      },
      sections: {
        about: {
          title: "自己紹介",
          skills: "スキル",
          languages: "プログラミング言語",
          frontend: "フロントエンド",
          backend: "バックエンド",
          databases: "データベース",
          tools: "ツール＆テクノロジー",
        },
        projects: {
          title: "プロジェクト",
          viewProject: "プロジェクトを見る",
          tags: "タグ",
        },
        blog: {
          title: "記事",
          readMore: "記事を読む",
          publishedOn: "公開日",
          description: "最新の記事と技術ブログ投稿",
        },
        certificates: {
          title: "資格＆ライセンス",
          viewCredential: "資格を見る",
        },
      },
      actions: { downloadCV: "履歴書をダウンロード" },
      footer: { allRightsReserved: "無断転載禁止" },
    },
  },
  ko: {
    name: "Korean",
    nativeName: "한국어",
    locale: "ko-KR",
    direction: "ltr",
    translations: {
      nav: {
        home: "홈",
        about: "소개",
        projects: "프로젝트",
        blog: "블로그",
        certificates: "자격증",
      },
      sections: {
        about: {
          title: "소개",
          skills: "기술",
          languages: "프로그래밍 언어",
          frontend: "프론트엔드",
          backend: "백엔드",
          databases: "데이터베이스",
          tools: "도구 & 기술",
        },
        projects: {
          title: "프로젝트",
          viewProject: "프로젝트 보기",
          tags: "태그",
        },
        blog: {
          title: "글",
          readMore: "글 읽기",
          publishedOn: "게시일",
          description: "최신 기사 및 기술 블로그 포스트",
        },
        certificates: {
          title: "자격증 & 라이선스",
          viewCredential: "자격증 보기",
        },
      },
      actions: { downloadCV: "이력서 다운로드" },
      footer: { allRightsReserved: "모든 권리 보유." },
    },
  },
  zh: {
    name: "Chinese",
    nativeName: "简体中文",
    locale: "zh-CN",
    direction: "ltr",
    translations: {
      nav: {
        home: "首页",
        about: "关于",
        projects: "项目",
        blog: "博客",
        certificates: "证书",
      },
      sections: {
        about: {
          title: "关于我",
          skills: "技能",
          languages: "编程语言",
          frontend: "前端",
          backend: "后端",
          databases: "数据库",
          tools: "工具与技术",
        },
        projects: { title: "项目", viewProject: "查看项目", tags: "标签" },
        blog: {
          title: "文章",
          readMore: "阅读文章",
          publishedOn: "发布于",
          description: "最新文章和技术博客",
        },
        certificates: {
          title: "证书与执照",
          viewCredential: "查看证书",
        },
      },
      actions: { downloadCV: "下载简历" },
      footer: { allRightsReserved: "版权所有" },
    },
  },
  ar: {
    name: "Arabic",
    nativeName: "العربية",
    locale: "ar-SA",
    direction: "rtl",
    translations: {
      nav: {
        home: "الرئيسية",
        about: "عني",
        projects: "المشاريع",
        blog: "المدونة",
        certificates: "الشهادات",
      },
      sections: {
        about: {
          title: "عني",
          skills: "المهارات",
          languages: "لغات البرمجة",
          frontend: "الواجهة الأمامية",
          backend: "الخلفية",
          databases: "قواعد البيانات",
          tools: "الأدوات والتقنيات",
        },
        projects: {
          title: "المشاريع",
          viewProject: "عرض المشروع",
          tags: "الوسوم",
        },
        blog: {
          title: "المقالات",
          readMore: "قراءة المقال",
          publishedOn: "نُشر في",
          description: "أحدث المقالات والمنشورات التقنية",
        },
        certificates: {
          title: "الشهادات والتراخيص",
          viewCredential: "عرض الشهادة",
        },
      },
      actions: { downloadCV: "تحميل السيرة الذاتية" },
      footer: { allRightsReserved: "جميع الحقوق محفوظة." },
    },
  },
  ru: {
    name: "Russian",
    nativeName: "Русский",
    locale: "ru-RU",
    direction: "ltr",
    translations: {
      nav: {
        home: "Главная",
        about: "Обо мне",
        projects: "Проекты",
        blog: "Блог",
        certificates: "Сертификаты",
      },
      sections: {
        about: {
          title: "Обо мне",
          skills: "Навыки",
          languages: "Языки программирования",
          frontend: "Фронтенд",
          backend: "Бэкенд",
          databases: "Базы данных",
          tools: "Инструменты и технологии",
        },
        projects: {
          title: "Проекты",
          viewProject: "Смотреть проект",
          tags: "Теги",
        },
        blog: {
          title: "Статьи",
          readMore: "Читать статью",
          publishedOn: "Опубликовано",
          description: "Последние статьи и технические посты",
        },
        certificates: {
          title: "Сертификаты и лицензии",
          viewCredential: "Смотреть сертификат",
        },
      },
      actions: { downloadCV: "Скачать резюме" },
      footer: { allRightsReserved: "Все права защищены." },
    },
  },
  hi: {
    name: "Hindi",
    nativeName: "हिन्दी",
    locale: "hi-IN",
    direction: "ltr",
    translations: {
      nav: {
        home: "होम",
        about: "परिचय",
        projects: "प्रोजेक्ट्स",
        blog: "ब्लॉग",
        certificates: "प्रमाणपत्र",
      },
      sections: {
        about: {
          title: "मेरे बारे में",
          skills: "कौशल",
          languages: "प्रोग्रामिंग भाषाएं",
          frontend: "फ्रंटएंड",
          backend: "बैकएंड",
          databases: "डेटाबेस",
          tools: "उपकरण और प्रौद्योगिकियां",
        },
        projects: {
          title: "प्रोजेक्ट्स",
          viewProject: "प्रोजेक्ट देखें",
          tags: "टैग",
        },
        blog: {
          title: "पोस्ट",
          readMore: "लेख पढ़ें",
          publishedOn: "प्रकाशित",
          description: "नवीनतम लेख और तकनीकी ब्लॉग पोस्ट",
        },
        certificates: {
          title: "प्रमाणपत्र और लाइसेंस",
          viewCredential: "प्रमाणपत्र देखें",
        },
      },
      actions: { downloadCV: "सीवी डाउनलोड करें" },
      footer: { allRightsReserved: "सर्वाधिकार सुरक्षित।" },
    },
  },
};

// Paths
const ROOT_DIR = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT_DIR, "content");
const CONFIG_FILE = path.join(ROOT_DIR, "lib", "i18n", "config.ts");
const TRANSLATIONS_FILE = path.join(ROOT_DIR, "lib", "i18n", "translations.ts");

// Template content files
function getProfileTemplate(lang: string): object {
  const langData = SUPPORTED_LANGUAGES[lang];
  if (!langData) return {};

  return {
    personalInfo: {
      name: "Your Name",
      position: "Your Position",
      company: "Your Company",
      about:
        "Write a brief description about yourself. Highlight your expertise, experience, and what makes you unique.",
      imageUrl: "/images/profile.webp",
      callsign: "",
      cv: {
        url: "/files/cv.pdf",
        fileName: "Your Name - CV.pdf",
      },
    },
    skills: [
      {
        name: "Frontend Development",
        icon: "monitor",
        items: [
          {
            name: "React / Next.js",
            level: "Expert",
            levelType: "expert",
            icon: "code",
          },
          {
            name: "TypeScript",
            level: "Proficient",
            levelType: "proficient",
            icon: "code-2",
          },
        ],
      },
      {
        name: "Backend Development",
        icon: "server",
        items: [
          {
            name: "Node.js",
            level: "Proficient",
            levelType: "proficient",
            icon: "server",
          },
        ],
      },
    ],
    certificates: [],
    projects: [],
    blogPosts: [],
    socialLinks: [
      { name: "GitHub", url: "https://github.com/yourusername" },
      { name: "LinkedIn", url: "https://linkedin.com/in/yourusername" },
    ],
  };
}

function getMetadataTemplate(lang: string): object {
  return {
    title: "Your Name - Your Position",
    description:
      "Write a brief description about yourself. This will appear in search results and social media previews.",
    callsign: "",
    keywords: [
      "software engineer",
      "developer",
      "portfolio",
      "web development",
    ],
    openGraph: {
      title: "Your Name - Your Position",
      description:
        "Write a brief description about yourself. This will appear in social media previews.",
      siteName: "Your Portfolio",
      images: [
        {
          url: `/images/og-banner.${lang}.webp`,
          width: 1200,
          height: 630,
          alt: "Your Name - Your Position | Portfolio preview",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: "@yourusername",
      creator: "@yourusername",
      images: {
        url: `/images/og-banner.${lang}.webp`,
        alt: "Your Name - Your Position | Portfolio preview",
      },
    },
  };
}

// Read existing config file
function readConfigFile(): string {
  return fs.readFileSync(CONFIG_FILE, "utf-8");
}

// Read existing translations file
function readTranslationsFile(): string {
  return fs.readFileSync(TRANSLATIONS_FILE, "utf-8");
}

// Get existing languages from config
function getExistingLanguages(): string[] {
  const content = readConfigFile();
  const match = content.match(/code:\s*"([^"]+)"/g);
  if (!match) return [];
  return match.map((m) => m.replace(/code:\s*"([^"]+)"/, "$1"));
}

// Create content directory and files
function createContentFiles(lang: string): void {
  const langDir = path.join(CONTENT_DIR, lang);

  if (!fs.existsSync(langDir)) {
    fs.mkdirSync(langDir, { recursive: true });
  }

  const profilePath = path.join(langDir, "profile.json");
  const metadataPath = path.join(langDir, "metadata.json");

  fs.writeFileSync(
    profilePath,
    JSON.stringify(getProfileTemplate(lang), null, 2)
  );
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(getMetadataTemplate(lang), null, 2)
  );

  console.log(`  ✓ Created content/${lang}/profile.json`);
  console.log(`  ✓ Created content/${lang}/metadata.json`);
}

// Update config.ts with new language
function updateConfigFile(lang: string): void {
  const langData = SUPPORTED_LANGUAGES[lang];
  if (!langData) return;

  let content = readConfigFile();

  // Find the languages array and add new language
  const languageEntry = `  {
    code: "${lang}",
    name: "${langData.name}",
    nativeName: "${langData.nativeName}",
    locale: "${langData.locale}",
    direction: "${langData.direction}",
  },`;

  // Insert before the closing bracket of the languages array
  content = content.replace(
    /(export const languages: Language\[\] = \[[\s\S]*?)(];)/,
    `$1${languageEntry}\n$2`
  );

  fs.writeFileSync(CONFIG_FILE, content);
  console.log(`  ✓ Updated lib/i18n/config.ts`);
}

// Update translations.ts with new language
function updateTranslationsFile(lang: string): void {
  const langData = SUPPORTED_LANGUAGES[lang];
  if (!langData) return;

  let content = readTranslationsFile();

  const translationEntry = `  ${lang}: {
    nav: {
      home: "${langData.translations.nav.home}",
      about: "${langData.translations.nav.about}",
      projects: "${langData.translations.nav.projects}",
      blog: "${langData.translations.nav.blog}",
      certificates: "${langData.translations.nav.certificates}",
    },
    sections: {
      about: {
        title: "${langData.translations.sections.about.title}",
        skills: "${langData.translations.sections.about.skills}",
        languages: "${langData.translations.sections.about.languages}",
        frontend: "${langData.translations.sections.about.frontend}",
        backend: "${langData.translations.sections.about.backend}",
        databases: "${langData.translations.sections.about.databases}",
        tools: "${langData.translations.sections.about.tools}",
      },
      projects: {
        title: "${langData.translations.sections.projects.title}",
        viewProject: "${langData.translations.sections.projects.viewProject}",
        tags: "${langData.translations.sections.projects.tags}",
      },
      blog: {
        title: "${langData.translations.sections.blog.title}",
        readMore: "${langData.translations.sections.blog.readMore}",
        publishedOn: "${langData.translations.sections.blog.publishedOn}",
        description: "${langData.translations.sections.blog.description}",
      },
      certificates: {
        title: "${langData.translations.sections.certificates.title}",
        viewCredential: "${langData.translations.sections.certificates.viewCredential}",
      },
    },
    actions: {
      downloadCV: "${langData.translations.actions.downloadCV}",
    },
    footer: {
      allRightsReserved: "${langData.translations.footer.allRightsReserved}",
    },
  },`;

  // Insert before the closing bracket of the translations object
  content = content.replace(
    /(export const translations: Translations = \{[\s\S]*?)(};)/,
    `$1${translationEntry}\n$2`
  );

  fs.writeFileSync(TRANSLATIONS_FILE, content);
  console.log(`  ✓ Updated lib/i18n/translations.ts`);
}

// Main function
function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Portfolio Language Creator
==========================

Usage:
  npm run lang:add -- <lang_codes...>   Create new languages
  npm run lang:list                     List supported languages

Examples:
  npm run lang:add -- fr de             Create French and German
  npm run lang:add -- ja ko zh          Create Japanese, Korean, Chinese

Supported languages: ${Object.keys(SUPPORTED_LANGUAGES).join(", ")}
    `);
    return;
  }

  if (args.includes("--list")) {
    console.log("\nSupported Languages:\n");
    for (const [code, data] of Object.entries(SUPPORTED_LANGUAGES)) {
      console.log(`  ${code.padEnd(4)} - ${data.name} (${data.nativeName})`);
    }
    console.log("");
    return;
  }

  const existingLangs = getExistingLanguages();
  const langsToCreate = args.filter((arg) => !arg.startsWith("-"));

  console.log("\n🌍 Creating languages...\n");

  for (const lang of langsToCreate) {
    // Validate language code
    if (!SUPPORTED_LANGUAGES[lang]) {
      console.log(`❌ "${lang}" is not a supported language code.`);
      console.log(`   Run with --list to see supported languages.\n`);
      continue;
    }

    // Check if already exists
    if (existingLangs.includes(lang)) {
      console.log(`⚠️  "${lang}" already exists, skipping.\n`);
      continue;
    }

    console.log(`📝 Creating ${SUPPORTED_LANGUAGES[lang].name} (${lang})...`);

    try {
      createContentFiles(lang);
      updateConfigFile(lang);
      updateTranslationsFile(lang);
      console.log(
        `✅ ${SUPPORTED_LANGUAGES[lang].name} created successfully!\n`
      );
    } catch (error) {
      console.error(`❌ Error creating ${lang}:`, error);
    }
  }

  console.log("🎉 Done! Don't forget to:");
  console.log("   1. Translate content in content/<lang>/profile.json");
  console.log("   2. Update metadata in content/<lang>/metadata.json");
  console.log(
    "   3. Create OG banner at /public/images/og-banner.<lang>.webp\n"
  );
}

main();

