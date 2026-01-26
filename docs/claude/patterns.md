# Code Patterns

## Component Patterns

### Server Component (Default)
```tsx
// No directive needed - server by default
interface Props {
  content: SectionContent;
  lang: string;
}

export function SkillsSection({ content, lang }: Props) {
  return (
    <section className="py-16 md:py-24">
      <h2 className="text-3xl font-bold">{content.title}</h2>
      {/* Server-rendered content */}
    </section>
  );
}
```

### Client Component (When Required)
```tsx
"use client";

import { useState } from "react";

export function ContactForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Browser APIs, state, effects allowed here
}
```

## Styling Patterns

### Conditional Classes with cn()
```tsx
import { cn } from "@/lib/utils";

<button
  className={cn(
    "px-4 py-2 rounded-lg",
    isActive && "bg-primary text-primary-foreground",
    disabled && "opacity-50 cursor-not-allowed"
  )}
/>
```

### Responsive Design (Mobile-First)
```tsx
// Start small, add breakpoints for larger
<div className="px-4 md:px-8 lg:px-12">
  <h1 className="text-2xl md:text-4xl lg:text-5xl">
```

### Dark Mode Support
```tsx
// Use Tailwind dark: variant
<div className="bg-white dark:bg-gray-900">
  <p className="text-gray-900 dark:text-gray-100">
```

## i18n Patterns

### Content Loading
```tsx
// lib/i18n/content.ts
export async function getHomeContent(lang: string): Promise<HomeContent> {
  const content = await import(`@/content/${lang}/home.json`);
  return content.default;
}
```

### Fallback Chain
```tsx
// English fallback for missing keys
const content = await getContent(lang).catch(() => getContent('en'));
```

### Type-Safe Keys
```typescript
// Compile-time error if key missing
type TranslationKey = keyof typeof translations;
```

## API Route Patterns

### Route Handler
```tsx
// app/api/og/route.tsx
import { ImageResponse } from "next/og";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") ?? "Default";

  return new ImageResponse(/* JSX */);
}
```

### PDF Generation
```tsx
// app/api/pdf/route.ts
export async function GET(request: Request) {
  // Validate language parameter
  // Generate or fetch PDF
  // Return with proper headers
}
```

## Error Handling Patterns

### Boundary Components
```tsx
// app/[lang]/error.tsx
"use client";

export default function Error({ error, reset }: ErrorProps) {
  return (
    <div className="flex flex-col items-center">
      <p>Something went wrong</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

### Not Found
```tsx
// app/[lang]/not-found.tsx
export default function NotFound() {
  return <div>Page not found</div>;
}
```
