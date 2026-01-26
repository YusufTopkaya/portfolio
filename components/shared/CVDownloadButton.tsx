"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackCVDownload } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface CVDownloadButtonProps {
  url: string;
  fileName: string;
  label: string;
  language?: string;
  className?: string;
}

export function CVDownloadButton({
  url,
  fileName,
  label,
  language,
  className,
}: CVDownloadButtonProps) {
  const handleDownload = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    trackCVDownload(language);

    if (url.startsWith("http")) {
      e.preventDefault();
      try {
        const response = await fetch(
          `/api/download?url=${encodeURIComponent(url)}`,
        );
        if (!response.ok) throw new Error("Download failed");

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      } catch (error) {
        console.error("Failed to download CV:", error);
      }
    }
  };

  return (
    <Button
      asChild
      className={cn("hover:translate-y-0", className)}
      variant="glass"
    >
      <a
        href={url}
        download={fileName}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleDownload}
        className="group"
      >
        <FileDown className="mr-2 h-4 w-4 group-hover:animate-bounce" />
        {label}
      </a>
    </Button>
  );
}
