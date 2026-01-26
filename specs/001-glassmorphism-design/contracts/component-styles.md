# Component Style Contracts

**Feature**: 001-glassmorphism-design
**Date**: 2026-01-21

## Overview

This document defines the styling contracts for each component affected by the Apple Liquid Glass design system.

---

## Core Utility Classes

### .glass (Default)

```css
.glass {
  background: hsl(var(--glass-bg));
  backdrop-filter: blur(var(--glass-blur-default));
  -webkit-backdrop-filter: blur(var(--glass-blur-default));
  border: 1px solid hsl(var(--glass-border));
  box-shadow: var(--glass-shadow);
}
```

### .glass-subtle

```css
.glass-subtle {
  background: hsl(var(--glass-bg));
  backdrop-filter: blur(var(--glass-blur-subtle));
  -webkit-backdrop-filter: blur(var(--glass-blur-subtle));
  border: 1px solid hsl(var(--glass-border));
}
```

### .glass-bold

```css
.glass-bold {
  background: hsl(var(--glass-bg));
  backdrop-filter: blur(var(--glass-blur-bold));
  -webkit-backdrop-filter: blur(var(--glass-blur-bold));
  border: 1px solid hsl(var(--glass-border));
  box-shadow: var(--glass-shadow);
}
```

### .glass-hover

```css
.glass-hover {
  transition: all var(--transition-default) ease-out;
}

.glass-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
}

@media (prefers-reduced-motion: reduce) {
  .glass-hover {
    transition: none;
  }
  .glass-hover:hover {
    transform: none;
  }
}
```

---

## Component Contracts

### Card Component

**File**: `components/ui/card.tsx`

| Property | Value |
|----------|-------|
| Base class | `glass glass-hover rounded-2xl` |
| Border radius | `1rem` (rounded-2xl) |
| Padding | Header: `p-6`, Content: `p-6 pt-0` |

### Button Component

**File**: `components/ui/button.tsx`

| Variant | Classes |
|---------|---------|
| Default | `glass-subtle hover:bg-accent hover:text-accent-foreground` |
| Primary | `bg-accent text-accent-foreground hover:bg-accent/90` |
| Ghost | `hover:glass-subtle` |
| Outline | `glass-subtle border-2 border-accent/20` |

### Header Component

**File**: `components/layout/Header.tsx`

| Property | Value |
|----------|-------|
| Background | Remove gradient, use neutral background |
| Top bar | `glass-subtle rounded-full` |
| Profile image | `glass border border-white/20` |

### Footer Component

**File**: `components/layout/Footer.tsx`

| Property | Value |
|----------|-------|
| Background | `glass-bold` with dark overlay in dark mode |
| Text | Use `--foreground-secondary` for muted text |

### Dropdown Menu

**File**: `components/ui/dropdown-menu.tsx`

| Property | Value |
|----------|-------|
| Menu content | `glass-bold rounded-xl` |
| Menu item hover | `bg-accent/10` |
| Separator | `bg-border` |

### Input/Textarea

**File**: `components/ui/input.tsx`, `components/ui/textarea.tsx`

| Property | Value |
|----------|-------|
| Base | `glass-subtle rounded-lg` |
| Focus | `ring-2 ring-accent` |
| Placeholder | `text-foreground-secondary` |

### Theme Toggle

**File**: `components/shared/ThemeToggle.tsx`

| Property | Value |
|----------|-------|
| Button | `glass-subtle rounded-full p-2` |
| Icon | `text-foreground` |
| Hover | `hover:bg-accent/10` |

### Language Switcher

**File**: `components/LanguageSwitcher.tsx`

| Property | Value |
|----------|-------|
| Trigger | `glass-subtle rounded-full` |
| Dropdown | Inherits from dropdown-menu contract |

### CV Download Button

**File**: `components/shared/CVDownloadButton.tsx`

| Property | Value |
|----------|-------|
| Style | `bg-accent text-accent-foreground glass-subtle` |
| Hover | `hover:bg-accent/90 hover:shadow-lg` |

---

## Section Backgrounds

### Remove Gradient Background

**File**: `app/globals.css`

Replace animated gradient background with subtle neutral:

```css
body {
  @apply bg-background text-foreground;
  /* Remove: radial-gradient decorations */
  /* Add: subtle noise texture (optional) */
}
```

### Section Containers

All sections should have consistent spacing and no gradient backgrounds:

```css
section {
  @apply py-16 md:py-24;
}
```

---

## Validation Checklist

Each component implementation must satisfy:

- [ ] Uses CSS variables (no hardcoded colors)
- [ ] Has light and dark mode support
- [ ] Includes hover state with transition
- [ ] Has focus ring for keyboard navigation
- [ ] Supports reduced-motion preference
- [ ] Fallback for `backdrop-filter` unsupported browsers
- [ ] Text contrast meets WCAG AA (4.5:1 body, 3:1 large)
