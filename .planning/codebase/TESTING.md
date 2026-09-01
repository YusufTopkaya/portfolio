# Testing Patterns

**Analysis Date:** 2026-02-27

## Test Framework

**Runner:** None - no automated test framework is installed or configured.

No `jest.config.*`, `vitest.config.*`, `playwright.config.*`, or test runner package detected in `package.json`.

**Run Commands:**
```bash
npm run build      # Primary correctness check - must pass before any commit
npm run check:fix  # Biome lint + format - enforced on all .ts/.tsx/.json/.css files
npm run lint       # Next.js ESLint check
```

## Test File Organization

**Location:** No test files found in the repository (no `*.test.*` or `*.spec.*` files).

**Current verification strategy:**
- Build success (`npm run build`) serves as the integration test - catches TypeScript errors, missing imports, invalid JSON, and rendering failures across all 13 language static pages
- Biome lint (`npm run check:fix`) catches code quality issues
- Visual inspection in browser (`npm run dev`)

## Test Types

**Unit Tests:** Not implemented

**Integration Tests:** Not implemented

**E2E Tests:** Not implemented

**Type Checking:**
- TypeScript strict mode via `tsconfig.json`
- Build-time type errors surface during `npm run build`
- All interfaces explicitly typed in `lib/i18n/content-loader.ts`

## What Acts as Test Coverage Today

**Static Generation (build-time):**
- All 13 language pages rendered statically during `npm run build`
- Missing translation keys cause TypeScript errors (via typed `Translations` object)
- Malformed `profile.json` or `metadata.json` causes JSON parse errors at build time
- Type mismatch between `Profile` interface and JSON content surfaces as build error

**Biome Linting:**
- Catches `noExplicitAny`, undefined variables, unused imports, incorrect hook usage (warns)
- Enforces consistent formatting, preventing style drift

**Runtime Guards:**
- API routes validate inputs (`lib/validation.ts`, `lib/security-wrapper.ts`)
- Components guard against empty/null data with early returns
- `ErrorBoundary` catches client-side React render errors

## Coverage Gaps

**All application logic is untested by automated tests:**
- `lib/validation.ts` - sanitizeString, validateURL, validateAndSanitizeInput
- `lib/rate-limit.ts` - rateLimit, getClientIP
- `lib/cors.ts` - setCorsHeaders, handleCorsPreflightResponse
- `lib/analytics.ts` - all tracking helpers
- `lib/i18n/metadata-utils.ts` - buildMetadataWithAbsoluteUrls, extractKeywordsFromProfile
- `lib/i18n/config.ts` - isValidLanguage, getLanguageByCode, formatDate
- `lib/content-protection.ts` - all protection utilities
- `app/api/download/route.ts` - download handler logic
- `app/api/og-profile/route.ts` - profile API handler
- All React components - rendering, conditional logic, event handlers

## Recommended Test Setup (if adding tests)

**Framework choice:** Vitest (compatible with Vite/Turbopack ecosystem; fast, TypeScript-native)

**Priority areas to test first:**
1. `lib/validation.ts` - security-critical; pure functions, easy to unit test
2. `lib/rate-limit.ts` - security-critical; pure functions
3. `lib/i18n/config.ts` - isValidLanguage, getLanguageByCode
4. `lib/i18n/metadata-utils.ts` - metadata building logic
5. API routes via `app/api/download/route.ts` - integration tests with mocked fetch

**Suggested install:**
```bash
npm install -D vitest @vitejs/plugin-react
```

**Suggested config:** `vitest.config.ts` at project root

**Suggested file placement:** Co-located with source files (`lib/validation.test.ts` next to `lib/validation.ts`)

---

*Testing analysis: 2026-02-27*
