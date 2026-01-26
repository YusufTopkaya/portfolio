# Quickstart: Apple Liquid Glass Implementation

**Feature**: 001-glassmorphism-design
**Date**: 2026-01-21

## Prerequisites

- Node.js 18+ and npm installed
- Repository cloned and dependencies installed (`npm install`)
- Development server running (`npm run dev`)

---

## Implementation Order

### Step 1: Update CSS Variables (globals.css)

1. Open `app/globals.css`
2. Replace color variables in `:root` and `.dark` with Apple Liquid Glass palette
3. Update glass utility classes with new blur values

**Key Changes**:
- Remove gradient backgrounds from body
- Update `--background`, `--foreground`, `--accent` values
- Adjust glass opacity values

### Step 2: Update Tailwind Config

1. Open `tailwind.config.ts`
2. Add/update `backdropBlur` values
3. Add glass color utilities
4. Update shadow definitions

### Step 3: Update Components (Priority Order)

1. **Card** (`components/ui/card.tsx`) - Foundation component
2. **Button** (`components/ui/button.tsx`) - Interactive styling
3. **Header** (`components/layout/Header.tsx`) - High visibility
4. **Dropdown** (`components/ui/dropdown-menu.tsx`) - Complex glass overlay
5. **ThemeToggle** (`components/shared/ThemeToggle.tsx`)
6. **LanguageSwitcher** (`components/LanguageSwitcher.tsx`)
7. **CVDownloadButton** (`components/shared/CVDownloadButton.tsx`)
8. **Footer** (`components/layout/Footer.tsx`)
9. **Section components** - Final polish

---

## Quick Reference

### Glass Classes

| Class | Use For |
|-------|---------|
| `glass` | Default containers, cards |
| `glass-subtle` | Small elements, pills, buttons |
| `glass-bold` | Headers, modals, prominent panels |
| `glass-hover` | Add hover animation |

### Color Variables

| Variable | Light | Dark |
|----------|-------|------|
| `--background` | #F7F7F7 | #000000 |
| `--foreground` | #1D1D1F | #F5F5F7 |
| `--accent` | #007AFF | #0A84FF |

### Testing Checklist

After each component update:

- [ ] Check light mode appearance
- [ ] Check dark mode appearance
- [ ] Test hover/focus states
- [ ] Verify text is readable
- [ ] Test on mobile viewport
- [ ] Run `npm run build` (no errors)

---

## Common Patterns

### Glass Card

```tsx
<div className="glass glass-hover rounded-2xl p-6">
  <h3 className="text-foreground">Title</h3>
  <p className="text-foreground-secondary">Description</p>
</div>
```

### Glass Button

```tsx
<button className="glass-subtle rounded-full px-4 py-2 hover:bg-accent/10 transition-colors">
  Click me
</button>
```

### Glass Header Bar

```tsx
<div className="glass-bold rounded-xl px-4 py-2">
  <nav>...</nav>
</div>
```

---

## Troubleshooting

### Blur not showing

1. Check `backdrop-filter` browser support
2. Ensure parent has visible background
3. Verify `-webkit-backdrop-filter` is included

### Colors look wrong in dark mode

1. Check `.dark` class is on `<html>` element
2. Verify CSS variable overrides in `.dark` selector
3. Check color opacity values

### Text not readable

1. Increase glass opacity
2. Add text shadow for contrast
3. Check foreground color variable

---

## Verification Commands

```bash
# Build check
npm run build

# Lint and format
npm run check:fix

# Start dev server
npm run dev
```

## Next Step

After completing quickstart, run `/speckit.tasks` to generate detailed task breakdown.
