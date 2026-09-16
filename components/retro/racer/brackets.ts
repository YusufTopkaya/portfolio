/**
 * LoL-style score brackets for Twingo Racer. Single source of truth for the
 * game-over badge and the leaderboard chips — derived from the score, so no
 * API or storage change is needed. Anchor: a 25-minute run (~65 km,
 * ~240k points) is Challenger; the difficulty squeeze is calibrated so each
 * step up demands a visibly lower gas-can miss rate.
 */
export interface RacerBracket {
  name: string;
  /** 2-3 letter tag for tight leaderboard rows */
  short: string;
  min: number;
  color: string;
}

// descending by threshold so `find` walks from the top
export const RACER_BRACKETS: RacerBracket[] = [
  { name: "CHALLENGER", short: "CHA", min: 240000, color: "#ffd94a" },
  { name: "GRANDMASTER", short: "GM", min: 215000, color: "#e5484d" },
  { name: "MASTER", short: "MAS", min: 185000, color: "#a45cff" },
  { name: "DIAMOND", short: "DIA", min: 155000, color: "#7ee7ff" },
  { name: "EMERALD", short: "EME", min: 125000, color: "#3ddc84" },
  { name: "PLATINUM", short: "PLA", min: 100000, color: "#4fd1c5" },
  { name: "GOLD", short: "GLD", min: 70000, color: "#ffc93c" },
  { name: "SILVER", short: "SIL", min: 40000, color: "#c0c8d0" },
  { name: "BRONZE", short: "BRO", min: 15000, color: "#c08457" },
  { name: "IRON", short: "IRO", min: 0, color: "#8a8f98" },
];

export const bracketForScore = (score: number): RacerBracket =>
  RACER_BRACKETS.find((b) => score >= b.min) ??
  RACER_BRACKETS[RACER_BRACKETS.length - 1];

/** the bracket above the current one, or null at the top */
export const nextBracket = (score: number): RacerBracket | null => {
  const idx = RACER_BRACKETS.indexOf(bracketForScore(score));
  return idx > 0 ? RACER_BRACKETS[idx - 1] : null;
};
