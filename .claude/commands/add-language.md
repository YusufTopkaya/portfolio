---
description: Add a new language to the portfolio with all required translation files.
args: language_code
---

## User Input

```text
$ARGUMENTS
```

Required: ISO 639-1 language code (e.g., `ar` for Arabic, `ru` for Russian)

## Goal

Add complete support for a new language including:
- Translation files
- Middleware configuration
- Navigation integration

## Execution Steps

### 1. Validate Language Code

Check if the language code is valid ISO 639-1.
Check if language already exists in `content/` directory.

### 2. Use Built-in Script

```bash
npm run lang:add -- $ARGUMENTS
```

This script handles:
- Creating `content/{lang}/` directory
- Copying English files as templates
- Updating middleware configuration

### 3. Update next-intl Configuration

Verify `middleware.ts` includes the new locale in the locales array.

### 4. Generate Translation Content

For each JSON file in the new language directory:
1. Keep the same structure as English
2. Mark values that need translation with `[TRANSLATE]` prefix
3. Preserve any formatting tokens (e.g., `{name}`, `{{count}}`)

### 5. Update Sitemap

Ensure `app/sitemap.ts` generates URLs for the new language.

### 6. Output

```markdown
## Language Added: {language_name} ({code})

### Files Created
- content/{code}/common.json
- content/{code}/home.json
- content/{code}/resume.json

### Next Steps
1. [ ] Translate content in `content/{code}/`
2. [ ] Test navigation to `/{code}` route
3. [ ] Verify language switcher includes new option
4. [ ] Check SEO metadata in new language
```
