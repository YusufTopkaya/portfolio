# Codebase Structure

**Analysis Date:** 2026-02-27

## Directory Layout

```
portfolio/
├── app/                        # Next.js App Router root
│   ├── [lang]/                 # Internationalized routes (all 13 languages)
│   │   ├── layout.tsx          # Lang layout: metadata, lang attr, ContactMenuWrapper
│   │   ├── page.tsx            # Home page: profile sections
│   │   └── resume/
│   │       └── page.tsx        # Resume/CV viewer page
│   ├── api/
│   │   ├── download/
│   │   │   └── route.ts        # Secure file proxy (CV downloads)
│   │   └── og-profile/
│   │       └── route.ts        # Profile JSON API for OG image
│   ├── og-preview/
│   │   └── page.tsx            # OG image preview page (disallowed in robots.txt)
│   ├── globals.css             # Global CSS, Tailwind directives, CSS custom properties, glassmorphism
│   ├── layout.tsx              # Root layout: HTML shell, fonts, GTM, Clarity, ClientProviders
│   ├── robots.ts               # robots.txt generation
│   └── sitemap.ts              # sitemap.xml generation
├── components/
│   ├── layout/
│   │   ├── Header.tsx          # Profile hero: name, photo, CV download, language/theme switcher
│   │   └── Footer.tsx          # Social links, copyright
│   ├── sections/
│   │   ├── Blog.tsx            # Blog posts section (Server Component wrapper)
│   │   ├── Certificates.tsx    # Certificates section
│   │   ├── Projects.tsx        # Projects grid section
│   │   └── Skills.tsx          # Skills section (categorized or simple array)
│   ├── shared/
│   │   ├── ClientProviders.tsx # ErrorBoundary + ContentProtection + ThemeProvider + GTM body
│   │   ├── ContactMenuWrapper.tsx  # Server wrapper for FloatingActionMenu
│   │   ├── ContentProtection.tsx   # Client: image/devtools/text-selection protection
│   │   ├── CVDownloadButton.tsx    # Client: CV download with analytics tracking
│   │   ├── ErrorBoundary.tsx       # React error boundary
│   │   ├── FloatingActionMenu.tsx  # Client: FAB with email/WhatsApp contact
│   │   ├── GoogleAnalytics.tsx     # GA4 script injection
│   │   ├── GoogleTagManager.tsx    # GTM head + body scripts
│   │   ├── JsonLd.tsx              # Server: schema.org JSON-LD injection
│   │   ├── LordIcon.tsx            # Lordicon animated icon component
│   │   ├── MicrosoftClarity.tsx    # Client: Clarity tracking script
│   │   ├── NoSSR.tsx               # SSR suppression wrapper
│   │   ├── OptimizedImage.tsx      # next/image wrapper with objectFit prop
│   │   ├── RadioIcon.tsx           # Custom SVG radio icon
│   │   ├── ThemeProvider.tsx       # next-themes provider wrapper
│   │   └── ThemeToggle.tsx         # Dark/light/system theme switcher button
│   ├── ui/
│   │   ├── DynamicIcon.tsx     # Lucide icon dynamic loader by name string
│   │   ├── button.tsx          # shadcn/ui Button (includes "glass" variant)
│   │   ├── card.tsx            # shadcn/ui Card
│   │   ├── dropdown-menu.tsx   # shadcn/ui DropdownMenu (Radix)
│   │   ├── input.tsx           # shadcn/ui Input
│   │   └── textarea.tsx        # shadcn/ui Textarea
│   ├── BlogPostCard.tsx        # Blog post card component
│   ├── LanguageSwitcher.tsx    # Language dropdown switcher
│   └── ProjectCard.tsx         # Project card component
├── content/
│   ├── en/                     # English content (default language)
│   │   ├── profile.json        # Profile data: personalInfo, skills, projects, blog, certificates, socialLinks
│   │   └── metadata.json       # SEO metadata: title, description, keywords, OG, Twitter
│   ├── tr/                     # Turkish
│   ├── de/                     # German
│   ├── fr/                     # French
│   ├── es/                     # Spanish
│   ├── nl/                     # Dutch
│   ├── pt/                     # Portuguese
│   ├── it/                     # Italian
│   ├── pl/                     # Polish
│   ├── ja/                     # Japanese
│   ├── ko/                     # Korean
│   ├── zh/                     # Chinese (Simplified)
│   └── ru/                     # Russian
├── lib/
│   ├── i18n/
│   │   ├── config.ts           # Language registry, languageCodes, defaultLanguage, helper fns
│   │   ├── content-loader.ts   # TypeScript interfaces: Profile, SEOMetadata, SkillCategory, etc.
│   │   ├── metadata-utils.ts   # buildMetadataWithAbsoluteUrls, extractKeywordsFromProfile
│   │   ├── server-content-loader.ts  # fs.readFile loaders: getProfile(), getSEOMetadata()
│   │   └── translations.ts     # UI strings for all 13 locales (Translations type + const)
│   ├── logger/
│   │   └── index.ts            # Pino logger instance
│   ├── analytics.ts            # GA4/GTM event helpers
│   ├── constants.ts            # Shared constants (placeholder image URLs)
│   ├── content-protection.ts   # Browser content protection utilities
│   ├── cors.ts                 # CORS header utilities
│   ├── rate-limit.ts           # In-memory rate limiting
│   ├── security-wrapper.ts     # withSecurity() HOF for API routes
│   ├── utils.ts                # cn() utility (clsx + tailwind-merge)
│   └── validation.ts           # Input sanitization and URL validation
├── public/
│   ├── files/                  # Static files (cv.pdf)
│   ├── icons/                  # Icon assets
│   └── images/                 # Profile photo, project images, blog post images (webp/svg)
├── scripts/
│   ├── create-languages.ts     # CLI tool: add new language, list languages
│   └── setup-claude.sh         # AI assistant setup script
├── specs/
│   └── 001-glassmorphism-design/  # Feature spec with checklists and contracts
├── docs/
│   └── claude/                 # Architecture/pattern docs for AI assistants
├── biome.json                  # Biome linter/formatter config
├── components.json             # shadcn/ui config
├── package.json                # Dependencies and scripts
├── tailwind.config.ts          # Tailwind configuration
└── tsconfig.json               # TypeScript configuration
```

## Directory Purposes

**`app/[lang]/`:**
- Purpose: All internationalized user-facing pages
- Contains: Layouts and pages for home + resume routes
- Key files: `page.tsx` (home), `layout.tsx` (lang wrapper), `resume/page.tsx`

**`components/layout/`:**
- Purpose: Page-level structural components used on every page
- Contains: `Header.tsx`, `Footer.tsx`

**`components/sections/`:**
- Purpose: Content sections rendered conditionally based on profile data
- Contains: `Blog.tsx`, `Projects.tsx`, `Skills.tsx`, `Certificates.tsx`
- Pattern: Each accepts typed `profile`/data props + `translations` prop

**`components/shared/`:**
- Purpose: Cross-cutting utility components (analytics, auth wrappers, theme, contact)
- Contains: Providers, tracking scripts, error boundaries, floating buttons

**`components/ui/`:**
- Purpose: shadcn/ui design system primitives (copy-pasted, owned by project)
- Contains: Button, Card, Input, Textarea, DropdownMenu, DynamicIcon

**`content/`:**
- Purpose: All editable site content - no code changes needed to update profile
- Contains: 13 language directories × 2 JSON files each (profile + metadata)
- Generated: No - manually maintained; `scripts/create-languages.ts` scaffolds new languages

**`lib/i18n/`:**
- Purpose: Complete i18n system: types, loaders, config, UI strings, metadata builders
- Note: Two translation systems coexist - `translations.ts` for UI chrome, `content/{lang}/` for profile data

**`lib/`:**
- Purpose: Shared utilities with no UI dependencies
- Note: All pure TypeScript, no React imports

## Key File Locations

**Entry Points:**
- `app/layout.tsx` - Root HTML shell
- `app/[lang]/layout.tsx` - Language-scoped layout
- `app/[lang]/page.tsx` - Home page (most traffic)

**Configuration:**
- `biome.json` - Code style (formatter + linter)
- `tailwind.config.ts` - Design tokens and theme
- `lib/i18n/config.ts` - Language registry (add new languages here first)
- `components.json` - shadcn/ui settings

**Core Logic:**
- `lib/i18n/content-loader.ts` - All data type definitions
- `lib/i18n/server-content-loader.ts` - Profile/metadata file readers
- `lib/i18n/translations.ts` - UI string translations
- `lib/security-wrapper.ts` - API security HOF

**Content:**
- `content/en/profile.json` - Reference/default profile (English)
- `content/{lang}/profile.json` - Per-language profile data

## Naming Conventions

**Files:**
- React components: PascalCase (`Header.tsx`, `CVDownloadButton.tsx`, `FloatingActionMenu.tsx`)
- Utilities/lib: camelCase (`server-content-loader.ts`, `rate-limit.ts`, `metadata-utils.ts`)
- shadcn/ui primitives: lowercase kebab (`button.tsx`, `dropdown-menu.tsx`)
- Next.js special files: lowercase (`layout.tsx`, `page.tsx`, `route.ts`, `sitemap.ts`, `robots.ts`)

**Directories:**
- Kebab-case for multi-word (`og-preview/`, `og-profile/`)
- lowercase single-word (`sections/`, `shared/`, `layout/`, `ui/`)
- Language codes (`en/`, `tr/`, `de/`, etc.)

**TypeScript:**
- Interfaces: PascalCase (`Profile`, `SEOMetadata`, `SkillCategory`)
- Enums: PascalCase with UPPER_SNAKE values (`SkillLevel.EXPERT`)
- Functions: camelCase (`getProfile`, `buildMetadataWithAbsoluteUrls`, `withSecurity`)
- Constants: camelCase (`languageCodes`, `defaultLanguage`) or UPPER_SNAKE for objects (`PLACEHOLDER_URLS`)

## Where to Add New Code

**New profile section (e.g., "Awards"):**
1. Add type to `lib/i18n/content-loader.ts` → `Profile` interface
2. Add data to `content/{lang}/profile.json` for all 13 languages
3. Add UI strings to `lib/i18n/translations.ts` for all 13 locales
4. Create `components/sections/Awards.tsx`
5. Import and conditionally render in `app/[lang]/page.tsx`

**New page route:**
- Add under `app/[lang]/your-route/page.tsx`
- Add `generateStaticParams()` returning `languageCodes.map(lang => ({ lang }))`
- Add to `app/sitemap.ts`

**New API endpoint:**
- Create `app/api/your-endpoint/route.ts`
- Wrap handler with `withSecurity` from `lib/security-wrapper.ts`

**New UI component:**
- Shared utility: `components/shared/YourComponent.tsx`
- Page section: `components/sections/YourSection.tsx`
- shadcn/ui primitive: `components/ui/your-component.tsx`

**New language:**
- Run `npm run lang:add` (uses `scripts/create-languages.ts`)
- Add language definition to `lib/i18n/config.ts` → `languages` array
- Add UI strings to `lib/i18n/translations.ts`
- Create `content/{lang}/profile.json` and `content/{lang}/metadata.json`

**Shared utilities:**
- Pure helpers: `lib/utils.ts` or a new `lib/{name}.ts`
- Analytics events: `lib/analytics.ts`

## Special Directories

**`.planning/codebase/`:**
- Purpose: AI-generated codebase analysis documents
- Generated: Yes (by gsd-codebase-mapper)
- Committed: Yes (reference for AI agents)

**`.claude/`:**
- Purpose: Claude AI assistant configuration (agents, commands, hooks, rules)
- Generated: No
- Committed: Yes

**`.agents/skills/`:**
- Purpose: Reusable AI agent skills for Vercel/React best practices and web design guidelines
- Generated: No
- Committed: Yes

**`.specify/`:**
- Purpose: Feature specification templates and memory
- Generated: No (templates); Yes (generated specs)
- Committed: Yes

**`specs/`:**
- Purpose: Feature specifications with checklists and contracts
- Generated: Partially
- Committed: Yes

**`public/`:**
- Purpose: Static assets served at root URL
- Generated: No
- Committed: Yes (images, CV PDF, icons, PWA manifest)

---

*Structure analysis: 2026-02-27*
