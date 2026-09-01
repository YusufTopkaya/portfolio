"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLanguageByCode, languages } from "@/lib/i18n/config";

export function LanguageSwitcher() {
  const pathname = usePathname();
  const currentLang = pathname.split("/")[1];
  const currentLanguage = getLanguageByCode(currentLang);

  const getTargetPath = (langCode: string) => {
    return pathname.replaceAll(`/${currentLang}`, `/${langCode}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 rounded-none px-2 text-foreground hover:bg-accent/10"
        >
          {/* compact 2-letter code on mobile, full name on desktop */}
          <span className="font-pixel text-[10px] sm:hidden">
            {currentLanguage?.code.toUpperCase()}
          </span>
          <span className="hidden font-pixel text-[10px] sm:inline">
            {currentLanguage?.nativeName}
          </span>
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[300px] overflow-y-auto"
      >
        {languages
          .filter((lang) => lang.code !== currentLang)
          .map((lang) => (
            <DropdownMenuItem key={lang.code} asChild>
              <Link
                href={getTargetPath(lang.code)}
                className="w-full cursor-pointer"
              >
                {lang.nativeName}
              </Link>
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
