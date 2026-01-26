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
        resume: string;
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
      downloadPDF: string;
    };
    contact: {
      sendEmail: string;
      sendWhatsApp: string;
      openMenu: string;
      closeMenu: string;
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
        resume: "Resume",
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
      downloadPDF: "Download PDF",
    },
    contact: {
      sendEmail: "Send email",
      sendWhatsApp: "Send WhatsApp message",
      openMenu: "Open contact menu",
      closeMenu: "Close menu",
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
        resume: "Özgeçmiş",
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
      downloadPDF: "PDF İndir",
    },
    contact: {
      sendEmail: "Email gönder",
      sendWhatsApp: "WhatsApp ile mesaj gönder",
      openMenu: "İletişim menüsünü aç",
      closeMenu: "Menüyü kapat",
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
        resume: "Lebenslauf",
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
    actions: {
      downloadCV: "Lebenslauf herunterladen",
      downloadPDF: "PDF herunterladen",
    },
    contact: {
      sendEmail: "E-Mail senden",
      sendWhatsApp: "WhatsApp-Nachricht senden",
      openMenu: "Kontaktmenü öffnen",
      closeMenu: "Menü schließen",
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
        resume: "CV",
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
    actions: {
      downloadCV: "Télécharger le CV",
      downloadPDF: "Télécharger le PDF",
    },
    contact: {
      sendEmail: "Envoyer un email",
      sendWhatsApp: "Envoyer un message WhatsApp",
      openMenu: "Ouvrir le menu de contact",
      closeMenu: "Fermer le menu",
    },
    footer: {
      allRightsReserved: "Tous droits réservés.",
    },
  },
  es: {
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
        resume: "Currículum",
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
    actions: {
      downloadCV: "Descargar CV",
      downloadPDF: "Descargar PDF",
    },
    contact: {
      sendEmail: "Enviar correo electrónico",
      sendWhatsApp: "Enviar mensaje de WhatsApp",
      openMenu: "Abrir menú de contacto",
      closeMenu: "Cerrar menú",
    },
    footer: {
      allRightsReserved: "Todos los derechos reservados.",
    },
  },
  nl: {
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
        resume: "CV",
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
    actions: {
      downloadCV: "Download CV",
      downloadPDF: "PDF downloaden",
    },
    contact: {
      sendEmail: "E-mail verzenden",
      sendWhatsApp: "WhatsApp-bericht verzenden",
      openMenu: "Contactmenu openen",
      closeMenu: "Menu sluiten",
    },
    footer: {
      allRightsReserved: "Alle rechten voorbehouden.",
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
        resume: "Currículo",
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
    actions: {
      downloadCV: "Baixar CV",
      downloadPDF: "Baixar PDF",
    },
    contact: {
      sendEmail: "Enviar email",
      sendWhatsApp: "Enviar mensagem do WhatsApp",
      openMenu: "Abrir menu de contato",
      closeMenu: "Fechar menu",
    },
    footer: {
      allRightsReserved: "Todos os direitos reservados.",
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
        resume: "Curriculum",
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
    actions: {
      downloadCV: "Scarica CV",
      downloadPDF: "Scarica PDF",
    },
    contact: {
      sendEmail: "Invia email",
      sendWhatsApp: "Invia messaggio WhatsApp",
      openMenu: "Apri menu contatti",
      closeMenu: "Chiudi menu",
    },
    footer: {
      allRightsReserved: "Tutti i diritti riservati.",
    },
  },
  pl: {
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
        resume: "CV",
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
    actions: {
      downloadCV: "Pobierz CV",
      downloadPDF: "Pobierz PDF",
    },
    contact: {
      sendEmail: "Wyślij email",
      sendWhatsApp: "Wyślij wiadomość WhatsApp",
      openMenu: "Otwórz menu kontaktu",
      closeMenu: "Zamknij menu",
    },
    footer: {
      allRightsReserved: "Wszelkie prawa zastrzeżone.",
    },
  },
  ja: {
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
        resume: "履歴書",
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
    actions: {
      downloadCV: "履歴書をダウンロード",
      downloadPDF: "PDFをダウンロード",
    },
    contact: {
      sendEmail: "メールを送る",
      sendWhatsApp: "WhatsAppメッセージを送る",
      openMenu: "連絡先メニューを開く",
      closeMenu: "メニューを閉じる",
    },
    footer: {
      allRightsReserved: "無断転載禁止",
    },
  },
  ko: {
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
        resume: "이력서",
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
    actions: {
      downloadCV: "이력서 다운로드",
      downloadPDF: "PDF 다운로드",
    },
    contact: {
      sendEmail: "이메일 보내기",
      sendWhatsApp: "WhatsApp 메시지 보내기",
      openMenu: "연락처 메뉴 열기",
      closeMenu: "메뉴 닫기",
    },
    footer: {
      allRightsReserved: "모든 권리 보유.",
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
        resume: "简历",
        frontend: "前端",
        backend: "后端",
        databases: "数据库",
        tools: "工具与技术",
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
        description: "最新文章和技术博客",
      },
      certificates: {
        title: "证书与执照",
        viewCredential: "查看证书",
      },
    },
    actions: {
      downloadCV: "下载简历",
      downloadPDF: "下载 PDF",
    },
    contact: {
      sendEmail: "发送邮件",
      sendWhatsApp: "发送 WhatsApp 消息",
      openMenu: "打开联系菜单",
      closeMenu: "关闭菜单",
    },
    footer: {
      allRightsReserved: "版权所有",
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
        resume: "Резюме",
        frontend: "Фронтенд",
        backend: "Бэкенд",
        databases: "Базы данных",
        tools: "Инструменты и технологии",
      },
      projects: {
        title: "Проекты",
        viewProject: "Посмотреть проект",
        tags: "Теги",
      },
      blog: {
        title: "Публикации",
        readMore: "Читать статью",
        publishedOn: "Опубликовано",
        description: "Последние статьи и технические публикации",
      },
      certificates: {
        title: "Сертификаты и лицензии",
        viewCredential: "Посмотреть сертификат",
      },
    },
    actions: {
      downloadCV: "Скачать резюме",
      downloadPDF: "Скачать PDF",
    },
    contact: {
      sendEmail: "Отправить email",
      sendWhatsApp: "Отправить сообщение WhatsApp",
      openMenu: "Открыть меню контактов",
      closeMenu: "Закрыть меню",
    },
    footer: {
      allRightsReserved: "Все права защищены.",
    },
  },
};
