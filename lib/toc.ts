export interface TocItem {
  text: string;
  id: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractTocItems(markdown: string): TocItem[] {
  const lines = markdown.split("\n");
  const items: TocItem[] = [];

  for (const line of lines) {
    if (/^## (?!#)/.test(line)) {
      const text = line.replace(/^## /, "").trim();
      if (text) {
        items.push({ text, id: slugify(text) });
      }
    }
  }

  return items;
}
