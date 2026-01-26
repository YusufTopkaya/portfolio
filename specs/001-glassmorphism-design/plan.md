# Implementation Plan: Glassmorphism Design System Enhancement

**Branch**: `001-glassmorphism-design` | **Date**: 2026-01-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-glassmorphism-design/spec.md`

## Summary

Transform the portfolio site's visual design to Apple Liquid Glass aesthetic with neutral-based color palette, high transparency glass effects, and refined interactions. This is a pure CSS/styling update affecting existing components without backend changes.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: Next.js 15.x, React 19.x, Tailwind CSS 3.4.x, Shadcn UI
**Storage**: N/A (visual-only changes)
**Testing**: Visual regression via browser testing, `npm run build` for compilation
**Target Platform**: Web (modern evergreen browsers - Chrome, Firefox, Safari, Edge)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: LCP < 2.5s, FID < 100ms, CLS < 0.1 (maintain existing Core Web Vitals)
**Constraints**: Must support `prefers-reduced-motion`, fallback for browsers without `backdrop-filter`
**Scale/Scope**: ~15 components to update, 2 theme modes (light/dark)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Type Safety First | ✅ PASS | No new TypeScript code; CSS variables only |
| II. Server-First Architecture | ✅ PASS | Styling changes don't affect RSC/client split |
| III. Internationalization Excellence | ✅ PASS | Visual changes are language-agnostic |
| IV. Simplicity & YAGNI | ✅ PASS | Extending existing CSS system, no new abstractions |
| V. Performance by Default | ⚠️ WATCH | Must verify backdrop-filter doesn't degrade performance |

**Biome Compliance**: Run `npm run check:fix` after all changes
**Build Verification**: Run `npm run build` to ensure no compilation errors

## Project Structure

### Documentation (this feature)

```text
specs/001-glassmorphism-design/
├── plan.md              # This file
├── research.md          # Phase 0 output - Apple Liquid Glass research
├── data-model.md        # Phase 1 output - CSS variable definitions
├── quickstart.md        # Phase 1 output - Implementation guide
├── contracts/           # Phase 1 output - Design tokens specification
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
app/
├── [lang]/              # Internationalized routes (no changes needed)
├── globals.css          # PRIMARY: CSS variables and glass utilities
└── layout.tsx           # Root layout (potential background updates)

components/
├── ui/
│   ├── button.tsx       # Glass button styling
│   ├── card.tsx         # Glass card styling (already partial)
│   ├── dropdown-menu.tsx # Glass dropdown styling
│   └── input.tsx        # Glass input styling
├── sections/
│   ├── Blog.tsx         # Section background adjustments
│   ├── Certificates.tsx # Section styling
│   ├── Projects.tsx     # Section styling
│   └── Skills.tsx       # Section styling
├── layout/
│   ├── Header.tsx       # Glass header (already partial)
│   └── Footer.tsx       # Glass footer
└── shared/
    ├── ThemeToggle.tsx  # Glass toggle button
    ├── CVDownloadButton.tsx # Glass CTA button
    └── LanguageSwitcher.tsx # Glass dropdown

tailwind.config.ts       # Extended glass utilities and colors
```

**Structure Decision**: Existing Next.js App Router structure maintained. Changes limited to CSS (`globals.css`), Tailwind config, and component className updates.

## Complexity Tracking

No constitution violations. Feature stays within existing architecture.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| CSS Variables | Extend existing | Constitution IV: Don't create new abstraction layers |
| Component Updates | In-place edits | Constitution IV: Don't create new files |
| Color System | Replace gradients | Spec requirement: Apple Liquid Glass neutral palette |
