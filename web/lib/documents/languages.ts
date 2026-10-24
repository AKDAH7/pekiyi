/**
 * Languages a document can be rendered in: one of the three, or English and
 * Arabic together ("en-ar": every label shows both). Pure and client-safe:
 * the order page builds download links from it.
 */
import { DOC_LANGUAGES, type DocLanguage } from "@/db/schema/common";

export const DOCUMENT_LANGUAGES = ["en", "tr", "ar", "en-ar"] as const;
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number];

export const DOCUMENT_FORMATS = ["pdf", "xlsx"] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

/** The language labels and texts are taken from first; the second one of a bilingual document. */
export function languageParts(language: DocumentLanguage): { main: DocLanguage; alt: DocLanguage | null } {
  if (language === "en-ar") return { main: "en", alt: "ar" };
  return { main: language, alt: null };
}

export function isRtl(language: DocumentLanguage): boolean {
  return language === "ar";
}

/** A customer's document language as a document language (the customer default for downloads). */
export function toDocumentLanguage(language: string | null | undefined): DocumentLanguage {
  return (DOC_LANGUAGES as readonly string[]).includes(language ?? "") ? (language as DocLanguage) : "en";
}

const TURKISH_ASCII: Record<string, string> = { ı: "i", İ: "I", ş: "s", Ş: "S", ğ: "g", Ğ: "G", ç: "c", Ç: "C", ö: "o", Ö: "O", ü: "u", Ü: "U" };

/** "VİRONA FURNITURE" → "VIRONA-FURNITURE": letters, digits and dashes only. */
export function asciiSlug(text: string): string {
  return text
    .replace(/[ıİşŞğĞçÇöÖüÜ]/g, (letter) => TURKISH_ASCII[letter])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** PROFORMA_261020ZOC-REV1_VIRONA-FURNITURE_en.pdf */
export function proformaFileName(number: string, customer: string, language: DocumentLanguage, format: DocumentFormat): string {
  const parts = ["PROFORMA", asciiSlug(number), asciiSlug(customer).toUpperCase() || "CUSTOMER", language];
  return `${parts.filter(Boolean).join("_")}.${format}`;
}
