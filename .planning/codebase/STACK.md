# Technology Stack

**Analysis Date:** 2026-02-27

## Languages

**Primary:**
- TypeScript 5.x - All application code (`app/`, `components/`, `lib/`, `scripts/`)
- CSS - Global styles and Tailwind utilities (`app/globals.css`)

**Secondary:**
- JSON - Content and translation files (`content/{lang}/profile.json`, `content/{lang}/metadata.json`)
- Shell - Setup scripts (`scripts/setup-claude.sh`, `.specify/scripts/bash/`)

## Runtime

**Environment:**
- Node.js 20.x (`@types/node: ^20`)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Next.js ^15.5.7 - Full-stack React framework with App Router
- React ^19.0.1 - UI library (Server Components by default)

**Build/Dev:**
- Turbopack - Development bundler (`npm run dev` uses `next dev --turbopack`)
- PostCSS ^8 - CSS processing (`postcss.config.*`)
- Tailwind CSS ^3.4.1 - Utility-first CSS framework

## Key Dependencies

**UI:**
- shadcn/ui (shadcn-ui ^0.9.4) - Component library via copy-paste pattern
- `@radix-ui/react-dropdown-menu` ^2.1.6 - Accessible dropdown primitives
- `@radix-ui/react-icons` ^1.3.2 - Icon set
- `@radix-ui/react-slot` ^1.1.2 - Slot primitive for asChild pattern
- lucide-react ^0.474.0 - Icon library
- class-variance-authority ^0.7.1 - Component variant management
- clsx ^2.1.1 - Conditional class utility
- tailwind-merge ^3.0.1 - Tailwind class deduplication
- tailwindcss-animate ^1.0.7 - Animation utilities

**i18n:**
- next-intl ^3.26.3 - Internationalization for App Router (installed but custom loader is primary pattern)

**Theming:**
- next-themes ^0.4.4 - Dark/light/system theme management

**Icons/Animation:**
- `@lordicon/react` ^1.11.0 - Animated Lottie icons
- lottie-web ^5.13.0 - Lottie animation runtime
- simple-icons ^16.6.0 - Brand icon SVG paths

**PWA:**
- next-pwa ^5.6.0 - Progressive Web App support with manifest

**Logging:**
- pino ^10.1.0 - Structured logging
- pino-pretty ^13.1.2 - Development log formatting

**Tooling:**
- tsx - TypeScript execution for scripts (`npx tsx scripts/create-languages.ts`)

## Configuration

**Environment:**
- Configured via `.env` (not committed); `.env.example` documents required variables
- Key required vars:
  - `NEXT_PUBLIC_GA_MEASUREMENT_ID` - Google Analytics GA4 ID
  - `NEXT_PUBLIC_GTM_ID` - Google Tag Manager ID
  - `NEXT_PUBLIC_CLARITY_PROJECT_ID` - Microsoft Clarity project ID
  - `NEXT_PUBLIC_SITE_URL` - Canonical site URL for metadata and sitemap
  - `ANALYZE` - Bundle analysis toggle
  - `NODE_ENV` - Runtime environment

**Build:**
- `next.config.*` - Next.js configuration
- `tailwind.config.ts` - Tailwind configuration
- `biome.json` - Linter/formatter configuration
- `tsconfig.json` - TypeScript configuration
- `components.json` - shadcn/ui component configuration

**Linting/Formatting:**
- Biome 2.3.8 - Single tool replacing ESLint + Prettier
  - 2-space indentation, 80-char line width
  - Double quotes, always semicolons
  - Recommended rules enabled; `noNonNullAssertion` and `noExplicitAny` relaxed to warn/off
- ESLint ^9 with `eslint-config-next` - Next.js specific rules (secondary)

## Platform Requirements

**Development:**
- Node.js 20+
- `npm run dev` - Turbopack dev server
- `npm run check:fix` - Biome lint + format

**Production:**
- Vercel (primary deployment target implied by `NEXT_PUBLIC_SITE_URL` pattern)
- Docker support via `Dockerfile` and `.dockerignore`
- PWA-capable via `next-pwa` and `/manifest.json`

---

*Stack analysis: 2026-02-27*
