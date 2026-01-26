# Architecture Overview

## Directory Structure

```
app/
├── [lang]/                → Internationalized routes (dynamic segment)
│   ├── page.tsx           → Home page with all sections
│   ├── resume/            → Resume/CV page
│   │   └── page.tsx       → CV with PDF download
│   └── layout.tsx         → Language-specific layout with providers
├── api/                   → API routes
│   ├── og/                → Dynamic Open Graph image generation
│   └── pdf/               → CV PDF download endpoint
├── sitemap.ts             → Dynamic multilingual sitemap
├── robots.ts              → SEO robots configuration
└── layout.tsx             → Root layout with metadata

components/
├── ui/                    → Shadcn UI primitives (Button, Card, etc.)
├── sections/              → Page sections (Hero, Skills, Projects, Blog, Contact)
├── layout/                → Header, Footer, Navigation
└── shared/                → Cross-cutting utilities
    ├── ThemeToggle.tsx    → Dark/light mode switch
    ├── LordIcon.tsx       → Animated icons
    ├── LanguageSwitcher/  → i18n language picker
    └── CVDownload/        → Reusable download button

content/
├── en/                    → English content
├── tr/                    → Turkish content
├── de/                    → German content
└── ...                    → 12 languages total

lib/
├── i18n/                  → Content loading utilities
│   ├── config.ts          → Supported locales, default locale
│   └── content.ts         → JSON content loaders
├── utils.ts               → cn() utility, formatters
└── validation.ts          → Input validation (contact form)

public/
├── images/                → Static images
├── icons/                 → Favicon, app icons
└── fonts/                 → Custom fonts (if any)
```

## Data Flow

1. **Request** → Next.js App Router receives request with `[lang]` parameter
2. **Middleware** → `middleware.ts` validates locale, redirects if needed
3. **Server Component** → Loads content from `content/{lang}/*.json`
4. **Render** → Server-renders HTML with hydration markers
5. **Client** → Minimal JS hydration for interactive components only

## Key Patterns

### Server Component Data Loading
```tsx
// app/[lang]/page.tsx
export default async function Page({ params }: Props) {
  const { lang } = await params;
  const content = await getContent(lang);
  return <HomePage content={content} />;
}
```

### Client Component Isolation
```tsx
// components/shared/ThemeToggle.tsx
"use client";
// Only this component ships JS to client
```

### Content Type Safety
```typescript
// lib/i18n/types.ts
interface HomeContent {
  hero: HeroContent;
  skills: SkillsContent;
  // ... type-safe content structure
}
```

## Deployment Architecture

```
GitHub (main) → Vercel → CDN Edge
                  ↓
            Preview URLs (PRs)
```

- **Build**: Static generation with ISR where needed
- **Edge**: Deployed to Vercel Edge Network
- **CDN**: Static assets cached at edge locations
