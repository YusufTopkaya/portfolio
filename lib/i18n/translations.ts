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
        copyForLLM: string;
        copied: string;
        copyLink: string;
        copyCode: string;
        tableOfContents: string;
        minRead: string;
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
    privacy: {
      title: string;
      lastUpdated: string;
      description: string;
      introduction: {
        heading: string;
        body: string;
      };
      informationCollected: {
        heading: string;
        intro: string;
        googleAnalytics: string;
        microsoftClarity: string;
      };
      cookies: {
        heading: string;
        body: string;
      };
      dataSharing: {
        heading: string;
        body: string;
      };
      externalLinks: {
        heading: string;
        body: string;
      };
      contact: {
        heading: string;
        body: string;
      };
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
        copyForLLM: "Copy for AI",
        copied: "Copied!",
        copyLink: "Copy link to section",
        copyCode: "Copy code",
        tableOfContents: "In this article",
        minRead: "min read",
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
    privacy: {
      title: "Privacy Policy",
      lastUpdated: "Last updated:",
      description:
        "Privacy policy for {name}'s personal portfolio website.",
      introduction: {
        heading: "1. Introduction",
        body: 'This privacy policy explains how {name} ("I", "me", or "my") collects, uses, and protects information when you visit this personal portfolio website at {site}.',
      },
      informationCollected: {
        heading: "2. Information I Collect",
        intro:
          "This website does not collect any personally identifiable information directly. However, the following third-party services may collect data:",
        googleAnalytics:
          "Collects anonymized usage data (page views, session duration, referral source) to help me understand how visitors use the site.",
        microsoftClarity:
          "Collects anonymized heatmap and session replay data to improve user experience.",
      },
      cookies: {
        heading: "3. Cookies",
        body: "Third-party analytics services listed above may set cookies. These cookies are used solely for analytics purposes and do not identify you personally. You can disable cookies through your browser settings.",
      },
      dataSharing: {
        heading: "4. Data Sharing",
        body: "I do not sell, trade, or transfer your personal data to third parties. Analytics data collected by Google and Microsoft is subject to their respective privacy policies.",
      },
      externalLinks: {
        heading: "5. External Links",
        body: "This website contains links to external sites (GitHub, LinkedIn, Medium, etc.). I am not responsible for the privacy practices of those sites.",
      },
      contact: {
        heading: "6. Contact",
        body: "If you have questions about this privacy policy, you can reach me at:",
      },
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
        copyForLLM: "AI için Kopyala",
        copied: "Kopyalandı!",
        copyLink: "Bölüm bağlantısını kopyala",
        copyCode: "Kodu kopyala",
        tableOfContents: "Bu makalede",
        minRead: "dakika okuma",
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
    privacy: {
      title: "Gizlilik Politikası",
      lastUpdated: "Son güncelleme:",
      description:
        "{name}'in kişisel portföy web sitesi için gizlilik politikası.",
      introduction: {
        heading: "1. Giriş",
        body: 'Bu gizlilik politikası, {site} adresindeki bu kişisel portföy web sitesini ziyaret ettiğinizde {name} ("ben", "bana" veya "benim") tarafından bilgilerin nasıl toplandığını, kullanıldığını ve korunduğunu açıklar.',
      },
      informationCollected: {
        heading: "2. Topladığım Bilgiler",
        intro:
          "Bu web sitesi doğrudan kişisel olarak tanımlanabilir herhangi bir bilgi toplamaz. Ancak aşağıdaki üçüncü taraf hizmetler veri toplayabilir:",
        googleAnalytics:
          "Ziyaretçilerin siteyi nasıl kullandığını anlamama yardımcı olmak için anonimleştirilmiş kullanım verileri (sayfa görüntülemeleri, oturum süresi, yönlendirme kaynağı) toplar.",
        microsoftClarity:
          "Kullanıcı deneyimini iyileştirmek için anonimleştirilmiş ısı haritası ve oturum kaydı verileri toplar.",
      },
      cookies: {
        heading: "3. Çerezler",
        body: "Yukarıda listelenen üçüncü taraf analitik hizmetleri çerezler ayarlayabilir. Bu çerezler yalnızca analitik amaçlarla kullanılır ve sizi kişisel olarak tanımlamaz. Çerezleri tarayıcı ayarlarınızdan devre dışı bırakabilirsiniz.",
      },
      dataSharing: {
        heading: "4. Veri Paylaşımı",
        body: "Kişisel verilerinizi üçüncü taraflara satmıyor, takas etmiyor veya aktarmıyorum. Google ve Microsoft tarafından toplanan analitik veriler, kendi gizlilik politikalarına tabidir.",
      },
      externalLinks: {
        heading: "5. Harici Bağlantılar",
        body: "Bu web sitesi harici sitelere (GitHub, LinkedIn, Medium vb.) bağlantılar içerir. Bu sitelerin gizlilik uygulamalarından sorumlu değilim.",
      },
      contact: {
        heading: "6. İletişim",
        body: "Bu gizlilik politikası hakkında sorularınız varsa bana şu adresten ulaşabilirsiniz:",
      },
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
        copyForLLM: "Für AI kopieren",
        copied: "Kopiert!",
        copyLink: "Link zum Abschnitt kopieren",
        copyCode: "Code kopieren",
        tableOfContents: "In diesem Artikel",
        minRead: "Min. Lesezeit",
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
    privacy: {
      title: "Datenschutzerklärung",
      lastUpdated: "Zuletzt aktualisiert:",
      description:
        "Datenschutzerklärung für die persönliche Portfolio-Website von {name}.",
      introduction: {
        heading: "1. Einleitung",
        body: 'Diese Datenschutzerklärung erklärt, wie {name} („ich", „mich" oder „meine") Informationen erhebt, verwendet und schützt, wenn Sie diese persönliche Portfolio-Website unter {site} besuchen.',
      },
      informationCollected: {
        heading: "2. Informationen, die ich erhebe",
        intro:
          "Diese Website erhebt keine direkt personenbezogenen Daten. Die folgenden Drittanbieter-Dienste können jedoch Daten erheben:",
        googleAnalytics:
          "Erhebt anonymisierte Nutzungsdaten (Seitenaufrufe, Sitzungsdauer, Herkunftsquelle), um mir zu helfen zu verstehen, wie Besucher die Website nutzen.",
        microsoftClarity:
          "Erhebt anonymisierte Heatmap- und Sitzungsaufzeichnungsdaten, um die Benutzererfahrung zu verbessern.",
      },
      cookies: {
        heading: "3. Cookies",
        body: "Die oben aufgeführten Analyse-Dienste von Drittanbietern können Cookies setzen. Diese Cookies werden ausschließlich für Analysezwecke verwendet und identifizieren Sie nicht persönlich. Sie können Cookies in Ihren Browsereinstellungen deaktivieren.",
      },
      dataSharing: {
        heading: "4. Datenweitergabe",
        body: "Ich verkaufe, tausche oder übertrage Ihre persönlichen Daten nicht an Dritte. Die von Google und Microsoft erhobenen Analysedaten unterliegen den jeweiligen Datenschutzrichtlinien.",
      },
      externalLinks: {
        heading: "5. Externe Links",
        body: "Diese Website enthält Links zu externen Seiten (GitHub, LinkedIn, Medium usw.). Ich bin nicht für die Datenschutzpraktiken dieser Seiten verantwortlich.",
      },
      contact: {
        heading: "6. Kontakt",
        body: "Wenn Sie Fragen zu dieser Datenschutzerklärung haben, können Sie mich erreichen unter:",
      },
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
        copyForLLM: "Copier pour AI",
        copied: "Copié !",
        copyLink: "Copier le lien de la section",
        copyCode: "Copier le code",
        tableOfContents: "Dans cet article",
        minRead: "min de lecture",
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
    privacy: {
      title: "Politique de confidentialité",
      lastUpdated: "Dernière mise à jour :",
      description:
        "Politique de confidentialité du site portfolio personnel de {name}.",
      introduction: {
        heading: "1. Introduction",
        body: "Cette politique de confidentialité explique comment {name} (« je », « me » ou « mon ») collecte, utilise et protège les informations lorsque vous visitez ce site portfolio personnel à l'adresse {site}.",
      },
      informationCollected: {
        heading: "2. Informations que je collecte",
        intro:
          "Ce site ne collecte aucune information personnellement identifiable directement. Cependant, les services tiers suivants peuvent collecter des données :",
        googleAnalytics:
          "Collecte des données d'utilisation anonymisées (pages vues, durée des sessions, source de référence) pour m'aider à comprendre comment les visiteurs utilisent le site.",
        microsoftClarity:
          "Collecte des données anonymisées de cartes de chaleur et de relecture de sessions pour améliorer l'expérience utilisateur.",
      },
      cookies: {
        heading: "3. Cookies",
        body: "Les services d'analyse tiers mentionnés ci-dessus peuvent déposer des cookies. Ces cookies sont utilisés uniquement à des fins d'analyse et ne vous identifient pas personnellement. Vous pouvez désactiver les cookies dans les paramètres de votre navigateur.",
      },
      dataSharing: {
        heading: "4. Partage des données",
        body: "Je ne vends, n'échange ni ne transfère vos données personnelles à des tiers. Les données d'analyse collectées par Google et Microsoft sont soumises à leurs politiques de confidentialité respectives.",
      },
      externalLinks: {
        heading: "5. Liens externes",
        body: "Ce site contient des liens vers des sites externes (GitHub, LinkedIn, Medium, etc.). Je ne suis pas responsable des pratiques de confidentialité de ces sites.",
      },
      contact: {
        heading: "6. Contact",
        body: "Si vous avez des questions sur cette politique de confidentialité, vous pouvez me joindre à l'adresse suivante :",
      },
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
        copyForLLM: "Copiar para AI",
        copied: "¡Copiado!",
        copyLink: "Copiar enlace a la sección",
        copyCode: "Copiar código",
        tableOfContents: "En este artículo",
        minRead: "min de lectura",
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
    privacy: {
      title: "Política de privacidad",
      lastUpdated: "Última actualización:",
      description:
        "Política de privacidad del sitio web de portafolio personal de {name}.",
      introduction: {
        heading: "1. Introducción",
        body: 'Esta política de privacidad explica cómo {name} ("yo", "me" o "mi") recopila, utiliza y protege la información cuando visitas este sitio web de portafolio personal en {site}.',
      },
      informationCollected: {
        heading: "2. Información que recopilo",
        intro:
          "Este sitio web no recopila información de identificación personal directamente. Sin embargo, los siguientes servicios de terceros pueden recopilar datos:",
        googleAnalytics:
          "Recopila datos de uso anonimizados (páginas vistas, duración de la sesión, fuente de referencia) para ayudarme a entender cómo los visitantes usan el sitio.",
        microsoftClarity:
          "Recopila datos anonimizados de mapas de calor y repeticiones de sesión para mejorar la experiencia del usuario.",
      },
      cookies: {
        heading: "3. Cookies",
        body: "Los servicios de analítica de terceros mencionados anteriormente pueden establecer cookies. Estas cookies se utilizan únicamente con fines de análisis y no te identifican personalmente. Puedes desactivar las cookies en la configuración de tu navegador.",
      },
      dataSharing: {
        heading: "4. Compartir datos",
        body: "No vendo, intercambio ni transfiero tus datos personales a terceros. Los datos de analítica recopilados por Google y Microsoft están sujetos a sus respectivas políticas de privacidad.",
      },
      externalLinks: {
        heading: "5. Enlaces externos",
        body: "Este sitio web contiene enlaces a sitios externos (GitHub, LinkedIn, Medium, etc.). No soy responsable de las prácticas de privacidad de esos sitios.",
      },
      contact: {
        heading: "6. Contacto",
        body: "Si tienes preguntas sobre esta política de privacidad, puedes contactarme en:",
      },
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
        copyForLLM: "Kopiëren voor AI",
        copied: "Gekopieerd!",
        copyLink: "Link naar sectie kopiëren",
        copyCode: "Code kopiëren",
        tableOfContents: "In dit artikel",
        minRead: "min leestijd",
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
    privacy: {
      title: "Privacybeleid",
      lastUpdated: "Laatst bijgewerkt:",
      description:
        "Privacybeleid voor de persoonlijke portfoliowebsite van {name}.",
      introduction: {
        heading: "1. Inleiding",
        body: 'Dit privacybeleid legt uit hoe {name} ("ik", "mij" of "mijn") informatie verzamelt, gebruikt en beschermt wanneer je deze persoonlijke portfoliowebsite op {site} bezoekt.',
      },
      informationCollected: {
        heading: "2. Informatie die ik verzamel",
        intro:
          "Deze website verzamelt zelf geen persoonlijk identificeerbare informatie. De volgende diensten van derden kunnen echter gegevens verzamelen:",
        googleAnalytics:
          "Verzamelt geanonimiseerde gebruiksgegevens (paginaweergaven, sessieduur, verwijzingsbron) om mij te helpen begrijpen hoe bezoekers de site gebruiken.",
        microsoftClarity:
          "Verzamelt geanonimiseerde heatmap- en sessieopnamegegevens om de gebruikerservaring te verbeteren.",
      },
      cookies: {
        heading: "3. Cookies",
        body: "De hierboven genoemde analyticsdiensten van derden kunnen cookies plaatsen. Deze cookies worden uitsluitend gebruikt voor analysedoeleinden en identificeren je niet persoonlijk. Je kunt cookies uitschakelen via je browserinstellingen.",
      },
      dataSharing: {
        heading: "4. Delen van gegevens",
        body: "Ik verkoop, ruil of draag je persoonlijke gegevens niet over aan derden. Analytische gegevens die door Google en Microsoft worden verzameld, vallen onder hun respectieve privacybeleid.",
      },
      externalLinks: {
        heading: "5. Externe links",
        body: "Deze website bevat links naar externe sites (GitHub, LinkedIn, Medium, enz.). Ik ben niet verantwoordelijk voor het privacybeleid van die sites.",
      },
      contact: {
        heading: "6. Contact",
        body: "Als je vragen hebt over dit privacybeleid, kun je me bereiken op:",
      },
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
        copyForLLM: "Copiar para AI",
        copied: "Copiado!",
        copyLink: "Copiar link da seção",
        copyCode: "Copiar código",
        tableOfContents: "Neste artigo",
        minRead: "min de leitura",
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
    privacy: {
      title: "Política de Privacidade",
      lastUpdated: "Última atualização:",
      description:
        "Política de privacidade do site de portfólio pessoal de {name}.",
      introduction: {
        heading: "1. Introdução",
        body: 'Esta política de privacidade explica como {name} ("eu", "me" ou "meu") coleta, usa e protege informações quando você visita este site de portfólio pessoal em {site}.',
      },
      informationCollected: {
        heading: "2. Informações que eu coleto",
        intro:
          "Este site não coleta informações de identificação pessoal diretamente. No entanto, os seguintes serviços de terceiros podem coletar dados:",
        googleAnalytics:
          "Coleta dados de uso anonimizados (visualizações de página, duração da sessão, fonte de referência) para me ajudar a entender como os visitantes usam o site.",
        microsoftClarity:
          "Coleta dados anonimizados de mapas de calor e replays de sessão para melhorar a experiência do usuário.",
      },
      cookies: {
        heading: "3. Cookies",
        body: "Os serviços de análise de terceiros listados acima podem definir cookies. Esses cookies são usados exclusivamente para fins de análise e não identificam você pessoalmente. Você pode desativar os cookies nas configurações do seu navegador.",
      },
      dataSharing: {
        heading: "4. Compartilhamento de Dados",
        body: "Eu não vendo, troco ou transfiro seus dados pessoais para terceiros. Os dados de análise coletados pelo Google e pela Microsoft estão sujeitos às suas respectivas políticas de privacidade.",
      },
      externalLinks: {
        heading: "5. Links Externos",
        body: "Este site contém links para sites externos (GitHub, LinkedIn, Medium, etc.). Não sou responsável pelas práticas de privacidade desses sites.",
      },
      contact: {
        heading: "6. Contato",
        body: "Se você tiver dúvidas sobre esta política de privacidade, pode entrar em contato comigo em:",
      },
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
        copyForLLM: "Copia per AI",
        copied: "Copiato!",
        copyLink: "Copia link alla sezione",
        copyCode: "Copia codice",
        tableOfContents: "In questo articolo",
        minRead: "min di lettura",
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
    privacy: {
      title: "Informativa sulla privacy",
      lastUpdated: "Ultimo aggiornamento:",
      description:
        "Informativa sulla privacy del sito portfolio personale di {name}.",
      introduction: {
        heading: "1. Introduzione",
        body: "Questa informativa sulla privacy spiega come {name} (\"io\", \"me\" o \"mio\") raccoglie, utilizza e protegge le informazioni quando visiti questo sito portfolio personale all'indirizzo {site}.",
      },
      informationCollected: {
        heading: "2. Informazioni che raccolgo",
        intro:
          "Questo sito web non raccoglie direttamente informazioni di identificazione personale. Tuttavia, i seguenti servizi di terze parti possono raccogliere dati:",
        googleAnalytics:
          "Raccoglie dati di utilizzo anonimizzati (visualizzazioni di pagina, durata della sessione, fonte di provenienza) per aiutarmi a capire come i visitatori utilizzano il sito.",
        microsoftClarity:
          "Raccoglie dati anonimizzati di heatmap e registrazioni di sessione per migliorare l'esperienza utente.",
      },
      cookies: {
        heading: "3. Cookie",
        body: "I servizi di analisi di terze parti elencati sopra possono impostare cookie. Questi cookie sono utilizzati esclusivamente a scopo di analisi e non ti identificano personalmente. Puoi disabilitare i cookie nelle impostazioni del tuo browser.",
      },
      dataSharing: {
        heading: "4. Condivisione dei dati",
        body: "Non vendo, scambio né trasferisco i tuoi dati personali a terzi. I dati analitici raccolti da Google e Microsoft sono soggetti alle rispettive informative sulla privacy.",
      },
      externalLinks: {
        heading: "5. Link esterni",
        body: "Questo sito web contiene link a siti esterni (GitHub, LinkedIn, Medium, ecc.). Non sono responsabile delle pratiche sulla privacy di quei siti.",
      },
      contact: {
        heading: "6. Contatto",
        body: "Se hai domande su questa informativa sulla privacy, puoi contattarmi a:",
      },
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
        copyForLLM: "Kopiuj dla AI",
        copied: "Skopiowano!",
        copyLink: "Kopiuj link do sekcji",
        copyCode: "Kopiuj kod",
        tableOfContents: "W tym artykule",
        minRead: "min czytania",
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
    privacy: {
      title: "Polityka prywatności",
      lastUpdated: "Ostatnia aktualizacja:",
      description:
        "Polityka prywatności osobistej witryny portfolio — {name}.",
      introduction: {
        heading: "1. Wprowadzenie",
        body: 'Niniejsza polityka prywatności wyjaśnia, w jaki sposób {name} („ja", „mnie" lub „mój") gromadzi, wykorzystuje i chroni informacje, gdy odwiedzasz tę osobistą witrynę portfolio pod adresem {site}.',
      },
      informationCollected: {
        heading: "2. Informacje, które zbieram",
        intro:
          "Ta witryna nie zbiera bezpośrednio żadnych danych osobowych. Jednak następujące usługi stron trzecich mogą zbierać dane:",
        googleAnalytics:
          "Zbiera zanonimizowane dane o użytkowaniu (wyświetlenia stron, czas trwania sesji, źródło odwiedzin), aby pomóc mi zrozumieć, jak odwiedzający korzystają z witryny.",
        microsoftClarity:
          "Zbiera zanonimizowane dane map ciepła i nagrań sesji w celu poprawy komfortu użytkowania.",
      },
      cookies: {
        heading: "3. Pliki cookie",
        body: "Wymienione powyżej usługi analityczne stron trzecich mogą ustawiać pliki cookie. Te pliki cookie są używane wyłącznie do celów analitycznych i nie identyfikują cię osobiście. Możesz wyłączyć pliki cookie w ustawieniach swojej przeglądarki.",
      },
      dataSharing: {
        heading: "4. Udostępnianie danych",
        body: "Nie sprzedaję, nie wymieniam ani nie przekazuję twoich danych osobowych stronom trzecim. Dane analityczne zbierane przez Google i Microsoft podlegają ich odpowiednim politykom prywatności.",
      },
      externalLinks: {
        heading: "5. Linki zewnętrzne",
        body: "Ta witryna zawiera linki do stron zewnętrznych (GitHub, LinkedIn, Medium itp.). Nie ponoszę odpowiedzialności za praktyki prywatności tych stron.",
      },
      contact: {
        heading: "6. Kontakt",
        body: "Jeśli masz pytania dotyczące tej polityki prywatności, możesz się ze mną skontaktować pod adresem:",
      },
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
        copyForLLM: "AI用にコピー",
        copied: "コピーしました！",
        copyLink: "セクションのリンクをコピー",
        copyCode: "コードをコピー",
        tableOfContents: "この記事の内容",
        minRead: "分で読める",
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
    privacy: {
      title: "プライバシーポリシー",
      lastUpdated: "最終更新日：",
      description:
        "{name}の個人ポートフォリオウェブサイトのプライバシーポリシー。",
      introduction: {
        heading: "1. はじめに",
        body: "このプライバシーポリシーは、{site}にあるこの個人ポートフォリオウェブサイトにアクセスした際に、{name}（以下「私」）がどのように情報を収集、使用、保護するかを説明するものです。",
      },
      informationCollected: {
        heading: "2. 収集する情報",
        intro:
          "このウェブサイトは、個人を特定できる情報を直接収集することはありません。ただし、以下のサードパーティサービスがデータを収集する場合があります：",
        googleAnalytics:
          "訪問者がサイトをどのように利用しているかを理解するために、匿名化された使用データ（ページビュー、セッション時間、参照元）を収集します。",
        microsoftClarity:
          "ユーザーエクスペリエンスを向上させるために、匿名化されたヒートマップおよびセッションリプレイデータを収集します。",
      },
      cookies: {
        heading: "3. Cookie",
        body: "上記のサードパーティ分析サービスはCookieを設定する場合があります。これらのCookieは分析目的のみに使用され、個人を特定するものではありません。ブラウザの設定からCookieを無効にすることができます。",
      },
      dataSharing: {
        heading: "4. データの共有",
        body: "私はあなたの個人データを第三者に販売、交換、または譲渡しません。GoogleおよびMicrosoftによって収集された分析データは、それぞれのプライバシーポリシーの対象となります。",
      },
      externalLinks: {
        heading: "5. 外部リンク",
        body: "このウェブサイトには外部サイト（GitHub、LinkedIn、Mediumなど）へのリンクが含まれています。これらのサイトのプライバシー慣行について、私は責任を負いません。",
      },
      contact: {
        heading: "6. お問い合わせ",
        body: "このプライバシーポリシーについてご質問がある場合は、次の連絡先までご連絡ください：",
      },
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
        copyForLLM: "AI용 복사",
        copied: "복사됨!",
        copyLink: "섹션 링크 복사",
        copyCode: "코드 복사",
        tableOfContents: "이 글에서",
        minRead: "분 읽기",
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
    privacy: {
      title: "개인정보 처리방침",
      lastUpdated: "최종 업데이트:",
      description: "{name}의 개인 포트폴리오 웹사이트 개인정보 처리방침입니다.",
      introduction: {
        heading: "1. 소개",
        body: '이 개인정보 처리방침은 {site}의 개인 포트폴리오 웹사이트를 방문할 때 {name}("저")이 정보를 수집, 사용 및 보호하는 방법을 설명합니다.',
      },
      informationCollected: {
        heading: "2. 수집하는 정보",
        intro:
          "이 웹사이트는 개인을 식별할 수 있는 정보를 직접 수집하지 않습니다. 그러나 다음 타사 서비스가 데이터를 수집할 수 있습니다:",
        googleAnalytics:
          "방문자가 사이트를 어떻게 사용하는지 이해하는 데 도움이 되도록 익명화된 사용 데이터(페이지 조회수, 세션 시간, 유입 경로)를 수집합니다.",
        microsoftClarity:
          "사용자 경험을 개선하기 위해 익명화된 히트맵 및 세션 재생 데이터를 수집합니다.",
      },
      cookies: {
        heading: "3. 쿠키",
        body: "위에 나열된 타사 분석 서비스는 쿠키를 설정할 수 있습니다. 이 쿠키는 분석 목적으로만 사용되며 사용자를 개인적으로 식별하지 않습니다. 브라우저 설정에서 쿠키를 비활성화할 수 있습니다.",
      },
      dataSharing: {
        heading: "4. 데이터 공유",
        body: "저는 귀하의 개인 데이터를 제3자에게 판매, 교환 또는 이전하지 않습니다. Google과 Microsoft가 수집한 분석 데이터는 각각의 개인정보 처리방침의 적용을 받습니다.",
      },
      externalLinks: {
        heading: "5. 외부 링크",
        body: "이 웹사이트에는 외부 사이트(GitHub, LinkedIn, Medium 등)로 연결되는 링크가 포함되어 있습니다. 저는 해당 사이트의 개인정보 처리 관행에 대해 책임을 지지 않습니다.",
      },
      contact: {
        heading: "6. 연락처",
        body: "이 개인정보 처리방침에 대해 궁금한 점이 있으시면 다음 주소로 연락해 주세요:",
      },
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
        copyForLLM: "复制给AI",
        copied: "已复制！",
        copyLink: "复制段落链接",
        copyCode: "复制代码",
        tableOfContents: "本文内容",
        minRead: "分钟阅读",
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
    privacy: {
      title: "隐私政策",
      lastUpdated: "最后更新：",
      description: "{name}个人作品集网站的隐私政策。",
      introduction: {
        heading: "1. 引言",
        body: "本隐私政策说明了当您访问位于 {site} 的本个人作品集网站时，{name}（“我”）如何收集、使用和保护您的信息。",
      },
      informationCollected: {
        heading: "2. 我收集的信息",
        intro:
          "本网站不会直接收集任何个人身份信息。但是，以下第三方服务可能会收集数据：",
        googleAnalytics:
          "收集匿名化的使用数据（页面浏览量、会话时长、来源渠道），以帮助我了解访问者如何使用本网站。",
        microsoftClarity:
          "收集匿名化的热力图和会话回放数据，以改善用户体验。",
      },
      cookies: {
        heading: "3. Cookie",
        body: "上述第三方分析服务可能会设置 Cookie。这些 Cookie 仅用于分析目的，不会识别您的个人身份。您可以通过浏览器设置禁用 Cookie。",
      },
      dataSharing: {
        heading: "4. 数据共享",
        body: "我不会将您的个人数据出售、交换或转让给第三方。Google 和 Microsoft 收集的分析数据受其各自隐私政策的约束。",
      },
      externalLinks: {
        heading: "5. 外部链接",
        body: "本网站包含指向外部网站（GitHub、LinkedIn、Medium 等）的链接。我对这些网站的隐私惯例概不负责。",
      },
      contact: {
        heading: "6. 联系方式",
        body: "如果您对本隐私政策有任何疑问，可以通过以下方式联系我：",
      },
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
        copyForLLM: "Копировать для AI",
        copied: "Скопировано!",
        copyLink: "Скопировать ссылку на раздел",
        copyCode: "Скопировать код",
        tableOfContents: "В этой статье",
        minRead: "мин чтения",
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
    privacy: {
      title: "Политика конфиденциальности",
      lastUpdated: "Последнее обновление:",
      description:
        "Политика конфиденциальности персонального сайта-портфолио {name}.",
      introduction: {
        heading: "1. Введение",
        body: "Настоящая политика конфиденциальности объясняет, как {name} («я», «меня» или «мой») собирает, использует и защищает информацию, когда вы посещаете этот персональный сайт-портфолио по адресу {site}.",
      },
      informationCollected: {
        heading: "2. Информация, которую я собираю",
        intro:
          "Этот сайт не собирает напрямую никакой информации, позволяющей установить личность. Однако следующие сторонние сервисы могут собирать данные:",
        googleAnalytics:
          "Собирает анонимизированные данные об использовании (просмотры страниц, продолжительность сеанса, источник перехода), чтобы помочь мне понять, как посетители используют сайт.",
        microsoftClarity:
          "Собирает анонимизированные данные тепловых карт и записей сеансов для улучшения пользовательского опыта.",
      },
      cookies: {
        heading: "3. Файлы cookie",
        body: "Перечисленные выше сторонние аналитические сервисы могут устанавливать файлы cookie. Эти файлы cookie используются исключительно в аналитических целях и не идентифицируют вас лично. Вы можете отключить файлы cookie в настройках вашего браузера.",
      },
      dataSharing: {
        heading: "4. Передача данных",
        body: "Я не продаю, не обмениваю и не передаю ваши персональные данные третьим лицам. Аналитические данные, собираемые Google и Microsoft, регулируются их соответствующими политиками конфиденциальности.",
      },
      externalLinks: {
        heading: "5. Внешние ссылки",
        body: "Этот сайт содержит ссылки на внешние ресурсы (GitHub, LinkedIn, Medium и др.). Я не несу ответственности за практики конфиденциальности этих сайтов.",
      },
      contact: {
        heading: "6. Контакты",
        body: "Если у вас есть вопросы об этой политике конфиденциальности, вы можете связаться со мной по адресу:",
      },
    },
  },
};
