#!/bin/bash

# Claude Code Setup Script for Portfolio Project
# Run this script to set up Claude Code with recommended plugins

set -e

echo "🚀 Setting up Claude Code for Portfolio project..."
echo ""

# Check if Claude is installed
if ! command -v claude &> /dev/null; then
    echo "❌ Claude CLI not found. Please install it first:"
    echo "   npm install -g @anthropic-ai/claude-code"
    exit 1
fi

echo "📦 Installing recommended plugins..."
echo ""

# Core plugins for this project
PLUGINS=(
    # LSP Support
    "typescript-lsp@claude-plugins-official"

    # Development Workflow
    "commit-commands@claude-plugins-official"
    "code-review@claude-plugins-official"
    "pr-review-toolkit@claude-plugins-official"

    # Semantic Analysis
    "serena@claude-plugins-official"
    "context7@claude-plugins-official"

    # Integration
    "github@claude-plugins-official"

    # Browser Testing (optional)
    # "playwright@claude-plugins-official"
)

for plugin in "${PLUGINS[@]}"; do
    echo "  Installing $plugin..."
    claude plugins install "$plugin" 2>/dev/null || echo "    ⚠️  Already installed or unavailable"
done

echo ""
echo "✅ Plugin installation complete!"
echo ""

# Verify project structure
echo "🔍 Verifying project structure..."

REQUIRED_FILES=(
    "CLAUDE.md"
    "SCRATCHPAD.md"
    ".claude/settings.local.json"
)

REQUIRED_DIRS=(
    ".claude/agents"
    ".claude/commands"
)

all_good=true

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (missing)"
        all_good=false
    fi
done

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "  ✅ $dir/"
    else
        echo "  ❌ $dir/ (missing)"
        all_good=false
    fi
done

echo ""

if [ "$all_good" = true ]; then
    echo "🎉 Setup complete! Claude Code is ready to use."
else
    echo "⚠️  Some files are missing. Please check the repository."
fi

echo ""
echo "📚 Quick Start:"
echo "   • Read CLAUDE.md for project conventions"
echo "   • Use /git-pr to commit and create PRs"
echo "   • Use /lighthouse for performance audits"
echo "   • Check SCRATCHPAD.md for session context"
echo ""
echo "🤖 Available Agents:"
ls -1 .claude/agents/*.md 2>/dev/null | xargs -I {} basename {} .md | sed 's/^/   • /'
echo ""
echo "Happy coding! 🚀"
