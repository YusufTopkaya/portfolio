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
};
