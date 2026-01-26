# AI Development Setup Guide

This guide explains how the Claude Code ecosystem is configured for this project.

## Directory Structure

```
.claude/
├── agents/          → Specialized AI agents
├── commands/        → Custom slash commands
├── hooks/           → Event-triggered automations
├── skills/          → Reusable knowledge modules
└── settings.local.json

.specify/
├── memory/
│   └── constitution.md  → Project principles
├── scripts/
└── templates/

docs/claude/         → Progressive disclosure documentation
├── architecture.md  → System architecture
├── patterns.md      → Code patterns
├── code-style.md    → Style conventions
└── AI_SETUP.md      → This file
```

## Key Files

### CLAUDE.md
The primary instruction file (~100 lines). Contains:
- Project overview and tech stack
- Code conventions with rationale
- Boundaries (what to always/never do)
- Commands reference

**Rule**: Keep under 100 lines. Move details to `docs/claude/`.

### SCRATCHPAD.md
External memory for ongoing work:
- Current task context
- Key decisions made
- Files modified
- Notes for next session

**Usage**: Update before `/clear` to preserve context.

### Constitution (.specify/memory/constitution.md)
Non-negotiable project principles:
- Type safety requirements
- Server-first architecture
- i18n standards
- Simplicity guidelines

## Available Agents

| Agent | Purpose | Command |
|-------|---------|---------|
| code-reviewer | Review PRs for quality, bugs, patterns | Auto-triggered |
| debugger | Systematic bug investigation | On error |
| seo-optimizer | SEO and Core Web Vitals | `/lighthouse` |
| nextjs-expert | Next.js architecture decisions | On demand |
| ui-designer | Tailwind/Shadcn styling | On demand |
| typescript-pro | Type system optimization | On demand |
| i18n-specialist | Translation management | `/add-language` |

## Available Commands

| Command | Purpose |
|---------|---------|
| `/git-pr` | Commit, push, create PR |
| `/git-fix-issue <num>` | Fix GitHub issue systematically |
| `/add-language` | Add new language support |
| `/speckit.specify` | Create feature specification |
| `/speckit.clarify` | Resolve spec ambiguities |
| `/speckit.plan` | Create technical plan |
| `/speckit.tasks` | Generate task list |

## Workflow: Feature Development

1. **Specify**: `/speckit.specify "feature description"`
2. **Clarify**: `/speckit.clarify` (resolve ambiguities)
3. **Plan**: `/speckit.plan` (technical approach)
4. **Tasks**: `/speckit.tasks` (actionable items)
5. **Implement**: Work through tasks
6. **PR**: `/git-pr`

## Workflow: Bug Fixes

1. **Issue**: `/git-fix-issue 123`
2. **Investigate**: Agent analyzes root cause
3. **Fix**: Minimal change to resolve
4. **Verify**: Tests pass, build succeeds
5. **PR**: Auto-created with `fixes #123`

## Best Practices

### Context Management
- One conversation = one feature
- Use `/clear` when context > 40%
- Update SCRATCHPAD.md before clearing

### Code Quality
- Run `npm run check:fix` before commits
- Check `npm run build` passes
- Follow patterns in `docs/claude/patterns.md`

### Boundaries
- **Always**: Follow existing patterns
- **Ask first**: New dependencies, routing changes
- **Never**: Commit secrets, edit translations carelessly
