# Portfolio - senrecep.dev

## Commands
| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run check:fix` | Biome lint + format |

## WHAT - Project Overview
**Next.js 15 portfolio** with i18n (12 languages) using App Router, TypeScript 5, React 19, Tailwind CSS, Shadcn UI.

### Key Directories
- `app/[lang]/` — Internationalized routes
- `components/` — UI (ui/, sections/, layout/, shared/)
- `content/{lang}/` — JSON translations
- `lib/` — Utilities, i18n loaders

## WHY - Architecture Decisions
- **App Router**: Server Components for SEO and performance
- **next-intl**: Better App Router support than next-i18next
- **Biome**: Single tool, faster than ESLint + Prettier
- **Shadcn UI**: Copy-paste components, no black-box dependencies

## HOW - Code Conventions
### TypeScript
- Explicit types — *inference caused bugs*
- No `any` — *production bugs from untyped data*
- Interface over type for objects — *better extensibility*

### React
- Server Components by default — *smaller bundles*
- `"use client"` only when needed — *minimize JS*

### Styling
- `cn()` for conditional classes — *consistent merging*
- Mobile-first design — *most visitors are mobile*

## Boundaries
- ✅ **Always**: Run `npm run check:fix`, follow existing patterns
- ⚠️ **Ask first**: New dependencies, i18n config, routing changes
- 🚫 **Never**: Commit secrets, edit `node_modules/`, remove translations

## NOT TO DO
- Don't create new files if task fits existing file
- Don't add error handling for impossible scenarios
- Don't over-engineer beyond what's requested
- Don't add comments to unchanged code

## Testing
| Type | Command | Notes |
|------|---------|-------|
| Build | `npm run build` | Must pass |
| Lint | `npm run check:fix` | Biome |

## Git Workflow
- **Branch**: `[type]/[description]` (e.g., `feat/contact-form`)
- **Commit**: Semantic (`feat:`, `fix:`, `docs:`)
- **PR**: Use `/git-pr`, include Co-Authored-By

## Custom Commands
| Command | Description |
|---------|-------------|
| `/git-pr` | Commit, push, create PR |
| `/git-fix-issue <n>` | Fix GitHub issue |
| `/add-language` | Add new language |

## References
| Topic | File |
|-------|------|
| Architecture | `docs/claude/architecture.md` |
| Patterns | `docs/claude/patterns.md` |
| Code Style | `docs/claude/code-style.md` |
| AI Setup | `docs/claude/AI_SETUP.md` |
| Memory | `SCRATCHPAD.md` |
| Constitution | `.specify/memory/constitution.md` |
| Translations | `content/TRANSLATION_GLOSSARY.md` |


## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:
1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes

## Active Technologies
- TypeScript 5.x + Next.js 15.x, React 19.x, Tailwind CSS 3.4.x, Shadcn UI (001-glassmorphism-design)
- N/A (visual-only changes) (001-glassmorphism-design)

## Recent Changes
- 001-glassmorphism-design: Added TypeScript 5.x + Next.js 15.x, React 19.x, Tailwind CSS 3.4.x, Shadcn UI
