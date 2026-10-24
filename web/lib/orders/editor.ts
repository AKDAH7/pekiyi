/**
 * The order editor's state and its conversions: to the save payload
 * (lib/validation/orders.ts) and to the shape the domain functions take
 * for live totals. Client-safe and pure.
 *
 * Decimals stay canonical strings ("650.00", "" = empty) all the way, so no
 * JS float ever touches a price.
 */
import type { LocalizedText } from "@/db/schema/common";
import type { LabelBranding } from "@/db/schema/customers";
import type { CustomColumn, DocumentOptions, OrderUnit } from "@/db/schema/orders";
import { parseComposition, type CompositionPiece } from "@/lib/domain/composition";
import { dec, sum, toMoney, type Decimal } from "@/lib/domain/decimal";
import { convert } from "@/lib/domain/pricing";
import { effectiveUnitCbm } from "@/lib/domain/totals";
import type { Catalog, OrderForTotals, OrderLine, RatesToTry } from "@/lib/domain/types";

import type { AdvanceMode } from "./constants";
import type { OrderGraph } from "./persist";

export type EditorPiece = {
  id: string;
  pieceTypeId: string;
  qtyPerUnit: number;
  modelOverrideId: string | null;
  fabricOverrideId: string | null;
  unitPrice: string;
};

/** A catalog fabric (`fabricId`) or free text; `text` is what the cell shows. */
export type EditorFabric = { fabricId: string | null; text: string };

export type EditorLine = {
  id: string;
  /** Null for a pasted model that isn't in the catalog; `modelText` keeps what was pasted. */
  modelId: string | null;
  modelText: string;
  composition: string;
  /** Null when empty or not a whole number (shown in red). */
  quantity: number | null;
  unit: OrderUnit;
  unitPrice: string;
  discountPercent: string;
  /** Override; "" = derived from the catalog piece CBMs. */
  unitCbm: string;
  photoPath: string | null;
  customerNote: LocalizedText | null;
  productionNote: LocalizedText | null;
  /** Custom column key → value as typed (numbers as canonical decimals). */
  customValues: Record<string, string>;
  fabrics: EditorFabric[];
  pieces: EditorPiece[];
};

export type EditorHeader = {
  customerId: string;
  orderDate: string;
  currency: string;
  secondaryCurrency: string | null;
  secondaryRate: string;
  incoterm: string;
  deliveryTime: LocalizedText | null;
  paymentTerms: LocalizedText | null;
  advanceMode: AdvanceMode;
  advanceValue: string;
  customerNotes: LocalizedText | null;
  productionNotes: LocalizedText | null;
  sampleApprovalRequired: boolean;
  sampleApprovalText: LocalizedText | null;
  documentOptions: Required<DocumentOptions>;
  labelBranding: LabelBranding | null;
  labelTemplateId: string | null;
  customColumns: CustomColumn[];
};

export type EditorState = { header: EditorHeader; lines: EditorLine[] };

/** What the editor needs to know about the catalog, by id. */
export type EditorCatalog = {
  models: { id: string; code: string }[];
  pieceTypes: { id: string; code: string; seats: number; isAccessory: boolean }[];
  fabrics: { id: string; brand: string; code: string }[];
  catalog: Catalog;
};

/**
 * RFC 4122 v4 id for new lines and pieces. crypto.randomUUID only exists in
 * secure contexts (https / localhost), so fall back to getRandomValues.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Pieces for a composition, keeping what the user set on pieces of the
 * same type (model override, fabric override, price) when it changes.
 */
export function piecesFor(
  pieces: readonly CompositionPiece[],
  pieceTypes: EditorCatalog["pieceTypes"],
  previous: readonly EditorPiece[] = [],
): EditorPiece[] {
  return pieces.flatMap(({ pieceType, qty }) => {
    const type = pieceTypes.find((entry) => entry.code === pieceType);
    if (!type) return [];
    const kept = previous.find((piece) => piece.pieceTypeId === type.id);
    return [
      kept
        ? { ...kept, qtyPerUnit: qty }
        : { id: newId(), pieceTypeId: type.id, qtyPerUnit: qty, modelOverrideId: null, fabricOverrideId: null, unitPrice: "" },
    ];
  });
}

/** Pieces of a composition text; empty when it can't be read. */
export function piecesForText(
  composition: string,
  pieceTypes: EditorCatalog["pieceTypes"],
  previous: readonly EditorPiece[] = [],
): EditorPiece[] {
  const parsed = parseComposition(composition);
  return parsed.ok ? piecesFor(parsed.pieces, pieceTypes, previous) : [...previous];
}

export function emptyLine(partial: Partial<EditorLine> = {}): EditorLine {
  return {
    id: newId(),
    modelId: null,
    modelText: "",
    composition: "",
    quantity: null,
    unit: "SET",
    unitPrice: "",
    discountPercent: "",
    unitCbm: "",
    photoPath: null,
    customerNote: null,
    productionNote: null,
    customValues: {},
    fabrics: [],
    pieces: [],
    ...partial,
  };
}

/** A copy with fresh ids (row "duplicate"); prices are copied, the server decides what it keeps. */
export function copyLine(line: EditorLine): EditorLine {
  return {
    ...line,
    id: newId(),
    customValues: { ...line.customValues },
    fabrics: line.fabrics.map((fabric) => ({ ...fabric })),
    pieces: line.pieces.map((piece) => ({ ...piece, id: newId() })),
  };
}

/** Σ piece price × qty per unit, or null unless every non-accessory piece has a price. */
export function piecePriceTotal(line: EditorLine, pieceTypes: EditorCatalog["pieceTypes"]): string | null {
  if (!line.pieces.some((piece) => piece.unitPrice !== "")) return null;
  const amounts: Decimal[] = [];
  for (const piece of line.pieces) {
    if (piece.unitPrice === "") {
      if (pieceTypes.find((type) => type.id === piece.pieceTypeId)?.isAccessory) continue;
      return null;
    }
    amounts.push(dec(piece.unitPrice).times(piece.qtyPerUnit));
  }
  return toMoney(sum(amounts));
}

/** What the save actions receive; checked by createOrderSchema / updateOrderSchema. */
export type OrderPayload = {
  header: Omit<EditorHeader, "advanceMode" | "advanceValue"> & { advanceMode?: AdvanceMode; advanceValue?: string };
  items: {
    id: string;
    modelId: string;
    composition: string;
    quantity: number;
    unit: OrderUnit;
    unitPrice?: string;
    discountPercent?: string;
    unitCbm: string;
    photoPath: string | null;
    customerNote: LocalizedText;
    productionNote: LocalizedText;
    customValues: Record<string, string>;
    fabrics: { fabricId: string | null; freeText: string | null }[];
    pieces: (Omit<EditorPiece, "unitPrice"> & { unitPrice?: string })[];
  }[];
};

/** The save payload. Price fields are left out entirely for roles that may not write them. */
export function toPayload(state: EditorState, canWritePrices: boolean): OrderPayload {
  const { header } = state;
  const { advanceMode, advanceValue, ...rest } = header;
  return {
    header: {
      ...rest,
      secondaryRate: header.secondaryCurrency ? header.secondaryRate : "",
      ...(canWritePrices ? { advanceMode, advanceValue: advanceMode === "none" ? "" : advanceValue } : {}),
    },
    items: state.lines.map((line) => ({
      id: line.id,
      // Unknown (pasted) models fail validation with "choose a model".
      modelId: line.modelId ?? "",
      composition: line.composition,
      // Invalid quantities are sent as they are, so the server's check names the line.
      quantity: line.quantity ?? Number.NaN,
      unit: line.unit,
      unitCbm: line.unitCbm,
      photoPath: line.photoPath,
      customerNote: line.customerNote ?? {},
      productionNote: line.productionNote ?? {},
      customValues: line.customValues,
      fabrics: line.fabrics.map((fabric) => ({
        fabricId: fabric.fabricId,
        freeText: fabric.fabricId ? null : fabric.text,
      })),
      ...(canWritePrices ? { unitPrice: line.unitPrice, discountPercent: line.discountPercent } : {}),
      pieces: line.pieces.map((piece) => ({
        id: piece.id,
        pieceTypeId: piece.pieceTypeId,
        qtyPerUnit: piece.qtyPerUnit,
        modelOverrideId: piece.modelOverrideId,
        fabricOverrideId: piece.fabricOverrideId,
        ...(canWritePrices ? { unitPrice: piece.unitPrice } : {}),
      })),
    })),
  };
}

const orNull = (value: string) => (value === "" ? null : value);

/** One line in the domain shape (codes instead of ids); null while its model is unknown. */
export function lineToDomain(line: EditorLine, ref: EditorCatalog): OrderLine | null {
  const model = ref.models.find((entry) => entry.id === line.modelId);
  if (!model) return null;
  const codeOfModel = (id: string | null) => (id ? (ref.models.find((entry) => entry.id === id)?.code ?? null) : null);
  const fabricText = (id: string | null) => {
    const fabric = id ? ref.fabrics.find((entry) => entry.id === id) : null;
    return fabric ? `${fabric.brand} ${fabric.code}` : null;
  };
  return {
    model: model.code,
    composition: line.composition || null,
    quantity: line.quantity ?? 0,
    unit: line.unit,
    unitPrice: orNull(line.unitPrice),
    discountPercent: orNull(line.discountPercent),
    unitCbm: orNull(line.unitCbm),
    fabrics: line.fabrics.map((fabric) => fabric.text),
    pieces: line.pieces.map((piece) => ({
      pieceType: ref.pieceTypes.find((type) => type.id === piece.pieceTypeId)?.code ?? piece.pieceTypeId,
      qtyPerUnit: piece.qtyPerUnit,
      modelOverride: codeOfModel(piece.modelOverrideId),
      unitPrice: orNull(piece.unitPrice),
      fabric: fabricText(piece.fabricOverrideId),
    })),
  };
}

/** The whole order for computeOrderTotals / computePieceCounts (lines without a model are left out). */
export function toDomain(state: EditorState, ref: EditorCatalog): OrderForTotals {
  const { header } = state;
  return {
    currency: header.currency,
    secondaryCurrency: header.secondaryCurrency,
    secondaryRate: header.secondaryCurrency ? orNull(header.secondaryRate) : null,
    advanceType: header.advanceMode === "none" ? null : header.advanceMode,
    advanceValue: header.advanceMode === "none" ? null : orNull(header.advanceValue),
    items: state.lines.flatMap((line) => {
      const domain = lineToDomain(line, ref);
      return domain ? [domain] : [];
    }),
  };
}

/** Catalog unit CBM of a line (what the CBM cell shows when there is no override). */
export function catalogUnitCbm(line: EditorLine, ref: EditorCatalog): string | null {
  const domain = lineToDomain({ ...line, unitCbm: "" }, ref);
  if (!domain) return null;
  const value = effectiveUnitCbm(domain, ref.catalog);
  return value === null ? null : value.toDecimalPlaces(3).toFixed(3);
}

/** Units of `currency` per 1 `secondary` at the given rates to TRY ("1.1388"), or "" when a rate is missing. */
export function defaultSecondaryRate(currency: string, secondary: string | null, rates: RatesToTry): string {
  if (!secondary || secondary === currency) return "";
  const rate = convert(1, secondary, currency, rates);
  return rate === null ? "" : rate.toDecimalPlaces(4).toFixed(4);
}

const EMPTY_OPTIONS: Required<DocumentOptions> = {
  showPiecePrices: false,
  showSecondaryCurrency: false,
  showCbm: false,
  showPhotos: false,
  bankOrderCurrencyOnly: false,
};

/** A saved order as editor state. */
export function graphToEditorState(graph: OrderGraph): EditorState {
  const { order } = graph;
  return {
    header: {
      customerId: order.customerId,
      orderDate: order.orderDate,
      currency: order.currency,
      secondaryCurrency: order.secondaryCurrency,
      secondaryRate: order.secondaryRate ?? "",
      incoterm: order.incoterm,
      deliveryTime: order.deliveryTime,
      paymentTerms: order.paymentTerms,
      advanceMode: order.advanceType ?? "none",
      advanceValue: order.advanceValue ?? "",
      customerNotes: order.customerNotes,
      productionNotes: order.productionNotes,
      sampleApprovalRequired: order.sampleApprovalRequired,
      sampleApprovalText: order.sampleApprovalText,
      documentOptions: { ...EMPTY_OPTIONS, ...order.documentOptions },
      labelBranding: order.labelBranding,
      labelTemplateId: order.labelTemplateId,
      customColumns: order.customColumns,
    },
    lines: graph.items.map((item) => ({
      id: item.id,
      modelId: item.modelId,
      modelText: item.modelCode,
      composition: item.composition ?? "",
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice ?? "",
      discountPercent: Number(item.discountPercent) === 0 ? "" : item.discountPercent,
      unitCbm: item.unitCbm ?? "",
      photoPath: item.photoPath,
      customerNote: item.customerNote,
      productionNote: item.productionNote,
      customValues: Object.fromEntries(
        Object.entries(item.customValues).flatMap(([key, value]) => (value === null ? [] : [[key, String(value)]])),
      ),
      fabrics: item.fabrics.map((fabric) => ({ fabricId: fabric.fabricId, text: fabric.label })),
      pieces: item.pieces.map((piece) => ({
        id: piece.id,
        pieceTypeId: piece.pieceTypeId,
        qtyPerUnit: piece.qtyPerUnit,
        modelOverrideId: piece.modelOverrideId,
        fabricOverrideId: piece.fabricOverrideId,
        unitPrice: piece.unitPrice ?? "",
      })),
    })),
  };
}

type NewOrderDefaults = {
  customer: {
    id: string;
    defaultCurrency: string;
    secondaryCurrency: string | null;
    defaultIncoterm: string;
    labelBranding: LabelBranding;
    defaultLabelTemplateId: string | null;
  };
  company: { defaultDeliveryTime: LocalizedText | null; defaultPaymentTerms: LocalizedText | null } | null;
  rates: RatesToTry;
  today: string;
  /** Columns of the customer's default column template, if it has one. */
  customColumns?: CustomColumn[];
};

/** A new order: currency, terms and label settings from the customer, delivery/payment from the company. */
export function newOrderState({ customer, company, rates, today, customColumns = [] }: NewOrderDefaults): EditorState {
  const secondary = customer.secondaryCurrency !== customer.defaultCurrency ? customer.secondaryCurrency : null;
  return {
    header: {
      customerId: customer.id,
      orderDate: today,
      currency: customer.defaultCurrency,
      secondaryCurrency: secondary,
      secondaryRate: defaultSecondaryRate(customer.defaultCurrency, secondary, rates),
      incoterm: customer.defaultIncoterm,
      deliveryTime: company?.defaultDeliveryTime ?? null,
      paymentTerms: company?.defaultPaymentTerms ?? null,
      advanceMode: "none",
      advanceValue: "",
      customerNotes: null,
      productionNotes: null,
      sampleApprovalRequired: false,
      sampleApprovalText: null,
      documentOptions: { ...EMPTY_OPTIONS, showSecondaryCurrency: secondary !== null },
      labelBranding: customer.labelBranding,
      labelTemplateId: customer.defaultLabelTemplateId,
      customColumns,
    },
    lines: [],
  };
}

/** What the editor offers, already in the user's language (built by the order pages). */
export type EditorOptions = {
  customers: { id: string; companyName: string; country: string; active: boolean }[];
  models: { id: string; code: string; name: string; photoUrl: string | null; active: boolean; presets: string[] }[];
  pieceTypes: { id: string; code: string; seats: number; isAccessory: boolean; name: string; shortName: string }[];
  fabrics: { id: string; brand: string; code: string; label: string; colorKey: string | null; active: boolean }[];
  labelTemplates: { id: string; name: string; active: boolean }[];
  catalog: Catalog;
};

export function editorCatalog(options: EditorOptions): EditorCatalog {
  return { models: options.models, pieceTypes: options.pieceTypes, fabrics: options.fabrics, catalog: options.catalog };
}

/** {tr,en,ar} as typed → only the filled-in languages, or null when all are empty. */
export function compactText(value: LocalizedText): LocalizedText | null {
  const out: LocalizedText = {};
  for (const lang of ["tr", "en", "ar"] as const) {
    const text = value[lang]?.trim();
    if (text) out[lang] = value[lang];
  }
  return Object.keys(out).length > 0 ? out : null;
}
