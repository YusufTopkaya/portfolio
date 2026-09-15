import { type NextRequest, NextResponse } from "next/server";
import { getSalt, issueToken, listScores, type ScorePeriod, submitScore } from "@/lib/highscore";
import { getClientIP, rateLimit } from "@/lib/rate-limit";
import { withSecurity } from "@/lib/security-wrapper";

// Limit for FAILED submissions only; a valid single-use token is the anti-spam proof.
const SUBMIT_LIMIT = 10;
const SUBMIT_WINDOW_MS = 15 * 60 * 1000;
// Generous GET budget on top of the wrapper's global one (shared bucket behind proxies).
const GET_LIMIT = 600;
const GET_WINDOW_MS = 15 * 60 * 1000;

const PERIODS = new Set<ScorePeriod>(["all", "daily", "weekly", "monthly"]);

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function saltMissing(): NextResponse {
  return noStore(
    NextResponse.json(
      { error: "Highscore service not configured" },
      { status: 503 },
    ),
  );
}

async function getHandler(request: NextRequest) {
  if (!getSalt()) return saltMissing();
  const ip = getClientIP(request);
  if (!rateLimit(`highscore-get:${ip}`, GET_LIMIT, GET_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const raw = request.nextUrl.searchParams.get("period") ?? "all";
  const period = PERIODS.has(raw as ScorePeriod) ? (raw as ScorePeriod) : "all";
  const scores = await listScores(period);
  return noStore(NextResponse.json({ scores }));
}

async function postHandler(request: NextRequest) {
  const salt = getSalt();
  if (!salt) return saltMissing();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = (body as { action?: unknown })?.action;

  if (action === "start") {
    const { token } = await issueToken(salt);
    return noStore(NextResponse.json({ token }));
  }

  if (action === "submit") {
    const ip = getClientIP(request);
    const { token, name, score, durationSec } = body as Record<string, unknown>;
    if (
      typeof token !== "string" ||
      typeof name !== "string" ||
      typeof score !== "number" ||
      typeof durationSec !== "number"
    ) {
      console.error(
        `[highscore] submit rejected ip=${ip} status=400 reason="Missing or invalid fields"`,
        {
          token: typeof token,
          name: typeof name,
          score: typeof score,
          durationSec: typeof durationSec,
        },
      );
      return NextResponse.json(
        { error: "Missing or invalid fields" },
        { status: 400 },
      );
    }
    const result = await submitScore(salt, { token, name, score, durationSec });
    if (!result.ok) {
      // Only failed submissions count against the IP limit.
      if (!rateLimit(`highscore:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
        console.error(
          `[highscore] submit rejected ip=${ip} status=429 reason="Too many requests"`,
        );
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
      const status = result.error === "invalid_token" ? 403 : 422;
      console.error(
        `[highscore] submit rejected ip=${ip} status=${status} reason="${result.message}"`,
        { name, score, durationSec },
      );
      return NextResponse.json(
        { error: result.message },
        { status },
      );
    }
    console.log(
      `[highscore] score saved ip=${ip} rank=${result.rank}`,
      { name, score, durationSec },
    );
    return noStore(NextResponse.json({ rank: result.rank, scores: result.scores }));
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const GET = withSecurity(getHandler);
export const POST = withSecurity(postHandler);
