/**
 * The proforma as an Excel workbook (exceljs): one sheet "PROFORMA" with the
 * same blocks in the same order as the PDF, laid out from the same view
 * model. Figures are real numbers and formulas (line total = amount × unit
 * price × (1 − discount), totals = SUM, balance = total − advance, the
 * secondary currency from the rate cell), each with its cached result, so
 * the file shows the right figures before Excel recalculates and keeps
 * working when someone edits a price. Nothing is locked.
 */
import ExcelJS from "exceljs";

import { currencySymbol, type Label } from "../format";

import type { DocumentImages } from "./html";
import type { Column, ProformaViewModel, TotalRow } from "./view-model";

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6E6E6" } };
const FONT = { name: "Arial", size: 9 };

const WIDTHS: Record<string, number> = {
  product: 18,
  composition: 14,
  fabric: 26,
  amount: 8,
  unit: 9,
  unitPrice: 13,
  discount: 9,
  total: 14,
  secondaryUnitPrice: 13,
  secondaryTotal: 14,
  unitCbm: 9,
  cbm: 9,
  photo: 22,
};

const PHOTO_ROW_HEIGHT = 62; // points
const PHOTO_BOX = { width: 150, height: 76 }; // pixels

/** Excel number format with the currency symbol in front, like the PDF. */
const moneyFormat = (currency: string) => `"${currencySymbol(currency).replace(/"/g, "")}"#,##0.00`;
const CBM_FORMAT = "#,##0.###";

const num = (value: string | null | undefined) => (value === null || value === undefined || value === "" ? null : Number(value));

/** Column letter of 1-based column `index`. */
function letter(index: number): string {
  let name = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

const labelValue = (label: Label) => (label.alt ? `${label.main}\n${label.alt}` : label.main);

/** Rough row height for wrapped text in a merged cell `chars` wide. */
function textHeight(texts: readonly string[], chars: number, base = 13): number {
  const lines = texts.flatMap((text) => text.split("\n")).reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / Math.max(chars, 10))), 0);
  return Math.max(base, lines * 12 + 4);
}

/** The workbook, as the bytes of an .xlsx file. */
export async function proformaWorkbook(model: ProformaViewModel, images: DocumentImages): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = model.company.brandName || "PEKİYİ";
  workbook.created = new Date(0);
  const sheet = workbook.addWorksheet("PROFORMA", {
    views: [{ rightToLeft: model.dir === "rtl", showGridLines: false }],
  });

  const { columns } = model;
  const count = Math.max(columns.length, 6);
  const colOf = (key: string) => columns.findIndex((column) => column.key === key) + 1; // 0 = absent
  sheet.columns = Array.from({ length: count }, (_, index) => {
    const column = columns[index];
    const width = column ? (WIDTHS[column.key] ?? 13) : 12;
    return { width };
  });

  /** Writes a cell: value, font, border, unlocked. */
  const put = (
    row: number,
    col: number,
    value: ExcelJS.CellValue,
    style: { bold?: boolean; fill?: boolean; format?: string; align?: "left" | "center" | "right"; wrap?: boolean; size?: number } = {},
  ) => {
    const cell = sheet.getCell(row, col);
    cell.value = value;
    cell.font = { ...FONT, bold: style.bold ?? false, size: style.size ?? FONT.size };
    cell.border = BORDER;
    cell.protection = { locked: false };
    cell.alignment = {
      vertical: "middle",
      horizontal: style.align ?? (model.dir === "rtl" ? "right" : "left"),
      wrapText: style.wrap ?? true,
      readingOrder: model.dir === "rtl" ? "rtl" : "ltr",
    };
    if (style.fill) cell.fill = HEADER_FILL;
    if (style.format) cell.numFmt = style.format;
    return cell;
  };
  const merge = (row: number, from: number, to: number) => {
    if (to > from) sheet.mergeCells(row, from, row, to);
    for (let col = from + 1; col <= to; col++) {
      const cell = sheet.getCell(row, col);
      cell.border = BORDER;
      cell.protection = { locked: false };
    }
  };
  const placeImage = (key: string | null, row: number, col: number, box = PHOTO_BOX) => {
    const image = key ? images.get(key) : undefined;
    if (!image || image.width === 0 || image.height === 0) return;
    const scale = Math.min(box.width / image.width, box.height / image.height, 1);
    const extension = image.contentType === "image/png" ? "png" : "jpeg";
    const id = workbook.addImage({ base64: image.body.toString("base64"), extension });
    sheet.addImage(id, {
      tl: { col: col - 1 + 0.05, row: row - 1 + 0.05 },
      ext: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) },
      editAs: "oneCell",
    });
  };

  let row = 1;

  // --- header: logo | title | legal name -------------------------------
  const titleFrom = 3;
  const titleTo = Math.max(titleFrom, count - 2);
  put(row, 1, model.company.logo && images.has(model.company.logo) ? "" : model.company.brandName, { bold: true, size: 14, align: "center" });
  merge(row, 1, 2);
  placeImage(model.company.logo, row, 1, { width: 170, height: 60 });
  put(row, titleFrom, labelValue(model.labels.title), { bold: true, size: 14, align: "center" });
  merge(row, titleFrom, titleTo);
  put(row, titleTo + 1, model.company.legalName, { bold: true, align: "center" });
  merge(row, titleTo + 1, count);
  sheet.getRow(row).height = 52;
  row += 2;

  // --- buyer | terms -----------------------------------------------------
  const split = Math.max(3, Math.ceil(count * 0.55));
  const infoRows = Math.max(model.buyer.length, model.terms.length);
  for (let index = 0; index < infoRows; index++) {
    const buyer = model.buyer[index];
    const term = model.terms[index];
    if (buyer) {
      put(row, 1, labelValue(buyer.label), { bold: true, fill: true });
      put(row, 2, buyer.lines.join("\n"));
      merge(row, 2, split);
    }
    if (term) {
      put(row, split + 1, labelValue(term.label), { bold: true, fill: true });
      put(row, split + 2, term.lines.join("\n"));
      merge(row, split + 2, count);
    }
    const height = Math.max(textHeight(buyer?.lines ?? [], 40), textHeight(term?.lines ?? [], 24), model.language === "en-ar" ? 26 : 15);
    sheet.getRow(row).height = height;
    row++;
  }
  row++;

  // --- lines table -------------------------------------------------------
  const headerRow = row;
  columns.forEach((column, index) => put(row, index + 1, labelValue(column.label), { bold: true, fill: true, align: "center" }));
  sheet.getRow(row).height = model.language === "en-ar" ? 30 : 18;
  row++;

  const at = (key: string, line: number) => `${letter(colOf(key))}${line}`;
  const lineRows: number[] = [];
  const pendingSecondary: { row: number; col: number; source: string; result: number | null }[] = [];

  const kindFormat = (column: Column) =>
    column.kind === "money"
      ? moneyFormat(model.currency)
      : column.kind === "secondaryMoney"
        ? moneyFormat(model.secondary?.currency ?? model.currency)
        : column.kind === "cbm"
          ? CBM_FORMAT
          : column.kind === "percent"
            ? "0%"
            : column.kind === "number"
              ? "#,##0.###"
              : column.kind === "quantity"
                ? "0"
                : undefined;

  for (const line of model.lines) {
    lineRows.push(row);
    columns.forEach((column, index) => {
      const col = index + 1;
      const cell = line.cells[column.key];
      const format = kindFormat(column);
      const align = column.kind === "text" || column.kind === "lines" ? "center" : "right";
      switch (column.key) {
        case "total": {
          const discount = colOf("discount") ? `*(1-${at("discount", row)})` : "";
          put(row, col, { formula: `ROUND(${at("amount", row)}*${at("unitPrice", row)}${discount},2)`, result: num(cell?.value) ?? 0 }, { format, align });
          return;
        }
        case "discount":
          put(row, col, cell?.value ? Number(cell.value) / 100 : 0, { format, align });
          return;
        case "secondaryUnitPrice":
        case "secondaryTotal":
          pendingSecondary.push({ row, col, source: at(column.key === "secondaryUnitPrice" ? "unitPrice" : "total", row), result: num(cell?.value) });
          put(row, col, num(cell?.value), { format, align });
          return;
        case "cbm":
          put(row, col, { formula: `${at("amount", row)}*${at("unitCbm", row)}`, result: num(cell?.value) ?? 0 }, { format, align });
          return;
        case "photo":
          put(row, col, "", { align: "center" });
          placeImage(line.photo, row, col);
          return;
        default:
          if (column.kind === "lines") put(row, col, (cell?.lines ?? []).join("\n"), { align });
          else if (format) put(row, col, num(cell?.value), { format, align });
          else put(row, col, cell?.text ?? "", { align, bold: column.key === "product" });
      }
    });
    const fabricLines = line.cells.fabric?.lines?.length ?? 1;
    sheet.getRow(row).height = line.photo ? PHOTO_ROW_HEIGHT : Math.max(18, fabricLines * 12 + 6);
    row++;
    if (line.notes.length > 0) {
      put(row, 1, line.notes.join("\n\n"), { size: 8 });
      merge(row, 1, count);
      sheet.getRow(row).height = textHeight(line.notes, count * 11, 15);
      row++;
    }
  }
  const range = (key: string) => {
    const col = letter(colOf(key));
    return lineRows.length === 0 ? "0" : lineRows.map((line) => `${col}${line}`).join(",");
  };

  // --- totals ------------------------------------------------------------
  const totalCol = colOf("total");
  const rowOf: Partial<Record<TotalRow["key"], number>> = {};
  for (const total of model.totals) rowOf[total.key] = row + model.totals.indexOf(total);
  const totalRef = `${letter(totalCol)}${rowOf.total}`;
  const advanceRef = rowOf.advance ? `${letter(totalCol)}${rowOf.advance}` : null;
  const rateRow = row + model.totals.length + 1; // after the totals and the piece summary
  const rateCell = model.secondary ? `${letter(Math.max(totalCol - 1, 1))}${rateRow}` : null;
  const toSecondary = (source: string) => `ROUND(${source}/${rateCell},2)`;
  const percentCol = Math.max(totalCol - 1, 1);

  for (const total of model.totals) {
    const labelTo = total.key === "advance" && total.percentValue !== null ? percentCol - 1 : totalCol - 1;
    put(row, 1, labelValue(total.label), { bold: true, fill: true, align: model.dir === "rtl" ? "left" : "right" });
    merge(row, 1, Math.max(1, labelTo));
    const format = moneyFormat(model.currency);
    const result = num(total.amount.value) ?? 0;
    if (total.key === "total") {
      put(row, totalCol, { formula: `SUM(${range("total")})`, result }, { bold: true, format, align: "right" });
    } else if (total.key === "advance") {
      if (total.percentValue !== null && percentCol < totalCol) {
        put(row, percentCol, Number(total.percentValue) / 100, { bold: true, fill: true, format: "0%", align: "center" });
        put(row, totalCol, { formula: `ROUND(${totalRef}*${letter(percentCol)}${row},2)`, result }, { bold: true, format, align: "right" });
      } else {
        put(row, totalCol, result, { bold: true, format, align: "right" });
      }
    } else {
      put(row, totalCol, { formula: `${totalRef}-${advanceRef ?? 0}`, result }, { bold: true, format, align: "right" });
    }
    for (let col = totalCol + 1; col <= count; col++) {
      const column = columns[col - 1];
      if (column?.key === "secondaryTotal" && total.secondary && rateCell) {
        const secondaryFormat = moneyFormat(model.secondary!.currency);
        const formula =
          total.key === "balance"
            ? `${letter(col)}${rowOf.total}-${letter(col)}${rowOf.advance}`
            : toSecondary(`${letter(totalCol)}${row}`);
        put(row, col, { formula, result: num(total.secondary.value) ?? 0 }, { bold: true, format: secondaryFormat, align: "right" });
      } else if (column?.key === "cbm" && total.cbm) {
        put(row, col, { formula: `SUM(${range("cbm")})`, result: num(total.cbm.value) ?? 0 }, { bold: true, format: CBM_FORMAT, align: "right" });
      } else {
        put(row, col, null);
      }
    }
    sheet.getRow(row).height = model.language === "en-ar" ? 28 : 18;
    row++;
  }

  put(row, 1, labelValue(model.labels.pieces), { bold: true, fill: true, align: model.dir === "rtl" ? "left" : "right" });
  merge(row, 1, Math.max(1, totalCol - 1));
  put(row, totalCol, labelValue(model.pieceSummary));
  merge(row, totalCol, count);
  sheet.getRow(row).height = model.pieceSummary.alt ? 28 : 16;
  row++;

  if (model.secondary && rateCell) {
    // The rate the secondary-currency figures come from; change it and they follow.
    put(row, 1, model.secondary.note, { align: model.dir === "rtl" ? "left" : "right" });
    merge(row, 1, Math.max(1, totalCol - 2));
    put(row, Math.max(totalCol - 1, 1), Number(model.secondary.rate), { bold: true, format: "0.0000", align: "right" });
    put(row, totalCol, `${model.currency} / ${model.secondary.currency}`);
    row++;
    for (const pending of pendingSecondary) {
      const cell = sheet.getCell(pending.row, pending.col);
      cell.value = { formula: toSecondary(pending.source), result: pending.result ?? 0 };
    }
  }
  row++;

  // --- notes -------------------------------------------------------------
  const noteBlock = (label: Label, texts: readonly string[]) => {
    if (texts.length === 0) return;
    put(row, 1, labelValue(label), { bold: true, fill: true });
    merge(row, 1, 2);
    put(row, 3, texts.join("\n\n"));
    merge(row, 3, count);
    sheet.getRow(row).height = textHeight(texts, (count - 2) * 11);
    row++;
  };
  noteBlock(model.labels.notes, model.notes.customer);
  noteBlock(model.labels.sampleApproval, model.notes.sampleApproval);
  for (const note of model.notes.references) {
    put(row, 1, note.title.join("\n"), { bold: true, fill: true });
    merge(row, 1, 2);
    const photoCol = note.photo && images.has(note.photo) ? count : null;
    put(row, 3, note.body.join("\n\n"));
    merge(row, 3, photoCol ? count - 1 : count);
    if (photoCol) {
      put(row, photoCol, "");
      placeImage(note.photo, row, photoCol);
    }
    sheet.getRow(row).height = photoCol ? PHOTO_ROW_HEIGHT : textHeight([...note.title, ...note.body], (count - 2) * 11);
    row++;
  }
  if (model.notes.customer.length + model.notes.sampleApproval.length + model.notes.references.length > 0) row++;

  // --- bank --------------------------------------------------------------
  if (model.bank.length > 0) {
    put(row, 1, labelValue(model.labels.bank), { bold: true, fill: true, align: "center" });
    merge(row, 1, count);
    sheet.getRow(row).height = model.labels.bank.alt ? 28 : 16;
    row++;
    for (const group of model.bank) {
      const rows: [Label, string][] = [
        [model.labels.bankName, group.bankName],
        ...(group.swift ? [[model.labels.swift, group.swift] as [Label, string]] : []),
        ...(group.branch ? [[model.labels.branch, group.branch] as [Label, string]] : []),
        [model.labels.beneficiary, group.beneficiary],
        ...group.accounts.map((account): [Label, string] => [account.label, account.iban]),
      ];
      for (const [name, value] of rows) {
        put(row, 1, labelValue(name), { bold: true, fill: true });
        merge(row, 1, 2);
        put(row, 3, value, { bold: true });
        merge(row, 3, count);
        sheet.getRow(row).height = name.alt ? 26 : 15;
        row++;
      }
    }
  }

  // --- print setup: A4 portrait, fit to width, the table header on every page ---
  sheet.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.55, header: 0.2, footer: 0.25 },
    printTitlesRow: `${headerRow}:${headerRow}`,
  };
  const contact = [model.company.email, model.company.phone, model.company.website].filter(Boolean).join("  ·  ").replace(/&/g, "&&");
  sheet.headerFooter = { oddFooter: `&L&8${contact}&R&8&P / &N` };

  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
