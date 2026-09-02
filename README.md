```
+====================================================================+
|                                                                    |
|   YUSUF TOPKAYA  ::  PORTFOLIO  ::  RETRO-CRT EDITION              |
|                                                                    |
|   > INSERT COIN_                                                  |
|                                                                    |
+====================================================================+
```

# portfolio

Personal portfolio website of **Yusuf Topkaya** — Software Engineer, amateur
radio operator (TA1YTK). Built with Next.js 15 and styled as a retro NES/CRT
terminal: pixel font, scanlines, a CRT power-on boot animation and a floating
retro PC with a live stock ticker.

Live: **[www.yusuftopkaya.com](https://www.yusuftopkaya.com)**

---

## :: FEATURES

### Retro CRT Design

- Retro-only theme: paper-beige `light` / CRT-navy `dark` / `system`
- Press Start 2P pixel font, square pixel panels, CRT scanline overlay
- CRT power-on boot effect on page load (bright dot, horizontal line,
  expand, glitch shake with chromatic aberration)
- Matrix-style glyph rain behind the page: hidden under the hero, fades in
  with a spatial gradient, parallax-scrolls slower than the content
- Pixel cat napping on the CRT: teleports in through a green portal after
  boot, purrs when hovered, wakes on click and strolls along the page
  bottom (random 15-45s walks with grooming pauses); on mobile it sleeps
  on the ticker bar instead
- Typewriter hero name (layout-stable, no content shift while typing)
- Profile photo glitch hover: slice-based "magnet near a CRT" wave,
  seam-free across browsers
- Hand-rolled retro micro-components, no nes.css / retro-react dependency

### RetroStockComputer

- Floating retro PC on desktop, fixed ticker bar on mobile
- Live quotes for VOO, GOOGL, MU, RKLB, PLTR via `/api/stocks`
  (Yahoo Finance proxy, 15-minute delayed, like real terminals)
- Working CRT power button with mini turn-on/turn-off animation

### Internationalization

- 13 languages with real, context-aware translations:
  en, tr, de, fr, es, nl, pt, it, pl, ja, ko, zh, ru
- Localized metadata, OG banners per language, hreflang tags
- Browser language detection

### SEO & AI Discoverability

- JSON-LD structured data (Person, WebSite, BlogPosting, FAQPage)
- `llms.txt`, `llms-full.txt`, `/.well-known/ai.txt`, `/.well-known/ai.json`
- RSS feed (`/feed.xml`), dynamic sitemap, AI-crawler-friendly robots.txt
- SSG everywhere, image optimization, LCP preloading

### Extras

- Key-sequence easter egg (type the sequence, get surprised)
- Cookie-consent-gated analytics: GA4 + Microsoft Clarity (anonymized)
- Blog system with markdown, TOC, code blocks, JSON-LD per post

---

## :: TECH STACK

| Category  | Technology                          |
| --------- | ----------------------------------- |
| Framework | Next.js 15 (App Router, Turbopack)  |
| UI        | React 19, Tailwind CSS 3.4, Radix   |
| Language  | TypeScript 5                        |
| Font      | Press Start 2P                      |
| Linting   | Biome 2, ESLint 9                   |
| Deploy    | Docker + Dokploy                    |

---

## :: QUICK START

```bash
git clone https://github.com/YusufTopkaya/portfolio.git
cd portfolio
npm install
cp .env.example .env.local   # fill in your values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable                        | Purpose                                   |
| ------------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`          | Absolute site URL for metadata/SEO files  |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4 (loads after consent)  |
| `NEXT_PUBLIC_GTM_ID`            | Google Tag Manager (optional)             |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID`| Microsoft Clarity (loads after consent)   |
| `NEXT_PUBLIC_KEY_SEQUENCE`      | Easter egg key sequence                   |
| `NEXT_PUBLIC_CGR` / `NEXT_PUBLIC_BR` | Easter egg target URLs               |

---

## :: DEPLOYMENT (Dokploy)

The `Dockerfile` declares every `NEXT_PUBLIC_*` variable as a build
`ARG`/`ENV`, because Next.js inlines public env vars at **build time**.
In Dokploy, make sure the environment variables are passed to the Docker
build (build args), not only to the runtime container.

```bash
docker build -t portfolio .
docker run -p 3000:3000 portfolio
```

---

## :: PROJECT STRUCTURE

```
portfolio/
├── app/
│   ├── [lang]/            # Localized routes (home, blog, resume, privacy)
│   ├── api/               # download, og-profile, stocks (Yahoo proxy)
│   ├── llms.txt/          # AI-readable profile
│   ├── llms-full.txt/     # Extended AI context
│   └── globals.css        # Retro palette, pixel panels, CRT overlays
├── components/
│   ├── retro/             # TypewriterText, GlitchImage, RetroBootEffect,
│   │                      # RetroStockComputer, RetroBackground, RetroCat
│   ├── layout/            # Header, Footer
│   ├── sections/          # Projects, Skills, Certificates, Blog
│   └── ui/                # Square pixel primitives
├── content/
│   ├── <lang>/            # profile.json + metadata.json per language
│   └── blog/              # Markdown posts
├── lib/i18n/              # Language config, translations, loaders
└── Dockerfile             # Multi-stage, standalone output, build args
```

Content is plain JSON: edit `content/en/profile.json` (source of truth) and
the matching `content/<lang>/` files.

---

## :: CREDITS

- Originally forked from [senrecep/portfolio](https://github.com/senrecep/portfolio)
  (template base, blog system, SEO/AI tooling) — heavily modified since
- Visual direction inspired by [NES.css](https://nostalgic-css.github.io/NES.css/)
- Pixel font: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P)
- Icons: [Lucide](https://lucide.dev/)

## :: LICENSE

MIT — see [LICENSE](LICENSE).
