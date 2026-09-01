# Next.js Conventions

## Architecture
- App Router (Next.js 15) with React 19
- Server Components by default, Client Components only when needed
- Server Actions for mutations
- Biome for linting and formatting

## Styling
- Tailwind CSS with shadcn/ui components
- Mobile-first responsive design
- Consistent design tokens

## Performance
- Image optimization with next/image
- Font optimization with next/font
- Lazy loading for below-fold content
- Static generation where possible

## SEO
- Metadata API for all pages
- Structured data (JSON-LD)
- Proper canonical URLs
- Sitemap and robots.txt
