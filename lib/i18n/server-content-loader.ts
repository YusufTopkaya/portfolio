import { promises as fs } from "fs";
import path from "path";
import { Profile, SEOMetadata } from "./content-loader";

export async function getProfile(locale: string): Promise<Profile> {
  const filePath = path.join(process.cwd(), "content", locale, "profile.json");
  const fileContent = await fs.readFile(filePath, "utf8");
  return JSON.parse(fileContent);
}

export async function getSEOMetadata(locale: string): Promise<SEOMetadata> {
  const filePath = path.join(process.cwd(), "content", locale, "metadata.json");
  const fileContent = await fs.readFile(filePath, "utf8");
  return JSON.parse(fileContent);
}
