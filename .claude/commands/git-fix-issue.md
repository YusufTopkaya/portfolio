---
args: issue_number
description: Fix a GitHub issue systematically with proper branching and linking
---

Fix GitHub issue #$ARGUMENTS following this workflow:

## Step 1: Understand the Issue

```bash
gh issue view $ARGUMENTS
```

Review:
- Issue title and description
- Labels and priority
- Any linked PRs or discussions
- Reproduction steps (if bug)

## Step 2: Create Branch

```bash
git checkout main
git pull origin main
git checkout -b fix/issue-$ARGUMENTS
```

## Step 3: Investigate

Based on issue type:

**Bug**:
- Reproduce the issue
- Find root cause in code
- Identify minimal fix

**Feature Request**:
- Understand requirements
- Check existing patterns
- Plan implementation

**Documentation**:
- Identify what needs updating
- Check related files

## Step 4: Implement Fix

- Make minimal necessary changes
- Follow project conventions (see CLAUDE.md)
- Ensure changes are type-safe

## Step 5: Verify

```bash
npm run check:fix
npm run build
```

- Confirm issue is resolved
- No regressions introduced

## Step 6: Commit and PR

```bash
git add -A
git commit -m "fix: [description]

Fixes #$ARGUMENTS

Co-Authored-By: Claude <noreply@anthropic.com>"

git push -u origin fix/issue-$ARGUMENTS

gh pr create --title "Fix #$ARGUMENTS: [short description]" --body "## Summary
Fixes #$ARGUMENTS

## Changes
- [List changes]

## Test Plan
- [How to verify]"
```

## Boundaries

- Always link issue number in commit with `Fixes #N`
- Don't expand scope beyond issue requirements
- Ask if requirements are unclear
