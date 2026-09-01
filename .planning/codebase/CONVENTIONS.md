# Coding Conventions

**Analysis Date:** 2026-02-27

## Naming Patterns

**Files:**
- React components: PascalCase `.tsx` (`Header.tsx`, `FloatingActionMenu.tsx`, `CVDownloadButton.tsx`)
- shadcn/ui primitives: lowercase kebab `.tsx` (`button.tsx`, `dropdown-menu.tsx`)
- Utility modules: lowercase kebab `.ts` (`rate-limit.ts`, `server-content-loader.ts`, `metadata-utils.ts`)
- Next.js special files: lowercase (`layout.tsx`, `page.tsx`, `route.ts`, `sitemap.ts`, `robots.ts`)

**Functions:**
- camelCase for all functions (`getProfile`, `buildMetadataWithAbsoluteUrls`, `withSecurity`, `trackCVDownload`)
- Named exports preferred over default exports for components (exception: Next.js pages/layouts require default exports)
- HOF pattern for security: `withSecurity(handler)` returns a wrapped handler

**Variables:**
- camelCase for runtime values (`languageCodes`, `defaultLanguage`, `siteUrl`, `profileData`)
- UPPER_SNAKE_CASE for `as const` object constants (`PLACEHOLDER_URLS`, `ALLOWED_HOSTS`, `ALLOWED_CONTENT_TYPES`)

**Types/Interfaces:**
- PascalCase (`Profile`, `SEOMetadata`, `SkillCategory`, `SkillItem`, `Language`, `Translations`)
- Interface over type alias for object shapes (per CLAUDE.md: "better extensibility")
- Enum for finite value sets (`SkillLevel.EXPERT / PROFICIENT / FAMILIAR`)

**React Components:**
- Props interface named `{ComponentName}Props` (`HeaderProps`, `SkillsProps`, `FloatingActionMenuProps`)
- Destructure props in function signature

## Code Style

**Formatter:** Biome 2.3.8 (`biome.json`)
- Indent: 2 spaces
- Line width: 80 characters
- Quotes: double (`"`)
- Semicolons: always

**Linting:**
- Biome recommended rules enabled
- `noNonNullAssertion`: off (non-null assertions used freely with `!`)
- `noExplicitAny`: warn (avoid `any`; use typed generics or `unknown`)
- `noArrayIndexKey`: off (array index keys used in JSX maps)
- `noDangerouslySetInnerHtml`: off (used for JSON-LD and lang script injection with documented safety rationale)
- `useButtonType`: warn (buttons should have explicit `type="button"`)
- `noStaticElementInteractions`: off

## Import Organization

**Order (Biome-enforced):**
1. Node.js built-ins (`node:fs`, `node:path`)
2. External packages (`next`, `react`, `lucide-react`)
3. Internal aliases (`@/components/...`, `@/lib/...`)

**Path Aliases:**
- `@/` maps to project root (configured in `tsconfig.json`)
- `@/components` - component imports
- `@/lib` - utility imports
- `@/content` - dynamic JSON imports in API routes

**Import style:**
- `import type { Foo }` for type-only imports
- Named imports preferred; default imports used for Next.js pages/layouts

## TypeScript Conventions

**Explicit types required:**
- All function parameters and return types on exported functions
- All component props via interface
- No implicit `any` (Biome warns)

**Type patterns:**
```typescript
// Interface for object shapes (preferred over type alias)
interface HeaderProps {
  profile: Profile;
  translations: { downloadCV: string };
  language?: string;
}

// Type alias for mapped/union types
export type Translations = { [locale: string]: { nav: {...}; ... } };

// Enum for finite sets
export enum SkillLevel {
  EXPERT = "expert",
  PROFICIENT = "proficient",
  FAMILIAR = "familiar",
}
```

**Async patterns:**
```typescript
// Server Component: params is a Promise in Next.js 15
export default async function Home({ params }: PageProps) {
  const { lang } = await params;
  const profile = await getProfile(lang);
  ...
}
```

## React Conventions

**Server vs Client Components:**
- Server Components by default - no `"use client"` directive
- Add `"use client"` only for: state (`useState`), effects (`useEffect`), event handlers, browser APIs
- Client Components: `Header`, `Footer`, `LanguageSwitcher`, `FloatingActionMenu`, `CVDownloadButton`, `ThemeToggle`, `Skills`, `Certificates`, `BlogPostCard`, `ProjectCard`, `ContentProtection`, `ClientProviders`, `GoogleTagManager`, `GoogleAnalytics`, `LordIcon`, `NoSSR`, `RadioIcon`
- Server Components: `JsonLd`, `Blog`, `Projects`, `ContactMenuWrapper`, all pages/layouts

**Component structure pattern:**
```typescript
"use client"; // only if needed

import { ... } from "@/...";

interface ComponentProps {
  prop: Type;
  optionalProp?: Type;
}

export function ComponentName({ prop, optionalProp }: ComponentProps) {
  // hooks at top
  // derived values
  // early returns for null/empty cases
  return (...);
}
```

**Props pattern:**
- Translations always passed as explicit `translations` prop object (not React context)
- Profile data passed as typed `Profile` prop (not fetched inside components)
- `className?: string` accepted on components that allow style customization

**Conditional rendering:**
- Guard at page level: `const hasBlogPosts = profile.blogPosts && profile.blogPosts.length > 0`
- Components also guard internally with early `return null`

## Styling

**Primary pattern:** Tailwind CSS utility classes

**Conditional classes:** Always use `cn()` from `lib/utils.ts`:
```typescript
import { cn } from "@/lib/utils";

className={cn(
  "base-class",
  condition && "conditional-class",
  variant === "glass" && "glass-card",
  className  // accept external className last
)}
```

**Glassmorphism design system:** Custom utility classes defined in `app/globals.css`:
- `glass` - backdrop-blur with semi-transparent background
- `glass-card` - card variant with border
- `glass-subtle` - lighter glass effect
- `glass-hover` - hover state
- `text-gradient` - gradient text effect
- `shadow-glow-sm` - glow shadow

**CSS custom properties:** Use design tokens (`--background`, `--foreground`, `--primary`, `--glass-bg`) - never raw color values inline.

**Responsive design:** Mobile-first (`sm:`, `md:`, `lg:` breakpoints)

**Dark mode:** `dark:` Tailwind variant; controlled by `next-themes` toggling `.dark` class on `<html>`

## Error Handling

**API routes:**
```typescript
// Typed error responses with HTTP status codes
return NextResponse.json({ error: "URL is required" }, { status: 400 });

// withSecurity catches unhandled errors and returns 500 without leaking internals
export const GET = withSecurity(downloadHandler);
```

**Client components:**
```typescript
// try/catch with console.error; no user-facing error message for async failures
try {
  const response = await fetch(...);
  if (!response.ok) throw new Error("Download failed");
  ...
} catch (error) {
  console.error("Failed to download CV:", error);
}
```

**Null/empty guards:**
```typescript
// Early return null when nothing to render
if (!hasEmail && !hasPhone) return null;
if (!skills || skills.length === 0) return null;
```

## Logging

**Framework:** Pino (`lib/logger/index.ts`) - available for structured logging

**Patterns:**
- `console.error` for client-side caught exceptions
- `console.error("API Error:", error)` inside the security wrapper
- No `console.log` in production code

## Comments

**When to comment:**
- Inline JSON injection (JSON-LD scripts): always document that content is static build-time data, not user input
- Security constants: document rationale (`ALLOWED_HOSTS`, `MAX_FILE_SIZE`)
- Non-obvious decisions: brief explanation
- Known limitations: e.g., "use Redis in production" on the in-memory rate limiter

**JSDoc/TSDoc:** Not used - TypeScript interfaces serve as documentation

## Module Design

**Exports:**
- Named exports for all components and utilities
- Exception: Next.js pages, layouts, and API route handlers use `export default` / `export const GET`

**Barrel files:** Not used - import directly from the source file path

**Pure modules:** `lib/` files have no React dependencies - importable from server or client contexts

## Git Conventions

**Branches:** `[type]/[description]` (e.g., `feat/contact-form`, `fix/og-image`)

**Commits:** Conventional Commits format (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`)

**Hooks:**
- `.claude/hooks/conventional-commits.py` - enforces commit message format
- `.claude/hooks/block-dangerous-git.sh` - blocks destructive git operations

---

*Convention analysis: 2026-02-27*
