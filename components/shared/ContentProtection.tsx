"use client";

import { useEffect } from "react";
import { initContentProtection } from "@/lib/content-protection";

export function ContentProtection(): null {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      const cleanup = initContentProtection();
      return cleanup;
    }
  }, []);

  return null;
}
