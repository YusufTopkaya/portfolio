# Setup Guide

This guide will walk you through setting up your personal portfolio website.

## Prerequisites

- Node.js 20.x or later
- npm, yarn, or pnpm
- A code editor (VS Code recommended)

## Step 1: Fork or Clone

### Option A: Fork on GitHub

1. Click the "Fork" button on the repository page
2. Clone your forked repository:

```bash
git clone https://github.com/YOUR_USERNAME/portfolio.git
cd portfolio
```

### Option B: Use as Template

1. Click "Use this template" on GitHub
2. Create a new repository
3. Clone your new repository

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Environment Variables

Create your environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
# Required
NEXT_PUBLIC_SITE_URL="https://yourdomain.com"

# Optional - Analytics
NEXT_PUBLIC_GA_MEASUREMENT_ID="G-XXXXXXXXXX"
NEXT_PUBLIC_GTM_ID="GTM-XXXXXXXX"
NEXT_PUBLIC_CLARITY_PROJECT_ID="XXXXXXXXXX"
```

## Step 4: Customize Your Content

### Personal Information

Edit `content/en/profile.json`:

```json
{
  "personalInfo": {
    "name": "Your Name",
    "position": "Software Engineer",
    "company": "Your Company",
    "about": "A brief description about yourself...",
    "imageUrl": "/images/profile.webp",
    "cv": {
      "url": "/files/cv.pdf",
      "fileName": "Your Name - CV.pdf"
    }
  },
  "skills": [
    {
      "name": "Frontend Development",
      "icon": "monitor",
      "items": [
        {
          "name": "React",
          "level": "Expert",
          "levelType": "expert",
          "icon": "code"
        }
      ]
    }
  ],
  "certificates": [],
  "projects": [],
  "blogPosts": [],
  "socialLinks": [
    {
      "name": "GitHub",
      "url": "https://github.com/yourusername"
    },
    {
      "name": "LinkedIn",
      "url": "https://linkedin.com/in/yourusername"
    }
  ]
}
```

### SEO Metadata

Edit `content/en/metadata.json`:

```json
{
  "title": "Your Name - Software Engineer",
  "description": "Your professional description for search engines...",
  "keywords": ["software engineer", "developer", "portfolio"],
  "openGraph": {
    "title": "Your Name - Software Engineer",
    "description": "Your description for social media...",
    "siteName": "Your Portfolio",
    "images": [
      {
        "url": "/images/og-banner.en.webp",
        "width": 1200,
        "height": 630,
        "alt": "Your Name - Portfolio"
      }
    ]
  },
  "twitter": {
    "card": "summary_large_image",
    "site": "@yourusername",
    "creator": "@yourusername",
    "images": {
      "url": "/images/og-banner.en.webp",
      "alt": "Your Name - Portfolio"
    }
  }
}
```

## Step 5: Add Your Assets

### Profile Image

Replace `public/images/profile.webp` with your photo:

- Recommended size: 400x400px or larger (square)
- Format: WebP (for best performance)
- You can use PNG/JPG, but WebP is preferred

### CV/Resume

Replace `public/files/cv.pdf` with your resume.

### OG Banner Images

Create social media preview images:

1. Start dev server: `npm run dev`
2. Go to [http://localhost:3000/og-preview](http://localhost:3000/og-preview)
3. Select language and customize
4. Take screenshot (Ctrl+Shift+S or browser screenshot)
5. Convert to WebP using [squoosh.app](https://squoosh.app)
6. Save as `public/images/og-banner.{lang}.webp`

## Step 6: Add Languages (Optional)

### Using the Script

```bash
# Add French
npm run lang:add -- fr

# Add multiple languages
npm run lang:add -- de es it ja

# See all available languages
npm run lang:list
```

### Manual Setup

1. Create directory: `mkdir content/fr`
2. Copy template: `cp content/en/*.json content/fr/`
3. Translate the content
4. Update `lib/i18n/config.ts`
5. Update `lib/i18n/translations.ts`

## Step 7: Test Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build Test

```bash
npm run build
npm run start
```

## Step 8: Deploy

### Vercel (Recommended)

1. Push to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Add environment variables
4. Deploy!

### Docker

```bash
docker build -t portfolio .
docker run -p 3000:3000 portfolio
```

### Other Platforms

Any platform supporting Node.js:

- Netlify
- Railway
- Render
- DigitalOcean App Platform

## Troubleshooting

### Build Errors

```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

### Development Server Issues

```bash
# Clear Next.js cache
rm -rf .next
npm run dev
```

### Missing Dependencies

```bash
npm install
```

## Customization Tips

### Changing Colors

Edit `app/globals.css` and modify CSS variables:

```css
:root {
  --primary: 222.2 47.4% 11.2%;
  --accent: 210 40% 96.1%;
}
```

### Adding New Sections

1. Create `components/sections/NewSection.tsx`
2. Add data structure to `profile.json`
3. Import in `app/[lang]/page.tsx`

### Changing Fonts

Edit `app/layout.tsx`:

```tsx
import { Your_Font } from "next/font/google";

const font = Your_Font({
  subsets: ["latin"],
  weight: ["400", "700"],
});
```

## Need Help?

- Check [README.md](README.md) for detailed documentation
- Open an issue on GitHub
- Review existing issues for common problems

## Checklist

Before deploying, make sure you have:

- [ ] Updated personal information in `profile.json`
- [ ] Updated SEO metadata in `metadata.json`
- [ ] Replaced profile image
- [ ] Added your CV/resume
- [ ] Created OG banner images
- [ ] Set environment variables
- [ ] Tested build locally
- [ ] Verified all links work
