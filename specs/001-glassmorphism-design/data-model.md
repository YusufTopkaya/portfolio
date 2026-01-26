# Data Model: Apple Liquid Glass Design Tokens

**Feature**: 001-glassmorphism-design
**Date**: 2026-01-21

## Overview

This document defines the CSS custom properties (design tokens) for the Apple Liquid Glass design system. These variables form the foundation of all glass effects in the portfolio.

---

## CSS Variable Schema

### Core Color Tokens

```css
:root {
  /* ═══════════════════════════════════════════════════════════════
     LIGHT MODE - Apple Liquid Glass Palette
     ═══════════════════════════════════════════════════════════════ */

  /* Backgrounds */
  --background: 0 0% 97%;           /* #F7F7F7 - slightly warm white */
  --background-secondary: 0 0% 100%; /* #FFFFFF - pure white */

  /* Foregrounds */
  --foreground: 0 0% 11%;           /* #1D1D1F - Apple dark gray */
  --foreground-secondary: 0 0% 53%; /* #868686 - secondary text */

  /* Glass Effect */
  --glass-bg: 0 0% 100% / 0.65;     /* White at 65% opacity */
  --glass-border: 0 0% 100% / 0.25; /* White at 25% opacity */
  --glass-blur-subtle: 8px;
  --glass-blur-default: 12px;
  --glass-blur-bold: 20px;
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);

  /* Accent (minimal usage) */
  --accent: 211 100% 50%;           /* #007AFF - Apple blue */
  --accent-foreground: 0 0% 100%;   /* White text on accent */

  /* Interactive States */
  --ring: 211 100% 50%;             /* Focus ring = accent */
  --border: 0 0% 0% / 0.06;         /* Subtle borders */

  /* Cards & Surfaces */
  --card: 0 0% 100% / 0.65;         /* Same as glass-bg */
  --card-foreground: 0 0% 11%;      /* Same as foreground */

  /* Transitions */
  --transition-fast: 150ms;
  --transition-default: 200ms;
  --transition-slow: 300ms;
}

.dark {
  /* ═══════════════════════════════════════════════════════════════
     DARK MODE - Apple Liquid Glass Palette
     ═══════════════════════════════════════════════════════════════ */

  /* Backgrounds */
  --background: 0 0% 0%;            /* #000000 - true black */
  --background-secondary: 0 0% 11%; /* #1C1C1E - elevated surface */

  /* Foregrounds */
  --foreground: 0 0% 96%;           /* #F5F5F7 - Apple light gray */
  --foreground-secondary: 0 0% 60%; /* #999999 - secondary text */

  /* Glass Effect */
  --glass-bg: 0 0% 11% / 0.50;      /* Dark gray at 50% opacity */
  --glass-border: 0 0% 100% / 0.12; /* White at 12% opacity */
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);

  /* Accent (brighter for dark mode) */
  --accent: 211 100% 55%;           /* #0A84FF - Apple blue (dark) */
  --accent-foreground: 0 0% 100%;

  /* Interactive States */
  --ring: 211 100% 55%;
  --border: 0 0% 100% / 0.08;

  /* Cards & Surfaces */
  --card: 0 0% 11% / 0.50;
  --card-foreground: 0 0% 96%;
}
```

---

## Component Token Mapping

### Glass Component Variants

| Variant | Blur | Opacity (Light) | Opacity (Dark) | Use Case |
|---------|------|-----------------|----------------|----------|
| `glass-subtle` | 8px | 55% | 40% | Inline elements, pills |
| `glass` (default) | 12px | 65% | 50% | Cards, panels |
| `glass-bold` | 20px | 75% | 60% | Headers, modals |

### State Tokens

| State | Property | Value |
|-------|----------|-------|
| Default | `background` | `hsl(var(--glass-bg))` |
| Hover | `background` | Increase opacity +5% |
| Hover | `transform` | `translateY(-2px)` |
| Focus | `box-shadow` | `0 0 0 2px hsl(var(--ring))` |
| Active | `transform` | `translateY(0)` |

---

## Tailwind Extension Schema

```typescript
// tailwind.config.ts additions
{
  theme: {
    extend: {
      colors: {
        glass: {
          DEFAULT: 'hsl(var(--glass-bg))',
          border: 'hsl(var(--glass-border))',
        },
      },
      backdropBlur: {
        subtle: '8px',
        DEFAULT: '12px',
        bold: '20px',
      },
      transitionDuration: {
        fast: '150ms',
        DEFAULT: '200ms',
        slow: '300ms',
      },
    },
  },
}
```

---

## Validation Rules

### Contrast Requirements (WCAG AA)

| Text Type | Minimum Ratio | Against |
|-----------|---------------|---------|
| Body text | 4.5:1 | Glass background |
| Large text (18px+) | 3:1 | Glass background |
| UI components | 3:1 | Adjacent colors |

### Animation Constraints

| Property | Constraint |
|----------|------------|
| Duration | 150ms - 300ms |
| Easing | `ease-out` for enter, `ease-in` for exit |
| Transform | Max `translateY(-4px)` for hover |

### Fallback Requirements

| Feature | Fallback |
|---------|----------|
| `backdrop-filter` | Solid 80% opacity background |
| CSS variables | Hardcoded hex values |
| `prefers-reduced-motion` | No transitions |

---

## Entity Relationships

```
Theme Mode
    │
    ├── Light Mode ─────┬── Glass Variables
    │                   ├── Color Variables
    │                   └── Shadow Variables
    │
    └── Dark Mode ──────┬── Glass Variables (adjusted)
                        ├── Color Variables (adjusted)
                        └── Shadow Variables (adjusted)

Glass Component
    │
    ├── glass-subtle ── for: pills, badges, small containers
    ├── glass (default) ── for: cards, panels, sections
    └── glass-bold ──── for: headers, modals, overlays

Glass Control
    │
    ├── button ── inherits: glass-subtle + accent hover
    ├── input ── inherits: glass-subtle + focus ring
    └── dropdown ── inherits: glass + glass-bold (menu)
```
