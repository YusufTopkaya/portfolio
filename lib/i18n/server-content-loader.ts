import { promises as fs } from "node:fs";
import path from "node:path";
import { Err } from "tsentials/errors";
import { safeJsonParse } from "tsentials/json";
import { Result, ResultAsync } from "tsentials/result";
import type { Profile, SEOMetadata } from "./content-loader";

// Load and parse a content JSON file as a Result. A missing file becomes a
// structured NotFound AppError and malformed JSON surfaces as Json.SyntaxError —
// neither crashes the caller the way a bare `JSON.parse` would.
function loadContentJson<T>(
  filePath: string,
  notFoundCode: string,
  locale: string,
): Promise<Result<T>> {
  return ResultAsync.try(
    () => fs.readFile(filePath, "utf8"),
    () =>
      Err.notFound(notFoundCode, `Content not found for locale '${locale}'`),
  )
    .andThen((content) => safeJsonParse(content))
    .map((json) => json as unknown as T)
    .toResult();
}

export function getProfileResult(locale: string): Promise<Result<Profile>> {
  const filePath = path.join(process.cwd(), "content", locale, "profile.json");
  return loadContentJson<Profile>(filePath, "Profile.NotFound", locale);
}

export function getSEOMetadataResult(
  locale: string,
): Promise<Result<SEOMetadata>> {
  const filePath = path.join(process.cwd(), "content", locale, "metadata.json");
  return loadContentJson<SEOMetadata>(filePath, "Metadata.NotFound", locale);
}

// Backward-compatible wrappers — preserve the throwing Promise<T> contract for
// existing consumers, but now throw a structured AppError description instead of
// an unguarded parse/read exception.
export async function getProfile(locale: string): Promise<Profile> {
  return Result.match(
    await getProfileResult(locale),
    (profile) => profile,
    (errors) => {
      throw new Error(errors[0]?.description ?? "Failed to load profile");
    },
  );
}

export async function getSEOMetadata(locale: string): Promise<SEOMetadata> {
  return Result.match(
    await getSEOMetadataResult(locale),
    (metadata) => metadata,
    (errors) => {
      throw new Error(errors[0]?.description ?? "Failed to load metadata");
    },
  );
}
