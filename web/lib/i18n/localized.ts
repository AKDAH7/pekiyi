import type { LocalizedText } from "@/db/schema/common";

/** The text in `locale`, else Turkish, else any language that is filled in. */
export function pickLocalized(text: LocalizedText | null | undefined, locale: string): string {
  if (!text) return "";
  const value = text[locale as keyof LocalizedText] || text.tr || text.en || text.ar;
  return value ?? "";
}
