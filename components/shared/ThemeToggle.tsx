"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NoSSR } from "./NoSSR";

function ThemeToggleContent() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-none text-foreground hover:bg-accent/10"
        >
          <Sun className="theme-icon theme-icon-light h-4 w-4 transition-all" />
          <Moon className="theme-icon theme-icon-dark absolute h-4 w-4 transition-all" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="font-pixel text-[10px]"
          onClick={() => setTheme("light")}
        >
          Light
        </DropdownMenuItem>
        <DropdownMenuItem
          className="font-pixel text-[10px]"
          onClick={() => setTheme("dark")}
        >
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem
          className="font-pixel text-[10px]"
          onClick={() => setTheme("system")}
        >
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeToggle() {
  return (
    <NoSSR
      fallback={
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-none text-foreground hover:bg-accent/10"
        >
          <Sun className="h-4 w-4" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      }
    >
      <ThemeToggleContent />
    </NoSSR>
  );
}
