# Assets Guide

This directory contains static images for the portfolio.

## Required Assets

### Profile Image

**File:** `profile.webp`

Replace this with your profile photo:
- **Recommended size:** 400x400px or larger (square aspect ratio)
- **Format:** WebP (preferred for performance)
- **Fallback formats:** PNG, JPG also work

**Tips:**
- Use a professional, high-quality photo
- Ensure good lighting and clear face visibility
- Square aspect ratio works best with the circular crop

### OG Banner Images

**Files:** `og-banner.{lang}.webp` (e.g., `og-banner.en.webp`, `og-banner.tr.webp`)

Social media preview images for each language.

**Specifications:**
- **Size:** 1200x630px (required)
- **Format:** WebP (preferred)

**How to create:**
1. Start dev server: `npm run dev`
2. Go to [http://localhost:3000/og-preview](http://localhost:3000/og-preview)
3. Select language and customize appearance
4. Take screenshot using browser tools or Ctrl+Shift+S
5. Convert to WebP at [squoosh.app](https://squoosh.app)
6. Save as `og-banner.{lang}.webp`

## Optional Assets

### Blog Post Images

Place blog post cover images here. Reference them in `profile.json`:

```json
{
  "blogPosts": [
    {
      "imageUrl": "/images/my-blog-post.webp"
    }
  ]
}
```

### Project Icons

Project icons can be external URLs or local files:

```json
{
  "projects": [
    {
      "imageUrl": "/images/my-project-icon.webp"
    }
  ]
}
```

## Image Optimization

For best performance:

1. Use WebP format when possible
2. Optimize images before uploading
3. Use appropriate dimensions (don't upload 4000px images for 100px display)

**Recommended tools:**
- [Squoosh](https://squoosh.app) - Browser-based image optimization
- [TinyPNG](https://tinypng.com) - PNG/JPG compression
- [SVGOMG](https://jakearchibald.github.io/svgomg/) - SVG optimization

## File Naming

- Use lowercase
- Use hyphens for spaces: `my-image.webp`
- Include language code for localized images: `og-banner.en.webp`

