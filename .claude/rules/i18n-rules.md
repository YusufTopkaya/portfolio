# i18n Rules (next-intl)

## Supported Languages (12)
All translations must be maintained for all supported locales.

## Patterns
- Use `useTranslations()` hook in Client Components
- Use `getTranslations()` in Server Components
- Never hardcode user-visible strings
- Use ICU message format for plurals and variables

## File Structure
- Translation files in `messages/{locale}.json`
- Namespace-based organization
- Keep keys consistent across all locales

## Adding New Strings
1. Add key to all locale files
2. Use descriptive, hierarchical keys (e.g., `page.section.label`)
3. Include context comments for translators

## Quality
- No missing translations in any locale
- Proper RTL support if needed
- Date/number formatting via locale-aware APIs
