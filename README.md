# Portfolio Template

A modern, internationalized personal portfolio website template built with Next.js 15.5, React 19, and TailwindCSS. Features a clean, responsive design with support for multiple languages, dark/light themes, and comprehensive SEO optimizations — including AI discoverability (GEO) features for LLM citation and AI crawler indexing.

## Features

### Core

- Next.js 15.5 with App Router and Turbopack
- React 19 with Server Components
- TypeScript for type safety
- TailwindCSS with shadcn/ui components

### Internationalization

- Multi-language support (easily extendable)
- Built-in support for 15+ languages
- Automatic language detection from browser
- hreflang tags for SEO
- Localized metadata and content
- **Language creation script** for easy expansion

### SEO & Performance

- JSON-LD structured data (Person + WebSite + Article/TechArticle schema)
- FAQPage schema for AI citation (add `faq` to blog frontmatter)
- `speakable` property for voice and AI systems
- Automatic sitemap generation with alternates
- Canonical URLs and hreflang tags
- Image optimization (AVIF/WebP)
- LCP optimization with preloading
- Static page generation (SSG)
- GZIP compression

### AI Discoverability & GEO

- **llms.txt** — Machine-readable profile summary for AI language models (GPT, Claude, Gemini, Perplexity)
- **llms-full.txt** — Extended AI context file with complete professional profile
- **/.well-known/ai.txt** — AI crawler discovery standard (ai.txt spec)
- **/.well-known/ai.json** — Structured JSON profile for AI systems
- **RSS Feed** (`/feed.xml`) — Blog content distribution with hreflang support
- **robots.txt** — Explicit allowlist for 20+ AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.)
- **Article JSON-LD** — BlogPosting + BreadcrumbList + FAQPage schema on every blog post
- **Dynamic hreflang** — Blog posts only reference languages with actual translated content
- **sitemap.xml** — Includes AI discovery files alongside standard pages

### Blog System

- Markdown-based blog with frontmatter metadata
- Server-side rendering for SEO
- Article/TechArticle JSON-LD schema per post
- FAQPage schema (add `faq` to frontmatter)
- Automatic reading time calculation
- Copy-to-clipboard code blocks (mobile-friendly)
- Anchor links on all headings
- Table of contents support
- External link security (`rel="noopener noreferrer"`)
- RSS feed with hreflang support
- Dynamic hreflang based on available translations

### Analytics & Tracking

- Google Analytics 4 integration
- Google Tag Manager integration
- Microsoft Clarity user behavior analytics

### Developer Experience

- Biome for fast linting and formatting
- ESLint with Next.js config
- Docker support with standalone output
- Pino logger for structured logging
- OG Banner preview tool for generating social media images

### Security

- Security headers (HSTS, X-Frame-Options, etc.)
- Input validation and sanitization
- Rate limiting support

## Tech Stack

| Category   | Technology             |
| ---------- | ---------------------- |
| Framework  | Next.js 15.5           |
| UI Library | React 19               |
| Styling    | TailwindCSS 3.4        |
| Components | shadcn/ui, Radix UI    |
| Icons      | Lucide React, Lordicon |
| Linting    | Biome 2.3, ESLint 9    |
| Language   | TypeScript 5           |

## Quick Start

See [SETUP.md](SETUP.md) for detailed setup instructions.

### Prerequisites

- Node.js 20.x or later
- npm, yarn, or pnpm

### Installation

1. Fork or clone the repository:

```bash
git clone https://github.com/yourusername/portfolio.git
cd portfolio
```

2. Install dependencies:

```bash
npm install
```

3. Create environment variables:

```bash
cp .env.example .env.local
```

4. Configure your environment variables in `.env.local`:

```bash
NEXT_PUBLIC_SITE_URL="https://yourdomain.com"
NEXT_PUBLIC_GA_MEASUREMENT_ID="G-XXXXXXXXXX"
NEXT_PUBLIC_GTM_ID="GTM-XXXXXXXX"
NEXT_PUBLIC_CLARITY_PROJECT_ID="XXXXXXXXXX"
```

> **Note:** `NEXT_PUBLIC_SITE_URL` is required for AI discovery files (`llms.txt`, `llms-full.txt`, `/.well-known/ai.txt`, `/.well-known/ai.json`) to generate correct absolute URLs.

5. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view your site.

## Available Scripts

| Script               | Description                             |
| -------------------- | --------------------------------------- |
| `npm run dev`        | Start development server with Turbopack |
| `npm run build`      | Build for production                    |
| `npm run start`      | Start production server                 |
| `npm run lint`       | Run Next.js ESLint                      |
| `npm run lint:biome` | Run Biome linter                        |
| `npm run format`     | Format code with Biome                  |
| `npm run check`      | Run Biome check (lint + format)         |
| `npm run check:fix`  | Auto-fix Biome issues                   |
| `npm run lang:add`   | Add new language(s) support             |
| `npm run lang:list`  | List all supported languages            |
| `npm run lang:help`  | Show language script help               |

## Project Structure

```
portfolio/
├── app/                    # Next.js App Router
│   ├── [lang]/            # Language-specific routes
│   ├── api/               # API routes
│   ├── llms.txt/          # AI-readable profile summary (route handler)
│   ├── llms-full.txt/     # Extended AI context file (route handler)
│   ├── og-preview/        # OG Banner generator tool
│   ├── layout.tsx         # Root layout
│   ├── sitemap.ts         # Dynamic sitemap
│   └── robots.ts          # Robots.txt with AI crawler allowlist
├── components/
│   ├── layout/            # Layout components (Header, Footer)
│   ├── sections/          # Page sections (Blog, Projects, Skills)
│   ├── shared/            # Shared components (JsonLd, OptimizedImage)
│   └── ui/                # UI primitives (Button, Card, etc.)
├── content/               # Multilingual content
│   ├── en/               # English (default)
│   └── tr/               # Turkish (example)
├── lib/
│   ├── i18n/             # Internationalization utilities
│   ├── logger/           # Pino logger configuration
│   └── utils.ts          # Utility functions
├── public/
│   ├── .well-known/      # AI discovery files (ai.txt, ai.json)
│   ├── files/            # Downloadable files (CV)
│   └── images/           # Static images
├── scripts/
│   └── create-languages.ts # Language creation script
├── biome.json            # Biome configuration
├── next.config.js        # Next.js configuration
└── tailwind.config.ts    # Tailwind configuration
```

## Adding Languages

Use the built-in script to add new language support:

```bash
# Add single language
npm run lang:add -- fr

# Add multiple languages
npm run lang:add -- de es it

# List all supported languages
npm run lang:list
```

The script automatically:

- Creates `content/{lang}/` directory with template files
- Updates `lib/i18n/config.ts` with language configuration
- Updates `lib/i18n/translations.ts` with UI translations

### Supported Languages

| Code | Language   | Native Name |
| ---- | ---------- | ----------- |
| en   | English    | English     |
| tr   | Turkish    | Türkçe      |
| de   | German     | Deutsch     |
| fr   | French     | Français    |
| es   | Spanish    | Español     |
| nl   | Dutch      | Nederlands  |
| pt   | Portuguese | Português   |
| it   | Italian    | Italiano    |
| pl   | Polish     | Polski      |
| ja   | Japanese   | 日本語      |
| ko   | Korean     | 한국어      |
| zh   | Chinese    | 简体中文    |
| ar   | Arabic     | العربية     |
| ru   | Russian    | Русский     |
| hi   | Hindi      | हिन्दी      |

## Content Management

Content is managed through JSON files:

- `content/{lang}/profile.json` - Personal info, skills, projects, blog posts
- `content/{lang}/metadata.json` - SEO metadata, OpenGraph, Twitter Card

### profile.json Structure

```json
{
  "personalInfo": {
    "name": "Your Name",
    "position": "Your Position",
    "company": "Your Company",
    "about": "Brief description...",
    "imageUrl": "/images/profile.webp",
    "cv": { "url": "/files/cv.pdf", "fileName": "Name - CV.pdf" }
  },
  "skills": [...],
  "certificates": [...],
  "projects": [...],
  "blogPosts": [...],
  "socialLinks": [...]
}
```

## Analytics Setup

### Google Analytics 4

1. Create a GA4 property at [analytics.google.com](https://analytics.google.com/)
2. Get your Measurement ID (G-XXXXXXXXXX)
3. Add to `.env.local`: `NEXT_PUBLIC_GA_MEASUREMENT_ID="G-XXXXXXXXXX"`

### Google Tag Manager

1. Create a container at [tagmanager.google.com](https://tagmanager.google.com/)
2. Get your Container ID (GTM-XXXXXXXX)
3. Add to `.env.local`: `NEXT_PUBLIC_GTM_ID="GTM-XXXXXXXX"`

### Microsoft Clarity

1. Create a project at [clarity.microsoft.com](https://clarity.microsoft.com/)
2. Get your Project ID
3. Add to `.env.local`: `NEXT_PUBLIC_CLARITY_PROJECT_ID="XXXXXXXXXX"`

## Deployment

### Docker

Build and run with Docker:

```bash
docker build -t portfolio .
docker run -p 3000:3000 portfolio
```

### Vercel

Deploy to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/portfolio)

### Manual Deployment

```bash
npm run build
npm run start
```

## SEO Features

- **Structured Data**: JSON-LD Person and WebSite schemas
- **Article JSON-LD**: BlogPosting + TechArticle schema on every blog post
- **FAQPage Schema**: AI citation support via `faq` frontmatter field
- **hreflang**: Automatic language alternates
- **Sitemap**: Dynamic sitemap with language alternates
- **Meta Tags**: OpenGraph, Twitter Card
- **Canonical URLs**: Automatic canonical URL generation
- **OG Banners**: Language-specific social media images
- **`speakable`**: Property for voice assistants and AI systems

### OG Banner Generator

A built-in tool for creating OpenGraph banner images for all languages:

1. Start the development server: `npm run dev`
2. Navigate to [http://localhost:3000/og-preview](http://localhost:3000/og-preview)
3. Select language, take screenshot, convert to WebP
4. Save to `public/images/og-banner.{lang}.webp`

## Customization

### Styling

- Edit `app/globals.css` for global styles
- Modify `tailwind.config.ts` for theme customization
- Update component styles in respective files

### Adding New Sections

1. Create component in `components/sections/`
2. Import and use in `app/[lang]/page.tsx`
3. Add necessary data to `profile.json`

## Customization Guide

### 1. Update Your Profile

Edit `content/en/profile.json` with your personal information:
- `personalInfo`: Name, position, company, contact details
- `socialLinks`: Your social media profiles
- `projects`: Your notable projects
- `blogPosts`: Links to your blog posts (Medium, Dev.to, etc.)

For other languages, edit `content/{locale}/profile.json`.

### 2. Configure AI Discovery

Update these files with your information:
- `public/.well-known/ai.txt` — Your name, description, and links
- `public/.well-known/ai.json` — Structured profile for AI systems
- `app/llms.txt/route.ts` — Profile summary for AI language models
- `app/llms-full.txt/route.ts` — Extended profile for deep AI context

### 3. Add Blog Posts

Create markdown files in `content/blog/en/`:

```yaml
---
title: "Your Post Title"
description: "SEO meta description"
date: "2026-01-01"
slug: "your-post-slug"
mediumUrl: "https://medium.com/@you/your-post"
imageUrl: "/images/your-post.webp"
keywords: ["keyword1", "keyword2"]
author: "Your Name"
category: "Tutorial"
faq:
  - q: "Common question about your post topic?"
    a: "Detailed answer that AI systems can cite."
---
Your content here...
```

### 4. Set Environment Variables

Copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SITE_URL` — Your production domain (e.g., `https://yourname.dev`)
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` — Google Analytics ID
- `NEXT_PUBLIC_GTM_ID` — Google Tag Manager ID
- `NEXT_PUBLIC_CLARITY_PROJECT_ID` — Microsoft Clarity ID

### 5. Replace Images

- `public/images/profile.webp` — Your profile photo (recommended: 400x400px)
- `public/images/og-banner.*.webp` — OG banners per language (1200x630px)
- Blog post images in `public/images/`

## Updating from Upstream

If you forked this template and want to get updates from the main repository without losing your personal content, follow this safe merge strategy:

### Setup Upstream Remote (One-time)

```bash
# Add the original repository as upstream
git remote add upstream https://github.com/senrecep/portfolio.git

# Verify remotes
git remote -v
```

### Safe Update Strategy

**Important:** Never use `git merge upstream/main` or `git rebase upstream/main` directly - this will overwrite your personal content!

Instead, selectively pull only the files you want:

```bash
# Fetch latest changes from upstream
git fetch upstream

# See what changed
git diff HEAD upstream/main --name-status

# Selectively checkout specific files (safe - won't touch your content)
git checkout upstream/main -- components/sections/Projects.tsx
git checkout upstream/main -- components/sections/Skills.tsx
git checkout upstream/main -- scripts/create-languages.ts
git checkout upstream/main -- package.json
# ... add more files as needed

# Commit the updates
git commit -m "feat: sync selected updates from upstream"
```

### Files Safe to Update

These files can typically be updated without losing personal data:

| Category      | Files                                                                |
| ------------- | -------------------------------------------------------------------- |
| Components    | `components/sections/*.tsx`, `components/ui/*.tsx`                   |
| Configuration | `package.json`, `next.config.js`, `biome.json`, `tailwind.config.ts` |
| Scripts       | `scripts/*.ts`                                                       |
| Documentation | `README.md`, `SETUP.md`, `CONTRIBUTING.md`                           |
| API Routes    | `app/api/**/*.ts`                                                    |
| Middleware    | `middleware.ts`                                                      |
| Styles        | `app/globals.css`                                                    |

### Files to NEVER Update from Upstream

These contain your personal content - never overwrite them:

| Category    | Files                                                                            |
| ----------- | -------------------------------------------------------------------------------- |
| Content     | `content/**/*.json` (profile.json, metadata.json)                                |
| Images      | `public/images/profile.webp`, `public/images/og-banner.*.webp`                   |
| Files       | `public/files/cv.pdf`                                                            |
| i18n Config | `lib/i18n/config.ts`, `lib/i18n/translations.ts` (if you added custom languages) |
| AI Discovery | `public/.well-known/ai.txt`, `public/.well-known/ai.json`                       |

### Example: Full Safe Update

```bash
# 1. Fetch upstream
git fetch upstream

# 2. Update safe files
git checkout upstream/main -- \
  components/sections/Projects.tsx \
  components/sections/Skills.tsx \
  components/sections/Certificates.tsx \
  components/sections/Blog.tsx \
  components/layout/Header.tsx \
  components/layout/Footer.tsx \
  app/robots.ts \
  middleware.ts \
  package.json \
  scripts/create-languages.ts

# 3. Install any new dependencies
npm install

# 4. Test the build
npm run build

# 5. Commit if everything works
git commit -m "feat: sync updates from upstream template"
```

### Resolving Conflicts

If you've modified a file that also changed upstream:

```bash
# Option 1: Keep your version
git checkout --ours path/to/file

# Option 2: Take upstream version
git checkout upstream/main -- path/to/file

# Option 3: Manual merge - view both versions
git diff HEAD upstream/main -- path/to/file
```

### Marking Upstream as Merged (Without Taking Changes)

If you want to tell Git that you've "seen" the upstream changes but prefer to keep your own version (preventing future merge prompts for those changes):

```bash
# This creates a merge commit but keeps ALL your content unchanged
git merge -s ours upstream/main -m "chore: mark upstream as merged (keeping local content)"
```

**When to use this:**
- You've reviewed upstream changes and decided they don't apply to your fork
- You want a clean git history without "branch is behind" warnings
- You've manually cherry-picked the changes you wanted

**What it does:**
- Creates a merge commit (so Git thinks upstream is merged)
- Preserves 100% of your current content (nothing changes)
- Future `git merge upstream/main` won't re-apply those changes

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Biome](https://biomejs.dev/)
- [Radix UI](https://www.radix-ui.com/)
