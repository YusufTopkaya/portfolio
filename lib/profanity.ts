// Profanity filter for leaderboard initials (3 chars, A-Z0-9).
// Normalizes common leetspeak so obfuscated variants (AMK -> 4MK, S1K, etc.)
// are caught too.

const LEET_MAP: Record<string, string> = {
  "0": "O",
  "1": "I",
  "2": "Z",
  "3": "E",
  "4": "A",
  "5": "S",
  "6": "G",
  "7": "T",
  "8": "B",
  "9": "G",
  "@": "A",
  $: "S",
};

const BLOCKED = new Set([
  // Turkish profanity / slurs (and common abbreviations)
  "AMK",
  "AMQ",
  "AMN",
  "AQ",
  "AMC",
  "AMS",
  "SIK",
  "SKR",
  "S1K",
  "GOT",
  "G0T",
  "YAR",
  "YRR",
  "YRK",
  "ORO",
  "ORS",
  "OQ",
  "OCR",
  "PIC",
  "PUS",
  "HAV",
  "FES",
  "MAL",
  // English profanity
  "ASS",
  "FUK",
  "FKU",
  "FCK",
  "FUQ",
  "CUM",
  "TIT",
  "CNT",
  "COK",
  "DIK",
  "DIE",
  "KYS",
  "SEX",
  "XXX",
  "ANL",
  "BJB",
  "WTF",
  "NIG",
  "NGR",
  "FAG",
  "GAY",
  "KKK",
  // German
  "ARS",
  "FTZ",
  "HSN",
  // Spanish / French / Italian common
  "MIE",
  "PUT",
  "PTA",
  "CUL",
  "CZO",
  "CAZ",
  "MER",
  "CON",
  // Japanese romaji
  "BAK",
  "BKA",
]);

/**
 * Returns true when the (already uppercased) initials contain a blocked
 * word either directly or after leetspeak normalization.
 */
export function isProfane(raw: string): boolean {
  const upper = raw.toUpperCase();
  if (BLOCKED.has(upper)) return true;
  let normalized = "";
  for (const ch of upper) normalized += LEET_MAP[ch] ?? ch;
  return BLOCKED.has(normalized);
}
