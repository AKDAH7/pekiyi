/**
 * The generated proforma files of the 4 sample orders, in every document
 * language: what a customer would read in the PDF (numbers, totals, bank
 * details, Arabic shaping), what Excel would compute from the workbook, and
 * PNG renders of every PDF's first page in web/test-results/documents/ for
 * people to look at.
 *
 * Renders with headless Chrome (CHROMIUM_PATH or the installed Chrome).
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createStorage, mediumKey, type Storage } from "@/lib/storage";

import { DOCUMENT_LANGUAGES, proformaFileName, type DocumentLanguage } from "../languages";
import { closeBrowser } from "../pdf";
import { cachedResult, closeRenderBrowser, evaluateCell, pdfImageCount, pdfPagePng, pdfText } from "../test-support";

import { renderProforma } from "./render";
import { FIXTURE_IBANS, FIXTURE_NUMBERS, fixtureProductionNotes, fixtureSnapshot, FIXTURE_ISSUE_DATE, type FixtureKey } from "./test-fixtures";
import { buildProformaViewModel, type ProformaViewModel } from "./view-model";

// Chrome starts once for the file, then each document takes well under a second.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const OUTPUT = path.resolve(import.meta.dirname, "../../../test-results/documents");
const TMP_PARENT = path.resolve(import.meta.dirname, "../../../uploads");

/** Nothing stored in these tests has images, except the photo test (own temporary storage). */
const NO_IMAGES = { readMedium: async () => null };

/** What each sample's documents must show (English formatting; Turkish swaps the separators). */
const EXPECTED: Record<FixtureKey, { customer: string; total: string; advance?: string; balance?: string; eur?: string; cbm?: string }> = {
  hala: { customer: "HALA FURNITURE", total: "$51,100.00" },
  jian: { customer: "JIAN SMART ROIM", total: "$9,480.00", advance: "$500.00", balance: "$8,980.00" },
  virona: { customer: "VİRONA FURNITURE", total: "$12,000.00", advance: "$1,000.00", balance: "$11,000.00" },
  grand: { customer: "GRAND DIZAJN", total: "$5,943.00", advance: "$1,782.90", balance: "$4,160.10", eur: "€5,306.25", cbm: "33.6" },
};

const turkish = (amount: string) => amount.replace(/,/g, "#").replace(/\./g, ",").replace(/#/g, ".");
const amountIn = (amount: string, language: DocumentLanguage) => (language === "tr" ? turkish(amount) : amount);

/**
 * Arabic as pdf.js reads it back from the PDF: joined letters come out as
 * their contextual presentation forms, in visual order. "فاتورة" set
 * correctly reads ﻮﺗﺎﻓ (final waw, initial teh, final alef, initial feh)
 * and "سعر" ﺮﻌﺳ; letters drawn one by one, unjoined, would be isolated forms
 * or bare letters instead.
 */
const JOINED_ARABIC = ["ﻮﺗﺎﻓ", "ﺮﻌﺳ"];

const flat = (text: string) => text.replace(/\s+/g, " ");

beforeAll(async () => {
  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(OUTPUT, { recursive: true });
});

afterAll(async () => {
  await closeBrowser();
  await closeRenderBrowser();
});

describe.each(Object.keys(FIXTURE_NUMBERS) as FixtureKey[])("proforma PDF of %s", (fixture) => {
  const number = FIXTURE_NUMBERS[fixture];
  const expected = EXPECTED[fixture];

  it.each(DOCUMENT_LANGUAGES)("in %s", async (language) => {
    const model = buildProformaViewModel(fixtureSnapshot(fixture), { invoiceDate: FIXTURE_ISSUE_DATE, language });
    const pdf = await renderProforma(model, "pdf", NO_IMAGES);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

    const png = await pdfPagePng(pdf);
    await writeFile(path.join(OUTPUT, proformaFileName(number, expected.customer, language, "pdf").replace(/\.pdf$/, "_page1.png")), png);

    const { text: raw } = await pdfText(pdf);
    const text = flat(raw);
    expect(text).toContain(number);
    expect(text).toContain(expected.customer);
    expect(text).toContain(amountIn(expected.total, language));
    if (expected.advance) expect(text).toContain(amountIn(expected.advance, language));
    if (expected.balance) expect(text).toContain(amountIn(expected.balance, language));
    if (expected.eur) expect(text).toContain(amountIn(expected.eur, language));
    if (expected.cbm) expect(text).toContain(language === "tr" ? expected.cbm.replace(".", ",") : expected.cbm);
    for (const iban of FIXTURE_IBANS) expect(text).toContain(iban);
    expect(text).toContain("KTEFTRIS");

    for (const note of fixtureProductionNotes(fixture)) {
      for (const line of note.split("\n").filter((part) => part.length > 12)) expect(text).not.toContain(line.slice(0, 30));
    }

    if (language === "ar" || language === "en-ar") {
      for (const word of JOINED_ARABIC) expect(raw).toContain(word);
    }
    if (language === "en" || language === "en-ar") expect(text).toContain("PROFORMA INVOICE");
    if (language === "tr") expect(text).toContain("PROFORMA FATURA");
  });
});

describe("proforma PDF details", () => {
  it("VİRONA: customer notes and the sample approval are printed, production notes are not", async () => {
    const pdf = await renderProforma(buildProformaViewModel(fixtureSnapshot("virona"), { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" }), "pdf", NO_IMAGES);
    const { text, pages } = await pdfText(pdf);
    expect(pages).toBeGreaterThan(1);
    expect(flat(text)).toContain("GOLD PIPING ON ARM UPHOLSTERY");
    expect(flat(text)).toContain("Springs must be firm");
    expect(flat(text)).toContain("ÜRETİME BAŞLANDIĞINDA");
    expect(flat(text)).toContain("30 sets · 60 × 3-seater · 60 × armchair");
    expect(flat(text)).not.toContain("KOLLARIN KALIBININ");
    expect(flat(text)).not.toContain("TÜM ÜRÜNLER YAYLI OLACAK");
  });

  it("the draft preview carries the DRAFT watermark; an issued document doesn't", async () => {
    const snapshot = fixtureSnapshot("hala");
    const draft = await pdfText(await renderProforma(buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "en", draft: true }), "pdf", NO_IMAGES));
    const issued = await pdfText(await renderProforma(buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" }), "pdf", NO_IMAGES));
    expect(draft.text).toContain("DRAFT");
    expect(issued.text).not.toContain("DRAFT");
  });

  it("only the order currency's IBAN when the document options say so", async () => {
    const snapshot = fixtureSnapshot("hala", { change: (graph) => void (graph.order.documentOptions = { bankOrderCurrencyOnly: true }) });
    const { text } = await pdfText(await renderProforma(buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" }), "pdf", NO_IMAGES));
    expect(text).toContain(FIXTURE_IBANS[0]);
    expect(text).not.toContain(FIXTURE_IBANS[1]);
  });
});

describe("proforma photos", () => {
  let root: string;
  let storage: Storage;
  let photo: string;

  beforeAll(async () => {
    await mkdir(TMP_PARENT, { recursive: true });
    root = await mkdtemp(path.join(TMP_PARENT, "documents-test-"));
    storage = createStorage(root);
    const bytes = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#8a6a4a" } }).jpeg().toBuffer();
    photo = await storage.saveImage(new File([new Uint8Array(bytes)], "sofa.jpg", { type: "image/jpeg" }), "orders");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("embeds the medium-size variant (≤ 600 px, generated on first use) in the PDF and the workbook", async () => {
    const snapshot = fixtureSnapshot("grand", {
      change: (graph) => {
        graph.order.documentOptions = { ...graph.order.documentOptions, showPhotos: true };
        graph.items[0].photoPath = photo;
      },
    });
    const model = buildProformaViewModel(snapshot, { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" });
    expect(await storage.read(mediumKey(photo))).toBeNull();

    const pdf = await renderProforma(model, "pdf", storage);
    expect(await pdfImageCount(pdf)).toBe(1);
    const medium = await sharp((await storage.read(mediumKey(photo)))!.body).metadata();
    expect([medium.width, medium.height]).toEqual([600, 300]);
    await writeFile(path.join(OUTPUT, "PROFORMA_261022ZOC-REV11_GRAND-DIZAJN_en_photos_page1.png"), await pdfPagePng(pdf));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(await renderProforma(model, "xlsx", storage)).buffer);
    const sheet = workbook.getWorksheet("PROFORMA")!;
    const images = sheet.getImages();
    expect(images).toHaveLength(1);
    // Placed in the photo column, aspect ratio kept (2:1).
    const photoColumn = model.columns.findIndex((column) => column.key === "photo");
    expect(Math.floor(images[0].range.tl.nativeCol)).toBe(photoColumn);
    const ext = (images[0].range as unknown as { ext: { width: number; height: number } }).ext;
    expect(ext.width / ext.height).toBeCloseTo(2, 1);
  });
});

/** Address of the cell in column `col` (1-based) whose formula starts with `prefix`. */
function findFormula(sheet: ExcelJS.Worksheet, col: number, prefix: string): string | null {
  let found: string | null = null;
  sheet.eachRow((row) => {
    const cell = row.getCell(col);
    const value = cell.value;
    if (!found && value && typeof value === "object" && "formula" in value && String(value.formula).startsWith(prefix)) found = cell.address;
  });
  return found;
}

async function workbookOf(model: ProformaViewModel) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(await renderProforma(model, "xlsx", NO_IMAGES)).buffer);
  return workbook.getWorksheet("PROFORMA")!;
}

const columnOf = (model: ProformaViewModel, key: string) => model.columns.findIndex((column) => column.key === key) + 1;
const below = (address: string, rows: number) => address.replace(/\d+$/, (row) => String(Number(row) + rows));

describe("proforma Excel", () => {
  it.each(Object.keys(FIXTURE_NUMBERS) as FixtureKey[])("%s: real formulas whose results match the totals", async (fixture) => {
    const model = buildProformaViewModel(fixtureSnapshot(fixture), { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" });
    const sheet = await workbookOf(model);
    const totalCol = columnOf(model, "total");

    const total = findFormula(sheet, totalCol, "SUM(");
    expect(total).not.toBeNull();
    const expected = Number(EXPECTED[fixture].total.replace(/[$,]/g, ""));
    expect(cachedResult(sheet, total!)).toBe(expected);
    expect(evaluateCell(sheet, total!)).toBeCloseTo(expected, 2);

    // Every line total is amount × unit price (× (1 − discount)), its result cached.
    const lineTotal = findFormula(sheet, totalCol, "ROUND(");
    expect(sheet.getCell(lineTotal!).formula).toMatch(/^ROUND\([A-Z]+\d+\*[A-Z]+\d+(\*\(1-[A-Z]+\d+\))?,2\)$/);
    expect(evaluateCell(sheet, lineTotal!)).toBeCloseTo(cachedResult(sheet, lineTotal!)!, 2);

    const { advance, balance } = EXPECTED[fixture];
    if (advance && balance) {
      const advanceCell = below(total!, 1);
      const balanceCell = below(total!, 2);
      expect(evaluateCell(sheet, advanceCell)).toBeCloseTo(Number(advance.replace(/[$,]/g, "")), 2);
      expect(sheet.getCell(balanceCell).formula).toBe(`${total}-${advanceCell}`);
      expect(evaluateCell(sheet, balanceCell)).toBeCloseTo(Number(balance.replace(/[$,]/g, "")), 2);
      expect(cachedResult(sheet, balanceCell)).toBe(Number(balance.replace(/[$,]/g, "")));
    }

    expect(sheet.getCell(total!).numFmt).toBe('"$"#,##0.00');
    // Nothing is locked.
    sheet.eachRow((row) => row.eachCell((cell) => expect(cell.protection?.locked, cell.address).toBe(false)));
    expect(sheet.pageSetup).toMatchObject({ paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 });
    expect(sheet.pageSetup.printTitlesRow).toMatch(/^\d+:\d+$/);
    expect(sheet.views[0]).toMatchObject({ rightToLeft: false });
  });

  it("GRAND DIZAJN: the 30 % advance and the EUR figures are formulas on the percent and rate cells; CBM is summed", async () => {
    const model = buildProformaViewModel(fixtureSnapshot("grand"), { invoiceDate: FIXTURE_ISSUE_DATE, language: "en" });
    const sheet = await workbookOf(model);
    const totalCol = columnOf(model, "total");
    const total = findFormula(sheet, totalCol, "SUM(")!;

    const advance = below(total, 1);
    const percentCell = sheet.getCell(advance).formula.match(/\*([A-Z]+\d+),2\)$/)?.[1];
    expect(sheet.getCell(percentCell!).value).toBe(0.3);
    expect(sheet.getCell(percentCell!).numFmt).toBe("0%");
    expect(evaluateCell(sheet, advance)).toBeCloseTo(1782.9, 2);

    const eurCol = columnOf(model, "secondaryTotal");
    const eurTotal = below(total, 0).replace(/^[A-Z]+/, sheet.getColumn(eurCol).letter);
    const rateCell = sheet.getCell(eurTotal).formula.match(/\/([A-Z]+\d+),2\)$/)?.[1];
    expect(sheet.getCell(rateCell!).value).toBe(1.12);
    expect(evaluateCell(sheet, eurTotal)).toBeCloseTo(5306.25, 2);
    expect(cachedResult(sheet, eurTotal)).toBe(5306.25);
    expect(evaluateCell(sheet, below(eurTotal, 2))).toBeCloseTo(3714.37, 2);
    // Per line: the EUR unit price is the USD one over the rate.
    const eurUnit = findFormula(sheet, columnOf(model, "secondaryUnitPrice"), "ROUND(")!;
    expect(evaluateCell(sheet, eurUnit)).toBeCloseTo(112.5, 2);

    const cbmTotal = below(total, 0).replace(/^[A-Z]+/, sheet.getColumn(columnOf(model, "cbm")).letter);
    expect(sheet.getCell(cbmTotal).formula).toMatch(/^SUM\(/);
    expect(evaluateCell(sheet, cbmTotal)).toBeCloseTo(33.6, 3);
  });

  it("JIAN in Arabic: the sheet is right to left, labels in Arabic, piece prices as numbers", async () => {
    const model = buildProformaViewModel(fixtureSnapshot("jian"), { invoiceDate: FIXTURE_ISSUE_DATE, language: "ar" });
    const sheet = await workbookOf(model);
    expect(sheet.views[0]).toMatchObject({ rightToLeft: true });
    const values: string[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => values.push(String(cell.value))));
    expect(values).toContain("فاتورة أولية");
    expect(values).toContain("سعر كنبة ثلاثية");
    const pieceCol = columnOf(model, "piece:SEAT_3");
    let piecePrices = 0;
    sheet.eachRow((row) => {
      if (row.getCell(pieceCol).value === 235.2) piecePrices++;
    });
    expect(piecePrices).toBe(4);
    expect(evaluateCell(sheet, findFormula(sheet, columnOf(model, "total"), "SUM(")!)).toBeCloseTo(9480, 2);
  });
});
