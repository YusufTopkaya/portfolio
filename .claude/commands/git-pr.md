---
description: Commit staged changes, push to remote, and create a pull request with auto-generated description.
---

## User Input

```text
$ARGUMENTS
```

Optional: PR title or additional context. If empty, title will be auto-generated from commits.

## Goal

Automate the complete PR workflow: stage changes, commit with conventional format, push, and create a GitHub PR.

## Execution Steps

### 1. Check Current State

```bash
git status
git log origin/main..HEAD --oneline 2>/dev/null || echo "No commits ahead of main"
```

If no changes and no unpushed commits, inform user and exit.

### 2. Stage and Commit (if uncommitted changes exist)

If there are unstaged/staged changes:

1. Show `git diff --stat` to summarize changes
2. Generate a conventional commit message based on changes:
   - `feat(scope):` for new features
   - `fix(scope):` for bug fixes
   - `refactor(scope):` for refactoring
   - `docs(scope):` for documentation
   - `style(scope):` for styling changes
   - `chore(scope):` for maintenance
3. Stage all changes: `git add -A`
4. Commit with generated message (include Co-Authored-By)

### 3. Push to Remote

```bash
git push -u origin HEAD
```

If push fails due to no upstream, create the branch on remote.

### 4. Create Pull Request

Base branch is always `main`.

Generate PR body with:
- **Summary**: 2-3 bullet points from commit messages
- **Changes**: List of modified files grouped by type
- **Test Plan**: Checklist based on changes

```bash
gh pr create --base main --title "<title>" --body "$(cat <<'EOF'
## Summary
<bullet points>

## Changes
<file list>

## Test Plan
- [ ] Build succeeds: `npm run build`
- [ ] Lint passes: `npm run check`
- [ ] Visual check in dev mode

🤖 Generated with Claude Code
EOF
)"
```

### 5. Output

Return the PR URL and summary:
- PR number and link
- Base branch
- Number of commits included
- Files changed count
