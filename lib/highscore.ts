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
  scores: ScoreEntry[];
  nonces: Record<string, number>; // hmacHex -> issuedAt ms (single-use)
}

const MAX_SCORES = 50;
const NONCE_TTL_MS = 30 * 60 * 1000;
const MAX_SCORE_PER_SEC = 150; // generous plausibility bound
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
    const parsed = JSON.parse(raw) as StoreFile;
    return {
      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
      nonces: parsed.nonces && typeof parsed.nonces === "object" ? parsed.nonces : {},
    };
  } catch {
    return { scores: [], nonces: {} };
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(store), "utf8");
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
  if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0 || score > 10_000_000) {
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
    // Sort: score desc, older entry wins ties. Keep top 50.
    store.scores.sort((x, y) => y.score - x.score || x.at.localeCompare(y.at));
    store.scores = store.scores.slice(0, MAX_SCORES);
    await writeStore(store);

    const rank = store.scores.indexOf(entry) + 1;
    return { ok: true, rank, scores: store.scores.slice(0, 10) };
  });
}

/** Public top-10 listing. */
export async function listScores(): Promise<ScoreEntry[]> {
  const store = await readStore();
  return store.scores
    .slice()
    .sort((x, y) => y.score - x.score || x.at.localeCompare(y.at))
    .slice(0, 10);
}
