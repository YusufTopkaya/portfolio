"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Listens for the key sequence "yusuf" and navigates to /joke when matched.
 * - Debounces sequence state on focus loss
 * - Ignores modifier keys
 */
export default function KeySequenceListener() {
  const router = useRouter();
  const bufferRef = useRef<string>("");
  const timeoutRef = useRef<number | null>(null);
  const target = process.env.NEXT_PUBLIC_KEY_SEQUENCE;
  const maxPauseMs = 1000; // allow up to 1s pause between keys

  useEffect(() => {
    function clearBuffer() {
      bufferRef.current = "";
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    function scheduleClear() {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        bufferRef.current = "";
        timeoutRef.current = null;
      }, maxPauseMs) as unknown as number;
    }

    function onKeyDown(e: KeyboardEvent) {
      // Ignore modifier-only keys
      if (e.ctrlKey || e.metaKey || e.altKey) return;

  const key = e.key.toLowerCase();

      // Only accept single-character a-z keys
      if (!/^[a-z]$/.test(key)) {
        // reset on other keys so sequence must be consecutive
        clearBuffer();
        return;
      }

      // append and schedule a buffer clear after a short pause
      bufferRef.current += key;
      scheduleClear();

      if (target && !target.startsWith(bufferRef.current)) {
        // mismatch: maybe this key starts the sequence
        bufferRef.current = key === target[0] ? key : "";
        scheduleClear();
      }

      if (bufferRef.current === target) {
        // choose randomly between two client-exposed env URLs
        const url1 = process.env.NEXT_PUBLIC_CGR;
        const url2 = process.env.NEXT_PUBLIC_BR;
        const choices = [url1, url2].filter(Boolean) as string[];

        if (choices.length === 0) {
          // No client-provided targets — do nothing
          clearBuffer();
          return;
        }

        const chosen = choices[Math.floor(Math.random() * choices.length)];

        // perform a full external navigation to the chosen URL
        window.location.href = chosen;
        clearBuffer();
      }
    }

    function onBlur() {
      // Clear buffer when window loses focus
      clearBuffer();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [router]);

  return null;
}
