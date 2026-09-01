# Codebase Concerns

**Analysis Date:** 2026-02-27

## Tech Debt

**In-memory rate limiting not suitable for production:**
- Issue: `lib/rate-limit.ts` uses a `Map<string, number[]>` stored in Node.js process memory
- Files: `lib/rate-limit.ts`, `lib/security-wrapper.ts`, `app/api/download/route.ts`
- Impact: Rate limit state is lost on server restart; does not work across multiple server instances (Vercel serverless = new instance per request); effective rate limiting is non-functional at scale
- Fix approach: Replace with Redis-based rate limiter (e.g., `@upstash/ratelimit` + Vercel KV) or rely on Vercel's built-in edge rate limiting

**Two parallel translation systems:**
- Issue: UI strings live in `lib/i18n/translations.ts` (typed TypeScript object), while profile content lives in `content/{lang}/profile.json`. Adding a new UI string requires editing `translations.ts` for all 13 locales manually; no tooling enforces completeness.
- Files: `lib/i18n/translations.ts`, `content/{lang}/profile.json`
- Impact: Easy to miss a locale when adding new UI strings; translation drift between locales is not detected at build time for `translations.ts` (only for the typed `Translations` type)
- Fix approach: Add a build-time validation script that checks all 13 locale keys exist in `translations.ts` with non-empty values; or consolidate into a single system (move UI strings into `content/{lang}/`)

**CORS allows only first origin in array:**
- Issue: `lib/cors.ts` `setCorsHeaders` always sets `Access-Control-Allow-Origin` to `allowedOrigins[0]` regardless of the actual request origin. Multi-origin CORS is not properly implemented.
- Files: `lib/cors.ts`
- Impact: If multiple origins need to be allowed, only the first is ever set; in practice there is only one site URL so this is low impact today
- Fix approach: Read `Origin` header from request, check against allowed list, set dynamically

**Hardcoded company URL in JSON-LD:**
- Issue: `components/shared/JsonLd.tsx` line 64 hardcodes `"url": "https://taptoweb.com"` for the employer organization
- Files: `components/shared/JsonLd.tsx`
- Impact: Cannot reuse this portfolio template without editing source code; breaks template portability
- Fix approach: Add `companyUrl` field to `content/{lang}/profile.json` `personalInfo`

**Hardcoded `dateCreated` and `dateModified` in JSON-LD:**
- Issue: `components/shared/JsonLd.tsx` has `dateCreated: "2025-01-01"` and `dateModified: "2026-02-15"` as string literals
- Files: `components/shared/JsonLd.tsx`
- Impact: Must be manually updated; incorrect dates reduce structured data quality
- Fix approach: Drive from `content/{lang}/metadata.json` or derive from `app/sitemap.ts` `lastModified`

**Hardcoded `lastModified` in sitemap:**
- Issue: `app/sitemap.ts` uses `const lastModified = new Date("2026-02-15")` - a hardcoded date
- Files: `app/sitemap.ts`
- Impact: Sitemap always reports the same last-modified date regardless of actual content changes; search engines may deprioritize crawling
- Fix approach: Derive from git commit date or a field in `content/{lang}/metadata.json`

## Security Considerations

**IP spoofing in rate limiter:**
- Risk: `lib/rate-limit.ts` `getClientIP` trusts `x-forwarded-for` header directly; this header can be spoofed by clients not behind a trusted proxy
- Files: `lib/rate-limit.ts`
- Current mitigation: Rate limiting is functional but bypassable via IP spoofing
- Recommendations: On Vercel, use `x-vercel-forwarded-for` or extract IP from Vercel's edge context; never trust raw `x-forwarded-for` from untrusted sources

**Content protection is easily bypassed:**
- Risk: `lib/content-protection.ts` blocks F12/right-click/devtools shortcuts in JavaScript - trivially bypassed by disabling JavaScript, using browser menu, or DevTools protocol
- Files: `lib/content-protection.ts`, `components/shared/ContentProtection.tsx`
- Current mitigation: Feature is opt-in (`enableSecurity: false` by default); drag-to-scroll is the primary use
- Recommendations: Do not rely on this for any actual security; it is a UX courtesy only

**Phone number exposed in profile JSON:**
- Risk: `content/en/profile.json` contains a real phone number (`phoneNumber`) which is served via `/api/og-profile` and embedded in JSON-LD; phone number is publicly indexed
- Files: `content/en/profile.json`, `components/shared/JsonLd.tsx`, `app/api/og-profile/route.ts`
- Current mitigation: Intentional - used for WhatsApp contact button
- Recommendations: Acceptable if intentional; document that `phoneNumber` field is public

## Performance Bottlenecks

**`translations.ts` loads all 13 locales into every bundle:**
- Problem: `lib/i18n/translations.ts` exports a single `translations` object containing all 13 locale string sets; this entire object is imported in every page
- Files: `lib/i18n/translations.ts`
- Cause: Static import; no code splitting by locale
- Improvement path: Split into per-locale files (`lib/i18n/translations/en.ts`, etc.) and dynamically import only the active locale

**Skills component uses array index as React key:**
- Problem: `components/sections/Skills.tsx` uses `key={categoryIndex}` and `key={skillIndex}` in `.map()` calls
- Files: `components/sections/Skills.tsx`
- Cause: Skill items and categories have no stable unique identifier in the JSON schema
- Improvement path: Low priority for static content; add `id` field to skill categories in `profile.json` if reordering becomes needed

## Fragile Areas

**`content/{lang}/profile.json` schema validation:**
- Files: `content/en/profile.json` (and all 13 locale copies)
- Why fragile: JSON files are parsed with `JSON.parse` at runtime with no schema validation; a typo or missing required field causes a build error or runtime crash with a generic error message
- Safe modification: Always validate against `lib/i18n/content-loader.ts` `Profile` interface mentally; run `npm run build` after any JSON change
- Test coverage: Zero automated tests; build is the only guard

**`LanguageSwitcher` path construction:**
- Files: `components/LanguageSwitcher.tsx`
- Why fragile: Language switching logic must correctly derive the target path when navigating between locales; if route structure changes (e.g., adding a new page), the switcher may navigate to the wrong path
- Safe modification: Test language switching after any routing change

**`next-pwa` compatibility with Next.js 15:**
- Files: `package.json` (`next-pwa: ^5.6.0`)
- Why fragile: `next-pwa` ^5.6.0 was built for Next.js 12/13; Next.js 15 compatibility is not guaranteed and may produce build warnings or broken service worker behaviour
- Safe modification: Test PWA features (offline, install prompt) after Next.js upgrades

## Scaling Limits

**Static JSON content:**
- Current capacity: All content is in static JSON files; scales infinitely for reads
- Limit: Adding a new language requires: updating `lib/i18n/config.ts`, `lib/i18n/translations.ts`, creating `content/{lang}/profile.json` and `content/{lang}/metadata.json`, and rebuilding
- Scaling path: `npm run lang:add` script automates scaffolding; process is manageable up to ~20-30 languages

## Dependencies at Risk

**`next-pwa` ^5.6.0:**
- Risk: Last major release targets Next.js 12/13; project uses Next.js 15. No official Next.js 15 support confirmed
- Impact: PWA manifest and service worker may not generate correctly
- Migration plan: Replace with `@ducanh2912/next-pwa` (maintained fork with Next.js 13+ support) or use Next.js native PWA approach

**`shadcn-ui` ^0.9.4 (the CLI package):**
- Risk: `shadcn-ui` is a CLI tool, not a runtime dependency - it should be in `devDependencies`, not `dependencies`
- Impact: Included in production bundle unnecessarily (minor)
- Migration plan: Move `shadcn-ui` to `devDependencies` in `package.json`

## Missing Critical Features

**No automated testing:**
- Problem: Zero unit, integration, or E2E tests
- Blocks: Safe refactoring of security-critical code (`validation.ts`, `rate-limit.ts`); confidence in i18n completeness
- Priority: High for `lib/validation.ts` and `lib/rate-limit.ts`

**No error reporting:**
- Problem: No Sentry or equivalent; client-side errors are swallowed by `ErrorBoundary` with no reporting
- Blocks: Visibility into production errors
- Priority: Medium

**No missing translation detection for `translations.ts`:**
- Problem: TypeScript catches missing keys in the `Translations` type, but partial objects (empty strings) are not caught
- Blocks: Translation quality assurance for new languages
- Priority: Medium

## Test Coverage Gaps

**Security utilities (High priority):**
- What's not tested: `lib/validation.ts` - URL validation, input sanitization; `lib/rate-limit.ts` - rate limiting logic
- Files: `lib/validation.ts`, `lib/rate-limit.ts`
- Risk: Regressions in security-critical code go undetected
- Priority: High

**i18n config helpers (Medium priority):**
- What's not tested: `lib/i18n/config.ts` - `isValidLanguage`, `getLanguageByCode`, `formatDate`; `lib/i18n/metadata-utils.ts` - `buildMetadataWithAbsoluteUrls`, `extractKeywordsFromProfile`
- Files: `lib/i18n/config.ts`, `lib/i18n/metadata-utils.ts`
- Risk: Metadata or hreflang built incorrectly; silent SEO degradation
- Priority: Medium

**API route handlers (Medium priority):**
- What's not tested: `app/api/download/route.ts` - domain validation, size limits, content-type enforcement; `app/api/og-profile/route.ts` - language validation
- Files: `app/api/download/route.ts`, `app/api/og-profile/route.ts`
- Risk: Security regressions in file proxy logic
- Priority: Medium

---

*Concerns audit: 2026-02-27*
