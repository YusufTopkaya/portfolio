# Scratchpad - External Memory

> This file persists information between Claude Code sessions.
> Read this at the start of each session. Update when making important decisions.

## Current Task

[No active task]

## Key Decisions Made

| Decision | Why | Date |
|----------|-----|------|
| Next.js 15 App Router | Better Server Components, improved performance | Initial |
| Biome over ESLint+Prettier | Single tool, faster execution | Initial |
| next-intl for i18n | Best App Router support, type-safe | Initial |
| 12 languages | Global audience coverage | Initial |

## Architecture Notes

### Routing
- `[lang]` dynamic segment for all pages
- Middleware handles locale detection and redirects
- Fallback to English for unsupported locales

### Content Structure
- JSON files in `content/{lang}/`
- Server-side loading via `lib/i18n/server-content-loader.ts`
- Type-safe content access

### Components
- Shadcn UI for base components
- Custom sections in `components/sections/`
- Shared utilities in `components/shared/`

## Files Modified Recently

[Track modified files here during sessions]

## Notes for Next Session

[Add important context for future sessions]

---

## Session Log

### Session Template
```
### YYYY-MM-DD - [Topic]
**Goal**: What was being worked on
**Outcome**: What was achieved
**Notes**: Important observations
```
