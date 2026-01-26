# Portfolio Template

A modern, internationalized personal portfolio website template built with Next.js 15.5, React 19, and TailwindCSS. Features a clean, responsive design with support for multiple languages, dark/light themes, and comprehensive SEO optimizations.

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

- JSON-LD structured data (Person + WebSite schema)
- Automatic sitemap generation with alternates
- Canonical URLs and hreflang tags
- Image optimization (AVIF/WebP)
- LCP optimization with preloading
- Static page generation (SSG)
- GZIP compression

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
│   ├── og-preview/        # OG Banner generator tool
│   ├── layout.tsx         # Root layout
│   ├── sitemap.ts         # Dynamic sitemap
│   └── robots.ts          # Robots.txt
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
- **hreflang**: Automatic language alternates
- **Sitemap**: Dynamic sitemap with language alternates
- **Meta Tags**: OpenGraph, Twitter Card
- **Canonical URLs**: Automatic canonical URL generation
- **OG Banners**: Language-specific social media images

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
