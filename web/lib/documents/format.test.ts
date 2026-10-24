import { describe, expect, it } from "vitest";

import { documentLabels, formatDocDate, formatMoney, pickText } from "./format";
import { asciiSlug, proformaFileName } from "./languages";

describe("document formats", () => {
  it("prints unambiguous dates in every language", () => {
    expect(formatDocDate("2026-10-22", "en")).toBe("22 Oct 2026");
    expect(formatDocDate("2026-10-22", "tr")).toBe("22 Eki 2026");
    expect(formatDocDate("2026-10-22", "ar")).toBe("22 أكتوبر 2026");
  });

  it("prints money with the currency symbol and the language's separators, Latin digits in Arabic", () => {
    expect(formatMoney("51100.00", "USD", "en")).toBe("$51,100.00");
    expect(formatMoney("51100.00", "USD", "tr")).toBe("$51.100,00");
    expect(formatMoney("5306.25", "EUR", "ar")).toBe("€5,306.25");
    expect(formatMoney("1250", "CHF", "en")).toBe("CHF1,250.00");
  });

  it("falls back to English, then Turkish, for texts missing in the document language", () => {
    expect(pickText({ en: "2-3 WEEKS" }, "tr")).toBe("2-3 WEEKS");
    expect(pickText({ tr: "Kapuçino" }, "ar")).toBe("Kapuçino");
    expect(pickText({ en: "Brown", tr: "Kahve" }, "ar")).toBe("Brown");
    expect(pickText(null, "en")).toBe("");
  });

  it("bilingual labels carry both languages", () => {
    expect(documentLabels("en-ar")("balance")).toEqual({ main: "Balance", alt: "المبلغ المتبقي" });
    expect(documentLabels("tr")("totalPrice", { incoterm: "EXW" })).toEqual({ main: "EXW Toplam Tutar" });
  });
});

describe("document file names", () => {
  it("are safe ASCII: PROFORMA_<number>_<CUSTOMER>_<lang>.<ext>", () => {
    expect(proformaFileName("261020ZOC-REV1", "VİRONA FURNITURE", "en", "pdf")).toBe("PROFORMA_261020ZOC-REV1_VIRONA-FURNITURE_en.pdf");
    expect(proformaFileName("261010-1ZOC", "JIAN SMART ROIM", "en-ar", "xlsx")).toBe("PROFORMA_261010-1ZOC_JIAN-SMART-ROIM_en-ar.xlsx");
    expect(asciiSlug("Şık Ağaç & Çelik / Öz Üretim")).toBe("Sik-Agac-Celik-Oz-Uretim");
    expect(proformaFileName("261012-1ZOC", "شركة الأثاث", "ar", "pdf")).toBe("PROFORMA_261012-1ZOC_CUSTOMER_ar.pdf");
  });
});
