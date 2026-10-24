/**
 * How documents print dates, money and texts — the same in the PDF and the
 * Excel file, whatever the server's locale or timezone. Pure.
 */
import { createTranslator } from "next-intl";

import type { DocLanguage, LocalizedText } from "@/db/schema/common";
import { formatDecimal } from "@/lib/format/number";
import ar from "@/messages/documents/ar.json";
import en from "@/messages/documents/en.json";
import tr from "@/messages/documents/tr.json";

import { languageParts, type DocumentLanguage } from "./languages";

const MESSAGES = { en, tr, ar } as const;

/** Intl locale per language: English dates as "22 Oct 2026", Arabic with Latin digits. */
const DATE_LOCALES: Record<DocLanguage, string> = { en: "en-GB", tr: "tr-TR", ar: "ar-u-nu-latn" };
const NUMBER_LOCALES: Record<DocLanguage, string> = { en: "en", tr: "tr", ar: "ar" };

/** "2026-10-22" → "22 Oct 2026" / "22 Eki 2026" / "22 أكتوبر 2026" (month names: never ambiguous). */
export function formatDocDate(date: string, language: DocLanguage): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(DATE_LOCALES[language], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", TRY: "₺", GBP: "£" };

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? currency;
}

/** Thousands separators per language, Latin digits everywhere: "51,100.00" / "51.100,00". */
export function formatAmount(value: string, language: DocLanguage, digits = 2): string {
  return formatDecimal(value, NUMBER_LOCALES[language], { minimumFractionDigits: digits });
}

/** "$51,100.00" / "$51.100,00" / "€5,306.25": the symbol first in every language. */
export function formatMoney(value: string, currency: string, language: DocLanguage): string {
  const amount = formatAmount(value, language);
  return value.startsWith("-") ? `-${currencySymbol(currency)}${amount.slice(1)}` : `${currencySymbol(currency)}${amount}`;
}

/** A plain number: up to three decimals, trailing zeros dropped ("33.6", "2.5"). */
export function formatNumber(value: string, language: DocLanguage): string {
  return formatDecimal(value, NUMBER_LOCALES[language], { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

/** CBM: "33.6", "0.8". */
export const formatCbm = formatNumber;

/** A translatable value in `language`, falling back to English, then Turkish (then whatever exists). */
export function pickText(text: LocalizedText | null | undefined, language: DocLanguage): string {
  if (!text) return "";
  return text[language] || text.en || text.tr || text.ar || "";
}

/** A label of a document: its text, and the second language's on bilingual documents. */
export type Label = { main: string; alt?: string };

type ProformaKey = Parameters<ReturnType<typeof createTranslator<typeof en, "proforma">>>[0];
type Values = Record<string, string | number>;
/** Placeholder values; a function when they differ per language (a piece type's name). */
type LabelValues = Values | ((language: DocLanguage) => Values);

/** The document labels (messages/documents/*.json) of `language`; bilingual ones carry both languages. */
export function documentLabels(language: DocumentLanguage) {
  const { main, alt } = languageParts(language);
  const translate = (lang: DocLanguage) =>
    createTranslator({ locale: lang, messages: MESSAGES[lang], namespace: "proforma" });
  const mainT = translate(main);
  const altT = alt ? translate(alt) : null;
  const valuesIn = (values: LabelValues | undefined, lang: DocLanguage) =>
    typeof values === "function" ? values(lang) : values;
  return (key: ProformaKey, values?: LabelValues): Label => {
    const text = mainT(key, valuesIn(values, main));
    const second = alt ? altT?.(key, valuesIn(values, alt)) : undefined;
    return second && second !== text ? { main: text, alt: second } : { main: text };
  };
}

