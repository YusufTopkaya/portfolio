import { type NextRequest, NextResponse } from "next/server";
import { getSalt, issueToken, listScores, submitScore } from "@/lib/highscore";
import { getClientIP, rateLimit } from "@/lib/rate-limit";
import { withSecurity } from "@/lib/security-wrapper";

// Tighter limit for submissions on top of the wrapper's global one.
const SUBMIT_LIMIT = 10;
const SUBMIT_WINDOW_MS = 15 * 60 * 1000;

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

async function getHandler(_request: NextRequest) {
  if (!getSalt()) return saltMissing();
  const scores = await listScores();
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
    if (!rateLimit(`highscore:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const { token, name, score, durationSec } = body as Record<string, unknown>;
    if (
      typeof token !== "string" ||
      typeof name !== "string" ||
      typeof score !== "number" ||
      typeof durationSec !== "number"
    ) {
      return NextResponse.json(
        { error: "Missing or invalid fields" },
        { status: 400 },
      );
    }
    const result = await submitScore(salt, { token, name, score, durationSec });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.message },
        { status: result.error === "invalid_token" ? 403 : 422 },
      );
    }
    return noStore(NextResponse.json({ rank: result.rank, scores: result.scores }));
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const GET = withSecurity(getHandler);
export const POST = withSecurity(postHandler);
