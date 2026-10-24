/**
 * The proforma as a document shows it, in one language: every label, column,
 * cell, total and note, already chosen and formatted. Built from a snapshot
 * (an issued revision, or the draft built the same way from the live order);
 * the PDF template (html.ts) and the Excel writer (excel.ts) only lay it out.
 *
 * Numeric cells keep their canonical decimal string next to the formatted
 * text, so the Excel file can hold real numbers and formulas.
 *
 * Production notes never get here: the snapshot doesn't carry them.
 * Pure.
 */
import type { DocLanguage, LocalizedText } from "@/db/schema/common";
import { countryName } from "@/lib/domain/countries";
import { dec } from "@/lib/domain/decimal";
import { formatPhone } from "@/lib/domain/phone";
import { computePieceCounts, countByPieceType } from "@/lib/domain/piece-counts";

import {
  documentLabels,
  formatCbm,
  formatDocDate,
  formatMoney,
  formatNumber,
  pickText,
  type Label,
} from "../format";
import { isRtl, languageParts, type DocumentLanguage } from "../languages";

import type { ProformaSnapshot, SnapshotNames } from "./snapshot";

/** A table cell: formatted text (several lines for the fabrics), and the raw decimal for numbers. */
export type Cell = { text: string; lines?: string[]; value?: string | null };

export type ColumnKind = "text" | "lines" | "money" | "secondaryMoney" | "quantity" | "percent" | "cbm" | "number" | "photo";

/**
 * Column keys: product, composition, fabric, piece:<TYPE>, custom:<key>,
 * amount, unit, unitPrice, discount, total, secondaryUnitPrice,
 * secondaryTotal, unitCbm, cbm, photo — in this order, optional ones only
 * when the document options (or the data) call for them.
 */
export type Column = { key: string; kind: ColumnKind; label: Label };

export type ViewLine = {
  cells: Record<string, Cell>;
  /** The line's customer note, printed under it across the row (both languages on bilingual documents). */
  notes: string[];
  /** Storage key of the line photo (line photo, else the model's), when photos are shown. */
  photo: string | null;
};

export type TotalRow = {
  key: "total" | "advance" | "balance";
  label: Label;
  /** "30%" for a percentage advance. */
  percent: string | null;
  /** The percentage itself ("30"), for the Excel formula. */
  percentValue: string | null;
  amount: Cell;
  secondary: Cell | null;
  cbm: Cell | null;
};

export type InfoRow = { label: Label; lines: string[] };

export type ProformaViewModel = {
  language: DocumentLanguage;
  /** Language numbers and dates are formatted in. */
  locale: DocLanguage;
  dir: "ltr" | "rtl";
  draft: boolean;
  labels: {
    title: Label;
    draft: Label;
    notes: Label;
    sampleApproval: Label;
    references: Label;
    pieces: Label;
    bank: Label;
    bankName: Label;
    swift: Label;
    branch: Label;
    beneficiary: Label;
  };
  number: string;
  customerName: string;
  company: {
    legalName: string;
    brandName: string;
    logo: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
  };
  buyer: InfoRow[];
  terms: InfoRow[];
  currency: string;
  secondary: { currency: string; rate: string; note: string } | null;
  columns: Column[];
  lines: ViewLine[];
  totals: TotalRow[];
  pieceSummary: Label;
  notes: {
    customer: string[];
    sampleApproval: string[];
    references: { title: string[]; body: string[]; photo: string | null }[];
  };
  bank: {
    bankName: string;
    swift: string | null;
    branch: string | null;
    beneficiary: string;
    accounts: { currency: string; iban: string; label: Label }[];
  }[];
};

export type ViewModelOptions = {
  language: DocumentLanguage;
  /**
   * The invoice date printed, YYYY-MM-DD: the day the revision was issued
   * (document_issues.issued_at, Turkey time), or today for a draft preview.
   * Not the order date: each revision is its own invoice.
   */
  invoiceDate: string;
  /** Draft preview: a big diagonal "DRAFT" on every page. */
  draft?: boolean;
  /**
   * Names for what an older snapshot didn't record (snapshots before
   * version 2 have none): the current catalog's. The snapshot's own names win.
   */
  fallbackNames?: SnapshotNames;
};

const has = (value: string | null | undefined): value is string => value !== null && value !== undefined && value !== "";

/** Trailing zeros off: "1.120000" → "1.12", "30.00" → "30". */
const plain = (value: string) => dec(value).toString();

export function buildProformaViewModel(snapshot: ProformaSnapshot, options: ViewModelOptions): ProformaViewModel {
  const { language } = options;
  const { main, alt } = languageParts(language);
  const L = documentLabels(language);
  const { order, totals, customer } = snapshot;
  const docOptions = order.documentOptions;
  const names: SnapshotNames = {
    models: { ...options.fallbackNames?.models, ...snapshot.names?.models },
    pieceTypes: { ...options.fallbackNames?.pieceTypes, ...snapshot.names?.pieceTypes },
    fabrics: { ...options.fallbackNames?.fabrics, ...snapshot.names?.fabrics },
  } satisfies SnapshotNames;

  /** A translatable value as printed: one paragraph, or both languages on a bilingual document. */
  const texts = (value: LocalizedText | null | undefined): string[] => {
    const first = pickText(value, main);
    if (!first) return [];
    const second = alt ? (value?.[alt] ?? "") : "";
    return second && second !== first ? [first, second] : [first];
  };
  /** A label made from data (custom column names): both languages when bilingual. */
  const dataLabel = (value: LocalizedText | null | undefined, fallback: string): Label => {
    const first = pickText(value, main) || fallback;
    const second = alt ? value?.[alt] : undefined;
    return second && second !== first ? { main: first, alt: second } : { main: first };
  };
  const pieceName = (code: string, lang: DocLanguage, short = false) => {
    const entry = names.pieceTypes[code];
    return (short ? pickText(entry?.shortName, lang) : "") || pickText(entry?.name, lang) || code;
  };
  const money = (value: string | null | undefined, currency = order.currency): Cell =>
    has(value) ? { text: formatMoney(value, currency, main), value } : { text: "", value: null };

  const secondary =
    docOptions.showSecondaryCurrency && totals.secondary && has(order.secondaryCurrency) ? totals.secondary : null;

  // --- columns ---------------------------------------------------------
  const pieceTypes: string[] = [];
  if (docOptions.showPiecePrices) {
    for (const line of order.lines) {
      for (const piece of line.pieces) {
        if (!has(piece.unitPrice) || pieceTypes.includes(piece.pieceType)) continue;
        // A free accessory (extra cushions at 0) gets no price column of its own.
        if (names.pieceTypes[piece.pieceType]?.isAccessory && dec(piece.unitPrice).isZero()) continue;
        pieceTypes.push(piece.pieceType);
      }
    }
    pieceTypes.sort((a, b) => (names.pieceTypes[a]?.sort ?? 0) - (names.pieceTypes[b]?.sort ?? 0));
  }
  const hasDiscount = order.lines.some((line) => has(line.discountPercent) && !dec(line.discountPercent).isZero());
  const customColumns = order.customColumns.filter((column) => column.showOn.includes("proforma"));

  const columns: Column[] = [
    { key: "product", kind: "text", label: L("columns.product") },
    { key: "composition", kind: "text", label: L("columns.composition") },
    { key: "fabric", kind: "lines", label: L("columns.fabric") },
    ...pieceTypes.map(
      (code): Column => ({
        key: `piece:${code}`,
        kind: "money",
        label: L("columns.piecePrice", (lang) => ({ piece: pieceName(code, lang) })),
      }),
    ),
    ...customColumns.map(
      (column): Column => ({
        key: `custom:${column.key}`,
        kind: column.type === "number" ? "number" : "text",
        label: dataLabel(column.label, column.key),
      }),
    ),
    { key: "amount", kind: "quantity", label: L("columns.amount") },
    { key: "unit", kind: "text", label: L("columns.unit") },
    { key: "unitPrice", kind: "money", label: L("columns.unitPrice") },
    ...(hasDiscount ? [{ key: "discount", kind: "percent", label: L("columns.discount") } satisfies Column] : []),
    { key: "total", kind: "money", label: L("columns.total") },
    ...(secondary
      ? ([
          { key: "secondaryUnitPrice", kind: "secondaryMoney", label: L("columns.secondaryUnitPrice", { currency: secondary.currency }) },
          { key: "secondaryTotal", kind: "secondaryMoney", label: L("columns.secondaryTotal", { currency: secondary.currency }) },
        ] satisfies Column[])
      : []),
    ...(docOptions.showCbm
      ? ([
          { key: "unitCbm", kind: "cbm", label: L("columns.unitCbm") },
          { key: "cbm", kind: "cbm", label: L("columns.cbm") },
        ] satisfies Column[])
      : []),
    ...(docOptions.showPhotos ? [{ key: "photo", kind: "photo", label: L("columns.photo") } satisfies Column] : []),
  ];

  // --- lines -----------------------------------------------------------
  const unitLabel = (unit: "SET" | "PCS") => {
    const label = L(`units.${unit}`);
    return label.alt ? `${label.main} / ${label.alt}` : label.main;
  };
  const fabricLines = (labels: readonly string[]) =>
    labels.map((label) => {
      const colour = pickText(names.fabrics[label], main);
      return colour && !label.toLocaleUpperCase("tr").endsWith(colour.toLocaleUpperCase("tr")) ? `${label} ${colour}` : label;
    });
  const cbmCell = (value: string | null | undefined): Cell =>
    has(value) ? { text: formatCbm(value, main), value } : { text: "", value: null };

  const lines = order.lines.map((line, index): ViewLine => {
    const lineTotals = totals.lines[index];
    const fabrics = fabricLines(line.fabrics);
    const cells: Record<string, Cell> = {
      product: { text: pickText(line.displayName, main) || pickText(names.models[line.model], main) || line.model },
      composition: { text: line.composition ?? "" },
      fabric: { text: fabrics.join("\n"), lines: fabrics },
      amount: { text: String(line.quantity), value: String(line.quantity) },
      unit: { text: unitLabel(line.unit) },
      unitPrice: money(lineTotals?.unitPrice),
      total: money(lineTotals?.lineTotal),
    };
    for (const code of pieceTypes) {
      cells[`piece:${code}`] = money(line.pieces.find((piece) => piece.pieceType === code && has(piece.unitPrice))?.unitPrice);
    }
    for (const column of customColumns) {
      const raw = line.customValues[column.key];
      const value = raw === null || raw === undefined ? "" : String(raw);
      cells[`custom:${column.key}`] =
        column.type === "number" && value !== "" && !Number.isNaN(Number(value))
          ? { text: formatNumber(value, main), value }
          : { text: value };
    }
    if (hasDiscount) {
      const discount = has(line.discountPercent) ? line.discountPercent : "0";
      cells.discount = { text: dec(discount).isZero() ? "" : `${plain(discount)}%`, value: discount };
    }
    if (secondary) {
      cells.secondaryUnitPrice = money(lineTotals?.secondaryUnitPrice, secondary.currency);
      cells.secondaryTotal = money(lineTotals?.secondaryLineTotal, secondary.currency);
    }
    if (docOptions.showCbm) {
      cells.unitCbm = cbmCell(lineTotals?.unitCbm);
      cells.cbm = cbmCell(lineTotals?.lineCbm);
    }
    return {
      cells,
      notes: texts(line.customerNote),
      photo: docOptions.showPhotos ? (line.photoPath ?? line.modelPhotoPath ?? null) : null,
    };
  });

  // --- totals ----------------------------------------------------------
  const percent = order.advanceType === "percent" && has(order.advanceValue) ? plain(order.advanceValue) : null;
  const totalRows: TotalRow[] = [
    {
      key: "total",
      label: L("totalPrice", { incoterm: order.incoterm }),
      percent: null,
      percentValue: null,
      amount: money(totals.total),
      secondary: secondary ? money(secondary.total, secondary.currency) : null,
      cbm: docOptions.showCbm ? cbmCell(totals.totalCbm) : null,
    },
  ];
  if (order.advanceType) {
    totalRows.push(
      {
        key: "advance",
        label: L("advance"),
        percent: percent === null ? null : `${percent}%`,
        percentValue: percent,
        amount: money(totals.advance),
        secondary: secondary ? money(secondary.advance, secondary.currency) : null,
        cbm: null,
      },
      {
        key: "balance",
        label: L("balance"),
        percent: null,
        percentValue: null,
        amount: money(totals.balance),
        secondary: secondary ? money(secondary.balance, secondary.currency) : null,
        cbm: null,
      },
    );
  }

  // --- piece summary: "30 sets · 60 × 3-seater · 60 × armchair" (accessories left out) ---
  const sets = order.lines.filter((line) => line.unit === "SET").reduce((acc, line) => acc + line.quantity, 0);
  const byType = countByPieceType(
    computePieceCounts({
      items: order.lines.map((line) => ({
        model: line.model,
        quantity: line.quantity,
        unit: line.unit,
        fabrics: line.fabrics,
        pieces: line.pieces.map((piece) => ({ ...piece, modelOverride: piece.modelOverride ?? null, fabric: piece.fabric ?? null })),
      })),
    }),
  );
  const typeOrder = Object.keys(byType)
    .filter((code) => !names.pieceTypes[code]?.isAccessory)
    .sort((a, b) => (names.pieceTypes[a]?.sort ?? 0) - (names.pieceTypes[b]?.sort ?? 0));
  const summary = (lang: DocLanguage, labels: typeof L) =>
    [
      ...(sets > 0 ? [labels("sets", { count: sets })] : []),
      ...typeOrder.map((code) => labels("pieceCount", { count: byType[code], piece: pieceName(code, lang, true) })),
    ];
  const mainSummary = summary(main, documentLabels(main)).map((label) => label.main).join(" · ");
  const altSummary = alt ? summary(alt, documentLabels(alt)).map((label) => label.main).join(" · ") : "";
  const pieceSummary: Label = altSummary && altSummary !== mainSummary ? { main: mainSummary, alt: altSummary } : { main: mainSummary };

  // --- buyer and terms -------------------------------------------------
  const country = countryName(customer.country, main);
  const addressLines = (customer.address ?? "").split("\n").map((part) => part.trim()).filter(Boolean);
  const place = [customer.city, country].filter(has).join(" / ");
  const addressText = addressLines.join(" ").toLocaleUpperCase(main);
  if (!addressText.includes(country.toLocaleUpperCase(main))) addressLines.push(place);
  const buyer: InfoRow[] = [
    { label: L("buyer"), lines: [[customer.companyName, customer.contactPerson].filter(has).join(" / ")] },
    { label: L("address"), lines: addressLines },
    ...(has(customer.phone) ? [{ label: L("phone"), lines: [formatPhone(customer.phone)] }] : []),
    ...(has(customer.email) ? [{ label: L("email"), lines: [customer.email] }] : []),
    ...Object.entries(customer.taxIds ?? {})
      .filter(([, value]) => has(value))
      .map(([key, value]) => ({ label: { main: key }, lines: [value] })),
  ];
  const terms: InfoRow[] = [
    { label: L("invoiceDate"), lines: [formatDocDate(options.invoiceDate, main)] },
    { label: L("invoiceNumber"), lines: [snapshot.number] },
    { label: L("deliveryTime"), lines: texts(order.deliveryTime) },
    { label: L("paymentTerms"), lines: texts(order.paymentTerms).flatMap((part) => part.split("\n")) },
    { label: L("incoterm"), lines: [order.incoterm] },
  ];

  // --- bank: every active account (default) or only the order currency's ---
  const allAccounts = snapshot.bankAccounts ?? (snapshot.bankAccount ? [snapshot.bankAccount] : []);
  const accounts = docOptions.bankOrderCurrencyOnly
    ? allAccounts.filter((account) => account.currency === order.currency)
    : allAccounts;
  const bank: ProformaViewModel["bank"] = [];
  for (const account of accounts) {
    const swift = account.swift ?? null;
    const branch = account.branch ?? null;
    let group = bank.find(
      (entry) =>
        entry.bankName === account.bankName && entry.swift === swift && entry.branch === branch && entry.beneficiary === account.beneficiary,
    );
    if (!group) {
      group = { bankName: account.bankName, swift, branch, beneficiary: account.beneficiary, accounts: [] };
      bank.push(group);
    }
    group.accounts.push({ currency: account.currency, iban: account.iban, label: L("iban", { currency: account.currency }) });
  }

  const company = snapshot.company;
  return {
    language,
    locale: main,
    dir: isRtl(language) ? "rtl" : "ltr",
    draft: options.draft ?? false,
    labels: {
      title: L("title"),
      draft: L("draft"),
      notes: L("notes"),
      sampleApproval: L("sampleApproval"),
      references: L("references"),
      pieces: L("pieces"),
      bank: L("bank"),
      bankName: L("bankName"),
      swift: L("swift"),
      branch: L("branch"),
      beneficiary: L("beneficiary"),
    },
    number: snapshot.number,
    customerName: customer.companyName,
    company: {
      legalName: company?.legalName ?? "",
      brandName: company?.brandName ?? "",
      logo: company?.logoPath ?? null,
      address: company?.address ?? null,
      email: company?.email ?? null,
      phone: has(company?.phone) ? formatPhone(company.phone) : null,
      website: company?.website ?? null,
    },
    buyer,
    terms: terms.filter((row) => row.lines.length > 0),
    currency: order.currency,
    secondary: secondary
      ? {
          currency: secondary.currency,
          rate: secondary.rate,
          note: L("rate", { secondary: secondary.currency, rate: plain(secondary.rate), currency: order.currency }).main,
        }
      : null,
    columns,
    lines,
    totals: totalRows,
    pieceSummary,
    notes: {
      customer: texts(order.customerNotes),
      sampleApproval: order.sampleApprovalRequired ? texts(order.sampleApprovalText) : [],
      references: order.referenceNotes.map((note) => ({ title: texts(note.title), body: texts(note.body), photo: note.photoPath ?? null })),
    },
    bank,
  };
}

/** Every storage key the document embeds (logo, line photos, reference photos). */
export function imageKeys(model: ProformaViewModel): string[] {
  const keys = [model.company.logo, ...model.lines.map((line) => line.photo), ...model.notes.references.map((note) => note.photo)];
  return [...new Set(keys.filter((key): key is string => key !== null))];
}
