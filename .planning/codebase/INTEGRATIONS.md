# External Integrations

**Analysis Date:** 2026-02-27

## Analytics & Tracking

**Google Analytics (GA4):**
- What: Page view and event tracking (CV downloads, button clicks, external links, file downloads)
- Component: `components/shared/GoogleAnalytics.tsx`
- Helper: `lib/analytics.ts` - typed event helpers (`trackCVDownload`, `trackButtonClick`, `trackExternalLink`, `trackFileDownload`)
- Auth: `NEXT_PUBLIC_GA_MEASUREMENT_ID` env var
- Pattern: Injects `gtag` script; `window.gtag` / `window.dataLayer` calls

**Google Tag Manager (GTM):**
- What: Tag container for managing third-party scripts without deploys
- Components: `components/shared/GoogleTagManager.tsx` - separate Head and Body components
- Auth: `NEXT_PUBLIC_GTM_ID` env var
- Loaded in: `app/layout.tsx` (head) and `components/shared/ClientProviders.tsx` (body noscript)

**Microsoft Clarity:**
- What: Session recording and heatmap analytics
- Component: `components/shared/MicrosoftClarity.tsx`
- Auth: `NEXT_PUBLIC_CLARITY_PROJECT_ID` env var
- Loaded in: `app/layout.tsx` head

## File Hosting

**GitHub Raw / GitHub:**
- What: CV/PDF file downloads proxied through `/api/download` for security
- Allowed hosts: `raw.githubusercontent.com`, `github.com`
- Route: `app/api/download/route.ts`
- Pattern: Client fetches `/api/download?url=<encoded-github-url>`, server validates domain + HTTPS + content-type + size (10MB max), proxies download

## Fonts

**Google Fonts:**
- What: Geist Sans and Geist Mono font families
- Loaded via: `next/font/google` in `app/layout.tsx`
- Preconnect: `fonts.googleapis.com` and `fonts.gstatic.com` (preconnect links in head)
- Display: `swap`, preload enabled

## Social / External Links

**WhatsApp:**
- What: Direct contact via floating action button
- Pattern: `https://wa.me/{phoneNumber}` links in `components/shared/FloatingActionMenu.tsx`
- No API key required

**LinkedIn, GitHub, Medium, X (Twitter):**
- What: Social profile links in footer and JSON-LD `sameAs`
- Pattern: Static URLs in `content/{lang}/profile.json` → rendered in `components/layout/Footer.tsx` and `components/shared/JsonLd.tsx`

## Content Storage

**Local JSON Files:**
- What: All profile content and SEO metadata
- Location: `content/{lang}/profile.json` and `content/{lang}/metadata.json` (13 language directories)
- Loader: `lib/i18n/server-content-loader.ts` - Node.js `fs.readFile` at build/request time
- No external CMS or database

## Data Storage

**Databases:** None - entirely static/file-based content

**File Storage:** Local filesystem (`public/` directory) for images, CV PDF, and PWA assets

**Caching:** In-memory rate limit map in `lib/rate-limit.ts` (comment notes Redis recommended for production)

## Authentication & Identity

**Auth Provider:** None - no authentication layer (public portfolio)

## SEO & Crawling

**Sitemap:** `app/sitemap.ts` - auto-generated at build, covers all 13 language routes + resume routes
**robots.txt:** `app/robots.ts` - allows all crawlers including AI crawlers (GPTBot, Claude-Web, PerplexityBot, Bytespider, etc.)
**JSON-LD:** `components/shared/JsonLd.tsx` - Person, ProfilePage, WebSite, BreadcrumbList, BlogPosting schemas

## Monitoring & Observability

**Error Tracking:** None (no Sentry or similar)

**Logs:**
- Client: `console.error` for download failures
- Server: `pino` + `pino-pretty` available via `lib/logger/index.ts` (structured JSON logging)

## CI/CD & Deployment

**Hosting:** Vercel (implied by `NEXT_PUBLIC_SITE_URL` pattern; Dockerfile also present for self-hosting)

**CI Pipeline:** Not detected in repository (no `.github/workflows/` found)

## Webhooks & Callbacks

**Incoming:** None

**Outgoing:** None

## Environment Configuration

**Required env vars:**
- `NEXT_PUBLIC_SITE_URL` - Canonical URL (required for sitemap, metadata, OG images)
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` - Optional; analytics disabled if absent
- `NEXT_PUBLIC_GTM_ID` - Optional; GTM disabled if absent
- `NEXT_PUBLIC_CLARITY_PROJECT_ID` - Optional; Clarity disabled if absent

**Secrets location:** `.env` file (gitignored); `.env.example` for documentation

---

*Integration audit: 2026-02-27*
