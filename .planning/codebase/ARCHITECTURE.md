# Architecture

**Analysis Date:** 2026-02-27

## Pattern Overview

**Overall:** Static-First Internationalized Portfolio with App Router

**Key Characteristics:**
- All pages are statically generated at build time (`export const dynamic = "force-static"`)
- Content is stored as JSON files per language; no database or CMS
- Server Components are the default; Client Components are used only for interactivity
- i18n is implemented via URL-based routing (`/[lang]/`) with static params generation
- Two parallel translation systems: `content/{lang}/profile.json` for profile data, `lib/i18n/translations.ts` for UI strings

## Layers

**Routing Layer:**
- Purpose: URL routing and page generation
- Location: `app/`
- Contains: Layouts, pages, API routes, sitemap, robots
- Depends on: Content layer, i18n config
- Used by: Next.js App Router

**Content Layer:**
- Purpose: Profile data and SEO metadata per language
- Location: `content/{lang}/profile.json`, `content/{lang}/metadata.json`
- Contains: Personal info, skills, projects, blog posts, certificates, social links
- Depends on: Nothing (pure JSON)
- Used by: Server content loader, API routes

**i18n Layer:**
- Purpose: Language configuration, UI string translations, content loading, metadata building
- Location: `lib/i18n/`
- Contains:
  - `config.ts` - Language registry (13 languages), helper functions
  - `translations.ts` - UI strings for all 13 locales (typed `Translations` object)
  - `content-loader.ts` - TypeScript interfaces (`Profile`, `SEOMetadata`, `SkillCategory`, etc.)
  - `server-content-loader.ts` - Node.js `fs.readFile` loader for `profile.json` and `metadata.json`
  - `metadata-utils.ts` - Next.js Metadata building, hreflang, OG image URL resolution, keyword extraction
- Depends on: `content/` files
- Used by: Pages, layouts, API routes

**Component Layer:**
- Purpose: UI rendering
- Location: `components/`
- Contains: Layout components, section components, shared utilities, shadcn/ui primitives
- Depends on: i18n layer, lib utilities
- Used by: Pages

**Library Layer:**
- Purpose: Cross-cutting utilities
- Location: `lib/`
- Contains: `utils.ts` (cn), `analytics.ts`, `security-wrapper.ts`, `validation.ts`, `rate-limit.ts`, `cors.ts`, `content-protection.ts`, `constants.ts`, `logger/`
- Depends on: Nothing external (pure utilities)
- Used by: Components, API routes

**API Layer:**
- Purpose: Server-side endpoints
- Location: `app/api/`
- Contains:
  - `download/route.ts` - Secure file proxy (CV download from GitHub)
  - `og-profile/route.ts` - Profile JSON endpoint for OG image generation
- Depends on: `lib/security-wrapper.ts`, `lib/validation.ts`, `lib/i18n/config.ts`
- Used by: Client components (`CVDownloadButton`)

## Data Flow

**Page Render (Static Generation at Build):**
1. Next.js calls `generateStaticParams()` → returns all 13 `lang` codes
2. `generateMetadata({ params })` fetches `metadata.json` + `profile.json` via `server-content-loader.ts`
3. `buildMetadataWithAbsoluteUrls()` constructs hreflang alternates and OG image URLs
4. Page component fetches `profile.json` and accesses `translations[lang]` for UI strings
5. Profile data passed as typed props to section components: `Header`, `Blog`, `Projects`, `Certificates`, `Skills`, `Footer`
6. `JsonLd` component renders schema.org structured data inline

**CV Download Flow:**
1. User clicks `CVDownloadButton` (Client Component)
2. If URL starts with `http`, intercepts click → `fetch(/api/download?url=...)`
3. API route: validates URL domain (github only), checks size, proxies blob
4. Client creates object URL → triggers browser download → revokes URL

**Theme Flow:**
1. `ClientProviders` wraps app in `NextThemesProvider` (stored in `localStorage` as `theme`)
2. `ThemeToggle` component reads/sets theme via `next-themes`
3. CSS custom properties switch between light and dark palettes via `.dark` class on `<html>`

**Language Switch Flow:**
1. `LanguageSwitcher` component (Client) renders dropdown of all 13 languages
2. Selection navigates to `/{lang}/` equivalent of current path
3. Next.js serves pre-built static page for that language

## Key Abstractions

**Profile (data model):**
- Purpose: Typed shape of per-language content
- Definition: `lib/i18n/content-loader.ts` - `Profile`, `SEOMetadata`, `SkillCategory`, `SkillItem`, `Project`, `BlogPost`, `Certificate`, `Skill` interfaces
- Examples: `content/en/profile.json`, `content/tr/profile.json`
- Pattern: Read at build time by server loader; passed as props through component tree

**Translations (UI strings):**
- Purpose: Typed UI string map keyed by language code
- Definition: `lib/i18n/translations.ts` - `Translations` type + `translations` const
- Pattern: `const t = translations[lang]` in page/layout; strings passed as `translations` prop to components

**Language Config:**
- Purpose: Single source of truth for supported languages
- Definition: `lib/i18n/config.ts` - `languages` array, `languageCodes`, `defaultLanguage = "en"`, helper functions
- Pattern: `generateStaticParams()` maps `languageCodes`; `isValidLanguage()` guards API routes

**Security Wrapper:**
- Purpose: Composable middleware for API route security
- Definition: `lib/security-wrapper.ts` - `withSecurity(handler)` HOF
- Pattern: `export const GET = withSecurity(downloadHandler)` - applies rate limiting, CORS, security headers

**cn() Utility:**
- Purpose: Conditional Tailwind class merging
- Definition: `lib/utils.ts`
- Pattern: `cn("base-class", condition && "conditional-class", className)` in every component

## Entry Points

**Root Layout:**
- Location: `app/layout.tsx`
- Triggers: Every request
- Responsibilities: HTML shell, Geist fonts, GTM head script, Microsoft Clarity, `ClientProviders` wrapper

**Lang Layout:**
- Location: `app/[lang]/layout.tsx`
- Triggers: All `/{lang}/*` routes
- Responsibilities: Per-language metadata, sets `document.documentElement.lang`, mounts `ContactMenuWrapper`

**Home Page:**
- Location: `app/[lang]/page.tsx`
- Triggers: `/{lang}/` route
- Responsibilities: Static params generation, metadata, profile data fetch, section rendering

**Resume Page:**
- Location: `app/[lang]/resume/page.tsx`
- Triggers: `/{lang}/resume` route
- Responsibilities: CV PDF iframe embed, download button, JSON-LD BreadcrumbList + DigitalDocument

## Error Handling

**Strategy:** Minimal - portfolio is static content; errors are surfaced as empty states or console logs

**Patterns:**
- `ErrorBoundary` (`components/shared/ErrorBoundary.tsx`) wraps all client content via `ClientProviders`
- API routes return typed JSON error objects with appropriate HTTP status codes
- CV download failure: `console.error` only, no user-facing error message
- Missing CV URL: Resume page renders "Resume not found" message inline
- `withSecurity` wrapper catches unhandled errors, returns 500 without leaking internals

## Cross-Cutting Concerns

**Logging:** Pino (`lib/logger/index.ts`) available for structured logging; `console.error` used directly in most places

**Validation:** `lib/validation.ts` - `sanitizeString`, `validateAndSanitizeInput`, `validateURL` used exclusively in API routes

**Authentication:** None

**Content Protection:** `lib/content-protection.ts` + `components/shared/ContentProtection.tsx` - optional client-side protection (image right-click prevention, devtools blocking, text selection prevention); drag-to-scroll enabled by default

**SEO:** Comprehensive - Next.js Metadata API, JSON-LD (Person/WebSite/ProfilePage/BreadcrumbList/BlogPosting schemas), hreflang alternates for all 13 languages, sitemap with `x-default`, robots.txt with AI crawler rules

---

*Architecture analysis: 2026-02-27*
