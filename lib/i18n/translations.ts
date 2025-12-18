export type Translations = {
  [locale: string]: {
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
      projects: {
        title: string;
        viewProject: string;
        tags: string;
      };
      blog: {
        title: string;
        readMore: string;
        publishedOn: string;
        description: string;
      };
      certificates: {
        title: string;
        viewCredential: string;
      };
    };
    actions: {
      downloadCV: string;
    };
    footer: {
      allRightsReserved: string;
    };
  };
};

export const translations: Translations = {
  en: {
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
    actions: {
      downloadCV: "Download CV",
    },
    footer: {
      allRightsReserved: "All rights reserved.",
    },
  },
  tr: {
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
    actions: {
      downloadCV: "CV'yi İndir",
    },
    footer: {
      allRightsReserved: "Tüm hakları saklıdır.",
    },
  },
  de: {
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
        viewProject: "Projekt anzeigen",
        tags: "Tags",
      },
      blog: {
        title: "Artikel",
        readMore: "Artikel lesen",
        publishedOn: "Veröffentlicht am",
        description: "Aktuelle Artikel und technische Blog-Beiträge",
      },
      certificates: {
        title: "Zertifikate & Lizenzen",
        viewCredential: "Zertifikat anzeigen",
      },
    },
    actions: {
      downloadCV: "Lebenslauf herunterladen",
    },
    footer: {
      allRightsReserved: "Alle Rechte vorbehalten.",
    },
  },
  fr: {
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
        tools: "Outils & Technologie",
      },
      projects: {
        title: "Projets",
        viewProject: "Voir le projet",
        tags: "Balises",
      },
      blog: {
        title: "Articles",
        readMore: "Lire l'article",
        publishedOn: "Publié le",
        description: "Les derniers articles et articles de blog techniques",
      },
      certificates: {
        title: "Certificats & Licences",
        viewCredential: "Voir le certificat",
      },
    },
    actions: {
      downloadCV: "Télécharger le CV",
    },
    footer: {
      allRightsReserved: "Tous droits réservés.",
    },
  },
  es: {
    nav: {
      home: "Inicio",
      about: "Acerca de",
      projects: "Proyectos",
      blog: "Blog",
      certificates: "Certificados",
    },
    sections: {
      about: {
        title: "Acerca de mí",
        skills: "Habilidades",
        languages: "Lenguajes de programación",
        frontend: "Frontend",
        backend: "Backend",
        databases: "Bases de datos",
        tools: "Herramientas & Tecnología",
      },
      projects: {
        title: "Proyectos",
        viewProject: "Ver proyecto",
        tags: "Etiquetas",
      },
      blog: {
        title: "Artículos",
        readMore: "Leer artículo",
        publishedOn: "Publicado el",
        description: "Los últimos artículos y posts de blog técnicos",
      },
      certificates: {
        title: "Certificados & Licencias",
        viewCredential: "Ver certificado",
      },
    },
    actions: {
      downloadCV: "Descargar CV",
    },
    footer: {
      allRightsReserved: "Todos los derechos reservados.",
    },
  },
  it: {
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
        viewProject: "Visualizza progetto",
        tags: "Tag",
      },
      blog: {
        title: "Articoli",
        readMore: "Leggi articolo",
        publishedOn: "Pubblicato il",
        description: "Gli ultimi articoli e post tecnici del blog",
      },
      certificates: {
        title: "Certificati & Licenze",
        viewCredential: "Visualizza certificato",
      },
    },
    actions: {
      downloadCV: "Scarica CV",
    },
    footer: {
      allRightsReserved: "Tutti i diritti riservati.",
    },
  },
  pt: {
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
        title: "Artigos",
        readMore: "Ler artigo",
        publishedOn: "Publicado em",
        description: "Últimos artigos e posts técnicos do blog",
      },
      certificates: {
        title: "Certificados & Licenças",
        viewCredential: "Ver certificado",
      },
    },
    actions: {
      downloadCV: "Baixar CV",
    },
    footer: {
      allRightsReserved: "Todos os direitos reservados.",
    },
  },
  ru: {
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
        frontend: "Frontend",
        backend: "Backend",
        databases: "Базы данных",
        tools: "Инструменты & Технологии",
      },
      projects: {
        title: "Проекты",
        viewProject: "Просмотреть проект",
        tags: "Теги",
      },
      blog: {
        title: "Статьи",
        readMore: "Прочитать статью",
        publishedOn: "Опубликовано",
        description: "Последние статьи и технические посты блога",
      },
      certificates: {
        title: "Сертификаты и лицензии",
        viewCredential: "Просмотреть сертификат",
      },
    },
    actions: {
      downloadCV: "Скачать CV",
    },
    footer: {
      allRightsReserved: "Все права защищены.",
    },
  },
  ja: {
    nav: {
      home: "ホーム",
      about: "自己紹介",
      projects: "プロジェクト",
      blog: "ブログ",
      certificates: "認定資格",
    },
    sections: {
      about: {
        title: "自己紹介",
        skills: "スキル",
        languages: "プログラミング言語",
        frontend: "フロントエンド",
        backend: "バックエンド",
        databases: "データベース",
        tools: "ツール & テクノロジー",
      },
      projects: {
        title: "プロジェクト",
        viewProject: "プロジェクトを表示",
        tags: "タグ",
      },
      blog: {
        title: "記事",
        readMore: "記事を読む",
        publishedOn: "公開日",
        description: "最新の記事と技術ブログ投稿",
      },
      certificates: {
        title: "認定資格 & ライセンス",
        viewCredential: "認定資格を表示",
      },
    },
    actions: {
      downloadCV: "CVをダウンロード",
    },
    footer: {
      allRightsReserved: "著作権所有。",
    },
  },
  zh: {
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
        tools: "工具 & 技术",
      },
      projects: {
        title: "项目",
        viewProject: "查看项目",
        tags: "标签",
      },
      blog: {
        title: "文章",
        readMore: "阅读文章",
        publishedOn: "发布于",
        description: "最新文章和技术博客文章",
      },
      certificates: {
        title: "证书 & 许可",
        viewCredential: "查看证书",
      },
    },
    actions: {
      downloadCV: "下载简历",
    },
    footer: {
      allRightsReserved: "版权所有。",
    },
  },
};
