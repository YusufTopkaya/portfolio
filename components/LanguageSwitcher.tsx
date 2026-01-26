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
    return pathname.replace(`/${currentLang}`, `/${langCode}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="rounded-full text-foreground hover:bg-accent/10"
        >
          {currentLanguage?.nativeName}
          <ChevronDown className="ml-2 h-4 w-4" />
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
