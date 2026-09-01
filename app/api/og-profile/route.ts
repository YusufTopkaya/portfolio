import { type NextRequest, NextResponse } from "next/server";
import { Err } from "tsentials/errors";
import { Result } from "tsentials/result";
import { isValidLanguage } from "@/lib/i18n/config";

export async function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get("lang") || "en";

  if (!isValidLanguage(lang)) {
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });
  }

  // Dynamic import of the profile JSON as a Result — missing file becomes a
  // structured AppError instead of a swallowed throw.
  const profile = await Result.tryAsync(
    () => import(`@/content/${lang}/profile.json`),
    () =>
      Err.notFound("Profile.NotFound", "Profile not found for this language"),
  );

  return Result.match(
    profile,
    (mod) => NextResponse.json(mod.default ?? mod),
    (errors) =>
      NextResponse.json({ error: errors[0]?.description }, { status: 404 }),
  );
}
