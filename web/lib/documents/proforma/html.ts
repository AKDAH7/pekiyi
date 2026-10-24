/**
 * The proforma as an HTML page for headless Chromium to print (pdf.ts):
 * A4 portrait, the bordered layout of our existing proformas. Lays out a
 * view model (view-model.ts) and decides nothing about content.
 *
 * Everything is inline — fonts (bundled in lib/documents/fonts) and images
 * as data URIs — so rendering never touches the network. RTL documents are
 * mirrored by `dir="rtl"` and logical CSS properties only.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Label } from "../format";

import type { Column, ProformaViewModel } from "./view-model";

/** An embedded image: what the renderer needs to place it. */
export type DocumentImage = { body: Buffer; width: number; height: number; contentType: string };
export type DocumentImages = ReadonlyMap<string, DocumentImage>;

const FONT_DIR = path.resolve(process.cwd(), "lib/documents/fonts");

const FONT_FACES = [
  { family: "Doc Latin", file: "noto-sans-latin-400-normal.woff2", weight: 400 },
  { family: "Doc Latin", file: "noto-sans-latin-700-normal.woff2", weight: 700 },
  { family: "Doc Latin Ext", file: "noto-sans-latin-ext-400-normal.woff2", weight: 400 },
  { family: "Doc Latin Ext", file: "noto-sans-latin-ext-700-normal.woff2", weight: 700 },
  { family: "Doc Arabic", file: "ibm-plex-sans-arabic-arabic-400-normal.woff2", weight: 400 },
  { family: "Doc Arabic", file: "ibm-plex-sans-arabic-arabic-700-normal.woff2", weight: 700 },
] as const;

let fontCss: string | null = null;

/** @font-face rules with the bundled Noto fonts inlined (read once per process). */
function fontFaces(): string {
  fontCss ??= FONT_FACES.map(
    ({ family, file, weight }) =>
      `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${readFileSync(
        path.join(FONT_DIR, file),
      ).toString("base64")}) format("woff2");}`,
  ).join("\n");
  return fontCss;
}

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A fixed label; on bilingual documents the second language below it. */
function label(value: Label): string {
  return value.alt
    ? `<span class="lbl">${esc(value.main)}</span><span class="alt"><bdi>${esc(value.alt)}</bdi></span>`
    : esc(value.main);
}

/** Free text (notes): paragraphs keep their line breaks and their own direction. */
const paragraphs = (texts: readonly string[]) => texts.map((text) => `<p dir="auto">${esc(text)}</p>`).join("");

/** Numbers and codes keep LTR order inside an RTL page. */
const ltr = (text: string) => (text ? `<span dir="ltr">${esc(text)}</span>` : "");

function imageTag(key: string | null, images: DocumentImages, className: string): string {
  const image = key ? images.get(key) : undefined;
  if (!image) return "";
  return `<img class="${className}" src="data:${image.contentType};base64,${image.body.toString("base64")}" width="${image.width}" height="${image.height}" alt="">`;
}

const NUMERIC = new Set<Column["kind"]>(["money", "secondaryMoney", "quantity", "percent", "cbm", "number"]);

function cellHtml(column: Column, line: ProformaViewModel["lines"][number], images: DocumentImages): string {
  if (column.kind === "photo") return `<td class="photo">${imageTag(line.photo, images, "line-photo")}</td>`;
  const cell = line.cells[column.key];
  if (!cell) return "<td></td>";
  if (column.kind === "lines") return `<td class="text fabric">${(cell.lines ?? []).map((part) => `<div>${esc(part)}</div>`).join("")}</td>`;
  if (NUMERIC.has(column.kind)) return `<td class="num">${ltr(cell.text)}</td>`;
  return `<td class="${column.key === "product" ? "text product" : "text"}" dir="auto">${esc(cell.text)}</td>`;
}

function infoRows(rows: ProformaViewModel["buyer"]): string {
  return rows
    .map((row) => `<tr><th>${label(row.label)}</th><td dir="auto">${row.lines.map((part) => `<div>${esc(part)}</div>`).join("")}</td></tr>`)
    .join("");
}

function linesTable(model: ProformaViewModel, images: DocumentImages): string {
  const { columns } = model;
  const totalIndex = columns.findIndex((column) => column.key === "total");
  const head = `<thead><tr>${columns.map((column) => `<th class="${NUMERIC.has(column.kind) ? "num" : ""}">${label(column.label)}</th>`).join("")}</tr></thead>`;

  const body = model.lines
    .map((line) => {
      const row = `<tr>${columns.map((column) => cellHtml(column, line, images)).join("")}</tr>`;
      const note = line.notes.length > 0 ? `<tr class="line-note"><td colspan="${columns.length}">${paragraphs(line.notes)}</td></tr>` : "";
      return `<tbody class="line">${row}${note}</tbody>`;
    })
    .join("");

  const totals = model.totals
    .map((row) => {
      const caption = `${label(row.label)}${row.percent ? ` <span dir="ltr">(${esc(row.percent)})</span>` : ""}`;
      const after = columns.slice(totalIndex + 1).map((column) => {
        if (column.key === "secondaryTotal" && row.secondary) return `<td class="num">${ltr(row.secondary.text)}</td>`;
        if (column.key === "cbm" && row.cbm) return `<td class="num">${ltr(row.cbm.text)}</td>`;
        return "<td></td>";
      });
      return `<tr class="total-${row.key}"><th colspan="${totalIndex}">${caption}</th><td class="num">${ltr(row.amount.text)}</td>${after.join("")}</tr>`;
    })
    .join("");
  const summary = model.pieceSummary.main
    ? `<tr class="summary"><th>${label(model.labels.pieces)}</th><td colspan="${columns.length - 1}">${label(model.pieceSummary)}</td></tr>`
    : "";
  const rate = model.secondary
    ? `<tr class="rate"><td colspan="${columns.length}">${ltr(model.secondary.note)}</td></tr>`
    : "";

  return `<table class="grid lines">${head}${body}<tbody class="totals">${totals}${summary}${rate}</tbody></table>`;
}

function notesSection(model: ProformaViewModel, images: DocumentImages): string {
  const { customer, sampleApproval, references } = model.notes;
  const blocks: string[] = [];
  if (customer.length > 0) blocks.push(`<tr><th>${label(model.labels.notes)}</th><td colspan="2" class="free">${paragraphs(customer)}</td></tr>`);
  if (sampleApproval.length > 0) {
    blocks.push(`<tr><th>${label(model.labels.sampleApproval)}</th><td colspan="2" class="free">${paragraphs(sampleApproval)}</td></tr>`);
  }
  for (const note of references) {
    const photo = imageTag(note.photo, images, "reference-photo");
    const title = note.title.map((part) => `<div><bdi>${esc(part)}</bdi></div>`).join("");
    blocks.push(
      `<tr class="reference"><th>${title}</th><td class="free"${photo ? "" : ' colspan="2"'}>${paragraphs(note.body)}</td>${photo ? `<td class="photo">${photo}</td>` : ""}</tr>`,
    );
  }
  return blocks.length > 0 ? `<table class="grid notes">${blocks.join("")}</table>` : "";
}

function bankSection(model: ProformaViewModel): string {
  if (model.bank.length === 0) return "";
  const groups = model.bank
    .map((group) => {
      const rows: [Label, string][] = [
        [model.labels.bankName, group.bankName],
        ...(group.swift ? [[model.labels.swift, group.swift] as [Label, string]] : []),
        ...(group.branch ? [[model.labels.branch, group.branch] as [Label, string]] : []),
        [model.labels.beneficiary, group.beneficiary],
        ...group.accounts.map((account): [Label, string] => [account.label, account.iban]),
      ];
      return rows.map(([name, value]) => `<tr><th>${label(name)}</th><td>${ltr(value)}</td></tr>`).join("");
    })
    .join("");
  return `<table class="grid bank"><thead><tr><th colspan="2" class="section">${label(model.labels.bank)}</th></tr></thead><tbody>${groups}</tbody></table>`;
}

const STYLES = `
@page { size: A4 portrait; margin: 10mm 10mm 14mm 10mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Doc Latin", "Doc Latin Ext", "Doc Arabic", sans-serif; font-size: 7.5pt; line-height: 1.3; color: #111; }
p { margin: 0; white-space: pre-line; }
p + p { margin-block-start: 1.5mm; }
.alt { display: block; font-weight: 400; color: #444; font-size: 0.92em; }
table.grid { width: 100%; border-collapse: collapse; margin-block-end: 3mm; }
.grid th, .grid td { border: 0.6pt solid #333; padding: 1.2mm 1.5mm; vertical-align: middle; }
.grid th { background: #e6e6e6; font-weight: 700; text-align: start; }
.head { display: grid; grid-template-columns: 1fr 1.4fr 1fr; align-items: center; border: 0.8pt solid #333; margin-block-end: 2mm; min-height: 22mm; }
.head > div { padding: 2mm 3mm; }
.head .logo { justify-self: start; }
.head .logo img { max-height: 18mm; max-width: 50mm; width: auto; height: auto; }
.head .brand { font-size: 16pt; font-weight: 700; letter-spacing: 0.08em; }
.head .title { text-align: center; font-size: 13pt; font-weight: 700; letter-spacing: 0.04em; border-inline: 0.8pt solid #333; align-self: stretch; display: flex; flex-direction: column; justify-content: center; }
.head .title .alt { font-size: 10pt; }
.head .company { justify-self: end; text-align: end; font-weight: 700; font-size: 8pt; }
.info { display: grid; grid-template-columns: 3fr 2fr; gap: 2mm; margin-block-end: 1mm; }
.info table { margin: 0; }
.info th { width: 30%; }
table.lines thead { display: table-header-group; }
table.lines th { text-align: center; font-size: 7pt; }
table.lines td { text-align: center; }
table.lines td.text { text-align: center; }
table.lines td.product { font-weight: 700; min-width: 16mm; }
table.lines td.fabric { min-width: 28mm; }
table.lines td.num, table.lines th.num { white-space: nowrap; width: 1%; }
table.lines td.num { text-align: end; }
table.lines tbody.line, table.lines tbody.totals { break-inside: avoid; page-break-inside: avoid; }
table.lines tr.line-note td { text-align: start; background: #fafafa; font-size: 7pt; }
table.lines td.photo { padding: 0.8mm; width: 34mm; }
img.line-photo { display: block; margin: 0 auto; max-width: 32mm; max-height: 22mm; width: auto; height: auto; }
table.lines tbody.totals th { text-align: end; background: #e6e6e6; }
table.lines tbody.totals td.num { font-weight: 700; background: #f2f2f2; }
table.lines tr.total-total td.num { font-size: 9pt; }
table.lines tr.summary td, table.lines tr.summary th { text-align: start; }
table.lines tr.rate td { text-align: end; border: none; color: #444; font-size: 6.5pt; }
table.notes, table.bank { break-inside: avoid; page-break-inside: avoid; }
table.notes th { width: 22%; }
table.notes td.free { text-align: start; }
table.notes td.photo { width: 40mm; text-align: center; }
img.reference-photo { max-width: 38mm; max-height: 30mm; width: auto; height: auto; }
table.bank th { width: 30%; }
table.bank th.section { text-align: center; }
table.bank td { font-weight: 700; }
.watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 10; }
.watermark span { transform: rotate(-35deg); font-size: 130pt; font-weight: 700; color: rgba(200, 30, 30, 0.13); letter-spacing: 0.1em; white-space: nowrap; }
`;

/** The page Chromium prints. */
export function proformaHtml(model: ProformaViewModel, images: DocumentImages): string {
  const lang = model.language === "en-ar" ? "en" : model.language;
  const logo = imageTag(model.company.logo, images, "logo-image");
  return `<!doctype html>
<html lang="${lang}" dir="${model.dir}">
<head>
<meta charset="utf-8">
<title>${esc(`${model.labels.title.main} ${model.number}`)}</title>
<style>${fontFaces()}${STYLES}</style>
</head>
<body>
${model.draft ? `<div class="watermark" aria-hidden="true"><span>${esc(model.labels.draft.main)}</span></div>` : ""}
<header class="head">
  <div class="logo">${logo || `<span class="brand">${esc(model.company.brandName)}</span>`}</div>
  <div class="title">${label(model.labels.title)}</div>
  <div class="company" dir="auto">${esc(model.company.legalName)}</div>
</header>
<section class="info">
  <table class="grid buyer">${infoRows(model.buyer)}</table>
  <table class="grid terms">${infoRows(model.terms)}</table>
</section>
${linesTable(model, images)}
${notesSection(model, images)}
${bankSection(model)}
</body>
</html>`;
}

/** Page footer (Chromium's footer template): brand contact and "1 / 2". Latin text only, inline styles. */
export function proformaFooter(model: ProformaViewModel): string {
  const contact = [model.company.email, model.company.phone, model.company.website].filter(Boolean).map((part) => esc(part!));
  return `<div style="width:100%;padding:0 10mm;font-family:Arial,Helvetica,sans-serif;font-size:7pt;color:#555;display:flex;justify-content:space-between;direction:ltr;">
<span>${contact.join(" &#183; ")}</span>
<span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;
}
