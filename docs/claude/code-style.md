# Code Style Guide

## TypeScript

### Types vs Interfaces
```typescript
// Use interface for objects (preferred)
interface User {
  id: string;
  name: string;
}

// Use type for unions, primitives, tuples
type Status = "loading" | "success" | "error";
type Coordinates = [number, number];
```

### Explicit Return Types
```typescript
// Exported functions must have explicit return types
export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

// Internal functions can use inference
const double = (n: number) => n * 2;
```

### No Any
```typescript
// Bad
function process(data: any) { ... }

// Good
function process(data: unknown) {
  if (isValidData(data)) { ... }
}

// Better - define the type
interface ProcessableData { ... }
function process(data: ProcessableData) { ... }
```

## React

### Props Interface Naming
```typescript
// Component name + Props
interface HeroSectionProps {
  title: string;
  subtitle?: string;
}

export function HeroSection({ title, subtitle }: HeroSectionProps) {
```

### Event Handlers
```typescript
// Prefix with "handle" or "on"
const handleClick = () => { ... };
const onSubmit = (e: FormEvent) => { ... };
```

### Component Organization
```typescript
// Order: imports, types, component, exports
import { cn } from "@/lib/utils";

interface Props { ... }

export function Component({ prop }: Props) {
  // 1. Hooks
  const [state, setState] = useState();

  // 2. Derived state
  const computed = useMemo(() => ..., [deps]);

  // 3. Effects (minimize these)

  // 4. Handlers
  const handleAction = () => { ... };

  // 5. Render
  return <div>...</div>;
}
```

## Tailwind CSS

### Class Order
```tsx
// Layout → Sizing → Spacing → Typography → Colors → Effects
<div className="flex flex-col w-full max-w-lg p-4 text-lg font-medium text-gray-900 bg-white shadow-md">
```

### Avoid Magic Numbers
```tsx
// Bad
<div className="mt-[23px] text-[15px]">

// Good - use scale values
<div className="mt-6 text-base">
```

### Extract Complex Variants
```tsx
// For complex conditional styling, extract to variables
const buttonStyles = cn(
  "px-4 py-2 rounded-lg font-medium transition-colors",
  variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
  variant === "outline" && "border border-input hover:bg-accent",
  disabled && "opacity-50 pointer-events-none"
);
```

## Imports

### Order
```typescript
// 1. React/Next
import { useState } from "react";
import Link from "next/link";

// 2. External libraries
import { motion } from "framer-motion";

// 3. Internal aliases (@/)
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// 4. Relative imports
import { localHelper } from "./helpers";
```

### Path Aliases
```typescript
// Use @/ for project root
import { Component } from "@/components/shared/Component";

// Not relative paths from deep nesting
// Bad: import { Component } from "../../../components/shared/Component";
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `HeroSection.tsx` |
| Hooks | camelCase + use | `useLocalStorage.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Constants | SCREAMING_SNAKE | `MAX_ITEMS` |
| Types/Interfaces | PascalCase | `UserProfile` |
| Files (non-component) | kebab-case | `api-client.ts` |
