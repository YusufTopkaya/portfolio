import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isProfane } from "@/lib/profanity";

export interface ScoreEntry {
  name: string;
  score: number;
  durationSec: number;
  at: string; // ISO date
}

interface StoreFile {
  version: number;
  scores: ScoreEntry[];
  nonces: Record<string, number>; // hmacHex -> issuedAt ms (single-use)
}

// v3: the difficulty squeeze (drainGain ×1.9 deep-game cap) made old
// scores incomparable — they were earned on the easy flat-cap economy.
// v4: score accrual halved (×0.5) so 100k is the marquee number
// v5: the 3-heart damage ladder (3rd crash = run over) plus the hot-chain
// boost economy changed what a run is worth — old scores predate both
const STORE_VERSION = 5;
const MAX_SCORES = 50;
const MAX_STORED = 300; // hard cap on the file, incl. entries kept for period boards
const RETENTION_MS = 40 * 24 * 60 * 60 * 1000; // keep recent entries for period boards
const NONCE_TTL_MS = 30 * 60 * 1000;
const MAX_SCORE_PER_SEC = 150; // generous plausibility bound: 100/s flat out
// at the x4 multiplier on the halved (×0.5) score scale
const MIN_DURATION_SEC = 3;

const STORE_PATH =
  process.env.HIGHSCORE_FILE ?? path.join(process.cwd(), "data", "highscores.json");

export function getSalt(): string | null {
  const salt = process.env.HIGHSCORE_SALT;
  return salt && salt.length >= 16 ? salt : null;
}

// Simple in-process mutex: serialize all read-modify-write cycles.
let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn);
  queue = result.catch(() => undefined);
  return result;
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    // Version bump wipes pre-existing scores (retention policy changed); nonces survive.
    const stale = parsed.version !== STORE_VERSION;
    return {
      version: STORE_VERSION,
      scores: !stale && Array.isArray(parsed.scores) ? parsed.scores : [],
      nonces: parsed.nonces && typeof parsed.nonces === "object" ? parsed.nonces : {},
    };
  } catch {
    return { version: STORE_VERSION, scores: [], nonces: {} };
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ ...store, version: STORE_VERSION }), "utf8");
  await rename(tmp, STORE_PATH);
}

function sign(nonce: string, issuedAt: number, salt: string): string {
  return createHmac("sha256", salt).update(`${nonce}.${issuedAt}`).digest("hex");
}

export interface StartResult {
  token: string; // nonce.issuedAt.hmacHex
}

/** Issue a single-use signed token for one game session. */
export async function issueToken(salt: string): Promise<StartResult> {
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = Date.now();
  const hmacHex = sign(nonce, issuedAt, salt);
  await withLock(async () => {
    const store = await readStore();
    const cutoff = Date.now() - NONCE_TTL_MS;
    for (const [key, at] of Object.entries(store.nonces)) {
      if (at < cutoff) delete store.nonces[key];
    }
    store.nonces[hmacHex] = issuedAt;
    await writeStore(store);
  });
  return { token: `${nonce}.${issuedAt}.${hmacHex}` };
}

export type SubmitResult =
  | { ok: true; rank: number; scores: ScoreEntry[] }
  | { ok: false; error: "invalid_token" | "invalid_input"; message: string };

/** Validate a submission and, when legit, persist it. Returns rank + top list. */
export async function submitScore(
  salt: string,
  input: { token: string; name: string; score: number; durationSec: number },
): Promise<SubmitResult> {
  const name = (input.name ?? "").toUpperCase();
  const score = input.score;
  const durationSec = input.durationSec;

  // --- input validation (before touching the store) ---
  if (!/^[A-Z0-9]{3}$/.test(name)) {
    return { ok: false, error: "invalid_input", message: "Name must be 3 chars A-Z0-9" };
  }
  if (isProfane(name)) {
    return { ok: false, error: "invalid_input", message: "Name not allowed" };
  }
  if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0) {
    return { ok: false, error: "invalid_input", message: "Invalid score" };
  }
  if (!Number.isFinite(durationSec) || durationSec < MIN_DURATION_SEC || durationSec > 86_400) {
    return { ok: false, error: "invalid_input", message: "Invalid duration" };
  }
  // Plausibility: score cannot exceed what the game can produce in the elapsed time.
  if (score > Math.ceil(durationSec * MAX_SCORE_PER_SEC) + 500) {
    return { ok: false, error: "invalid_input", message: "Implausible score" };
  }

  // --- token validation ---
  const parts = (input.token ?? "").split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "invalid_token", message: "Malformed token" };
  }
  const [nonce, issuedAtStr, hmacHex] = parts;
  const issuedAt = Number(issuedAtStr);
  if (!nonce || !Number.isFinite(issuedAt) || !/^[0-9a-f]{64}$/.test(hmacHex)) {
    return { ok: false, error: "invalid_token", message: "Malformed token" };
  }
  const expected = sign(nonce, issuedAt, salt);
  const a = Buffer.from(hmacHex, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "invalid_token", message: "Bad signature" };
  }
  if (Date.now() - issuedAt > NONCE_TTL_MS) {
    return { ok: false, error: "invalid_token", message: "Token expired" };
  }

  // --- consume nonce + persist (locked) ---
  return withLock(async () => {
    const store = await readStore();
    if (!(hmacHex in store.nonces)) {
      return { ok: false, error: "invalid_token", message: "Token already used or unknown" };
    }
    delete store.nonces[hmacHex];

    const entry: ScoreEntry = {
      name,
      score,
      durationSec: Math.round(durationSec * 10) / 10,
      at: new Date().toISOString(),
    };
    store.scores.push(entry);
    // Sort: score desc, older entry wins ties.
    store.scores.sort((x, y) => y.score - x.score || x.at.localeCompare(y.at));
    // Retention: keep the all-time top 50 plus everything from the last 40 days
    // (period boards need recent history). Hard cap at MAX_STORED — the all-time
    // top 50 are never dropped; the oldest recent entries go first.
    const top = store.scores.slice(0, MAX_SCORES);
    const topSet = new Set(top);
    const cutoff = Date.now() - RETENTION_MS;
    const recent = store.scores
      .filter((e) => !topSet.has(e) && Date.parse(e.at) >= cutoff)
      .sort((x, y) => y.at.localeCompare(x.at))
      .slice(0, MAX_STORED - top.length);
    const keep = new Set([...top, ...recent]);
    store.scores = store.scores.filter((e) => keep.has(e));
    await writeStore(store);

    const rank = store.scores.indexOf(entry) + 1;
    return { ok: true, rank, scores: store.scores.slice(0, 10) };
  });
}

export type ScorePeriod = "all" | "daily" | "weekly" | "monthly";

const PERIOD_WINDOWS_MS: Record<Exclude<ScorePeriod, "all">, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/** Public top-10 listing; rolling windows for period boards. */
export async function listScores(period: ScorePeriod = "all"): Promise<ScoreEntry[]> {
  const store = await readStore();
  const cutoff = period === "all" ? 0 : Date.now() - PERIOD_WINDOWS_MS[period];
  return store.scores
    .filter((e) => Date.parse(e.at) >= cutoff)
    .sort((x, y) => y.score - x.score || x.at.localeCompare(y.at))
    .slice(0, 10);
}
