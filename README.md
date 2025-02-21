# Personal Portfolio Website

This is a modern, internationalized personal portfolio website built with Next.js 15, React 19, and TailwindCSS. It features a clean, responsive design with support for multiple languages and dark/light themes.

## 🌟 Features

- 🌐 Internationalization (i18n) support
- 🎨 Dark/Light theme
- 📱 Fully responsive design
- ⚡ Built with Next.js 15 and React 19
- 🎯 SEO optimized
- 💅 Styled with TailwindCSS and shadcn/ui
- 🚀 Optimized performance
- 📊 Google Analytics 4 integration

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn or pnpm
- Google Analytics 4 account (for analytics)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/portfolio.git
cd portfolio
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Create your environment variables:
```bash
cp .env.example .env.local
```

4. Configure your environment variables in `.env.local`:
   - Get your Google Analytics Measurement ID from your GA4 property settings
   - Replace the placeholder in `NEXT_PUBLIC_GA_MEASUREMENT_ID` with your actual GA4 Measurement ID

5. Start the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📝 Project Structure

```
portfolio/
├── app/                   # Next.js app directory
├── components/           # React components
├── content/             # Multilingual content
│   ├── en/             # English content
│   ├── tr/             # Turkish content
│   └── de/             # German content
├── lib/                 # Utility functions
├── public/             # Static assets
└── styles/             # Global styles
```

## 🔧 Configuration

### Google Analytics Setup

1. Create a Google Analytics 4 property in your [Google Analytics account](https://analytics.google.com/)
2. Go to: Admin → Data Streams → Web
3. Create a new stream or select an existing one
4. Copy your Measurement ID (starts with "G-")
5. Add your Measurement ID to `.env.local`:
```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID="G-XXXXXXXXXX"
```

### Content Management

All content is managed through JSON files in the `content` directory. Each language has its own subdirectory containing:

- `profile.json`: Personal information
- `metadata.json`: SEO and site metadata

### Adding a New Language

1. Create a new directory in `content/` with the language code
2. Copy the JSON files from an existing language directory
3. Translate the content
4. Update `lib/i18n/config.ts` to include the new language

## 📦 Deployment

### Deploying to Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com).

1. Push your code to a Git repository
2. Import your project to Vercel
3. Vercel will detect Next.js automatically and configure the build settings
4. Your app will be deployed to a production URL

### Other Deployment Options

You can also deploy to other platforms that support Node.js:

1. Build your application:
```bash
npm run build
# or
yarn build
# or
pnpm build
```

2. Start the production server:
```bash
npm run start
# or
yarn start
# or
pnpm start
```

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/)
- [TailwindCSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [next-intl](https://next-intl-docs.vercel.app/)
