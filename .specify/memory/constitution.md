<!--
╔═══════════════════════════════════════════════════════════════════════════════╗
║                           SYNC IMPACT REPORT                                  ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║ Version change: 0.0.0 → 1.0.0 (MAJOR - initial constitution ratification)     ║
║                                                                               ║
║ Added Principles:                                                             ║
║   • I. Type Safety First                                                      ║
║   • II. Server-First Architecture                                             ║
║   • III. Internationalization Excellence                                      ║
║   • IV. Simplicity & YAGNI                                                    ║
║   • V. Performance by Default                                                 ║
║                                                                               ║
║ Added Sections:                                                               ║
║   • Code Quality Standards                                                    ║
║   • Technology Constraints                                                    ║
║   • Development Workflow                                                      ║
║   • Governance                                                                ║
║                                                                               ║
║ Templates requiring updates:                                                  ║
║   • .specify/templates/plan-template.md      ✅ Compatible (Constitution Check)║
║   • .specify/templates/spec-template.md      ✅ Compatible                     ║
║   • .specify/templates/tasks-template.md     ✅ Compatible                     ║
║                                                                               ║
║ Follow-up TODOs: None                                                         ║
╚═══════════════════════════════════════════════════════════════════════════════╝
-->

# Portfolio (senrecep.dev) Constitution

## Core Principles

### I. Type Safety First

All code MUST use explicit TypeScript types. This principle exists because implicit type inference caused production bugs in previous iterations.

**Non-negotiable rules:**
- MUST use explicit types; avoid implicit inference via `var`
- MUST NOT use `any` type under any circumstance
- MUST prefer `interface` over `type` for object definitions (better extensibility, clearer error messages)
- MUST define return types on all exported functions

**Rationale:** Strong typing catches errors at compile time, not runtime. The portfolio serves as a professional showcase and MUST be error-free.

### II. Server-First Architecture

React Server Components (RSC) are the default. Client components MUST be justified.

**Non-negotiable rules:**
- MUST use Server Components by default for better performance and smaller bundles
- MUST add `"use client"` directive only when browser APIs are required
- MUST NOT use `useEffect` for data fetching; use Server Components instead
- MUST minimize client-side JavaScript to improve Core Web Vitals

**Rationale:** Server Components reduce bundle size, improve SEO, and provide faster initial page loads—critical for a portfolio site where first impressions matter.

### III. Internationalization Excellence

The portfolio MUST maintain first-class support for 12+ languages with type-safe translations.

**Non-negotiable rules:**
- MUST store all translatable content in `content/{lang}/*.json` files
- MUST use type-safe translation keys that fail at build time if missing
- MUST implement English fallback for any missing translations
- MUST maintain translation parity across all supported languages
- MUST follow the Translation Glossary at `content/TRANSLATION_GLOSSARY.md`

**Rationale:** As a multilingual portfolio serving a global audience, translation quality directly impacts professional credibility in each market.

### IV. Simplicity & YAGNI

Every feature MUST be directly requested. No speculative abstractions.

**Non-negotiable rules:**
- MUST NOT create new files if the task can be completed in an existing file
- MUST NOT add error handling for scenarios that cannot occur
- MUST NOT add abstractions beyond what is explicitly requested
- MUST NOT add comments to unchanged code
- MUST NOT add docstrings, type annotations, or refactors beyond the task scope
- MUST prefer three similar lines over a premature abstraction

**Rationale:** Over-engineering creates maintenance burden. A portfolio is a finite, well-understood domain—complexity serves no one.

### V. Performance by Default

Every change MUST maintain or improve performance metrics.

**Non-negotiable rules:**
- MUST use mobile-first responsive design (most portfolio visitors are mobile)
- MUST use Tailwind tokens over hardcoded values for theme consistency
- MUST use the `cn()` utility for conditional class merging
- MUST optimize images for AVIF/WebP with proper sizing
- MUST NOT introduce render-blocking resources
- MUST maintain Core Web Vitals scores (LCP < 2.5s, FID < 100ms, CLS < 0.1)

**Rationale:** Performance directly impacts SEO rankings and user experience. A slow portfolio loses opportunities.

## Code Quality Standards

### Linting & Formatting

- MUST use Biome for all linting and formatting (single tool, faster than ESLint + Prettier)
- MUST run `npm run check:fix` before committing
- MUST NOT disable linting rules without documented justification

### Component Architecture

- MUST use Shadcn UI components (copy-paste, no black-box dependencies)
- MUST colocate component styles using Tailwind classes
- MUST organize components by domain: `ui/`, `sections/`, `layout/`, `shared/`

### File Organization

```
app/[lang]/     → Internationalized routes
components/     → React components by category
content/{lang}/ → JSON content per language
lib/            → Utilities, i18n loaders, validation
```

## Technology Constraints

| Category | Constraint | Version |
|----------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 15.x |
| Language | TypeScript | 5.x |
| UI Library | React (Server Components) | 19.x |
| Styling | Tailwind CSS | 3.4.x |
| Components | Shadcn UI + Radix UI | Latest |
| i18n | next-intl | Latest |
| Linting | Biome | Latest |

**Dependency Policy:**
- MUST NOT add new dependencies without documented justification
- MUST prefer built-in Next.js features over third-party libraries
- MUST audit dependencies quarterly for security vulnerabilities

## Development Workflow

### Branching Strategy

- `main` is the production branch; MUST always be deployable
- Feature branches MUST follow pattern: `[type]/[description]` (e.g., `feat/add-contact-form`)

### Quality Gates

Before merge, code MUST:
1. Pass `npm run build` without errors
2. Pass `npm run check:fix` without violations
3. Maintain existing test coverage (if tests exist)
4. Be reviewed for constitution compliance

### Deployment

- Automatic deployment via Vercel on `main` branch merges
- Preview deployments for all pull requests
- MUST verify Core Web Vitals on preview before merge

## Governance

This constitution is the authoritative source for development practices in the senrecep.dev portfolio project.

### Authority

- Constitution principles SUPERSEDE all other documentation when conflicts arise
- All pull requests MUST verify compliance with applicable principles
- Complexity beyond these principles MUST be explicitly justified in PR description

### Amendment Process

1. Propose change via pull request to this file
2. Document rationale and migration plan for breaking changes
3. Update dependent templates if principles change
4. Increment version according to semantic versioning:
   - **MAJOR**: Principle removal or incompatible redefinition
   - **MINOR**: New principle or materially expanded guidance
   - **PATCH**: Clarifications, wording, non-semantic refinements

### Compliance Review

- Run `/lighthouse` command to verify performance principles
- Review code against CLAUDE.md conventions
- Check translation completeness across all languages

### Reference Documents

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Runtime development guidance |
| `SCRATCHPAD.md` | External memory for ongoing work |
| `content/TRANSLATION_GLOSSARY.md` | Translation terminology standards |

**Version**: 1.0.0 | **Ratified**: 2025-01-21 | **Last Amended**: 2025-01-21
