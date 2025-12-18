import { type NextRequest, NextResponse } from "next/server";
import { isValidLanguage } from "@/lib/i18n/config";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lang = searchParams.get("lang") || "en";

  if (!isValidLanguage(lang)) {
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });
  }

  try {
    // Dynamic import of the profile JSON
    const profile = await import(`@/content/${lang}/profile.json`);
    return NextResponse.json(profile.default || profile);
  } catch {
    return NextResponse.json(
      { error: "Profile not found for this language" },
      { status: 404 },
    );
  }
}
