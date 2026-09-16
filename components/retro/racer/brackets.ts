/**
 * LoL-style score brackets for Twingo Racer. Single source of truth for the
 * game-over badge and the leaderboard gems — derived from the score, so no
 * API or storage change is needed. Anchor: a 25-minute run (~65 km,
 * ~120k points) is Challenger; the difficulty squeeze is calibrated so each
 * step up demands a visibly lower gas-can miss rate.
 */
export interface RacerBracket {
  name: string;
  min: number;
  color: string;
}

// descending by threshold so `find` walks from the top. Rounded halves
// of the original scale (score accrues at ×0.5): GRANDMASTER sits on
// the marquee 100k, CHALLENGER keeps the 25-minute anchor at 120k
export const RACER_BRACKETS: RacerBracket[] = [
  { name: "CHALLENGER", min: 120000, color: "#ffd94a" },
  { name: "GRANDMASTER", min: 100000, color: "#e5484d" },
  { name: "MASTER", min: 85000, color: "#a45cff" },
  { name: "DIAMOND", min: 70000, color: "#7ee7ff" },
  { name: "EMERALD", min: 60000, color: "#3ddc84" },
  { name: "PLATINUM", min: 50000, color: "#4fd1c5" },
  { name: "GOLD", min: 35000, color: "#ffc93c" },
  { name: "SILVER", min: 20000, color: "#c0c8d0" },
  { name: "BRONZE", min: 10000, color: "#c08457" },
  { name: "IRON", min: 0, color: "#8a8f98" },
];

export const bracketForScore = (score: number): RacerBracket =>
  RACER_BRACKETS.find((b) => score >= b.min) ??
  RACER_BRACKETS[RACER_BRACKETS.length - 1];

/** the bracket above the current one, or null at the top */
export const nextBracket = (score: number): RacerBracket | null => {
  const idx = RACER_BRACKETS.indexOf(bracketForScore(score));
  return idx > 0 ? RACER_BRACKETS[idx - 1] : null;
};
