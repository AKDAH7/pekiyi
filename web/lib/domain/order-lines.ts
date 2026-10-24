/**
 * Building order lines in the grid: unit auto-selection, Excel paste,
 * the model × fabric "matrix" and the piece summary under the totals.
 * Pure and id-agnostic: callers pass the catalog entries to match against
 * and get references back, so it is shared by the browser grid and tests.
 */
import { parseComposition, type CompositionPiece } from "./composition";
import type { PieceCount } from "./piece-counts";
import { foldLetters } from "./text-fold";
import { parseLocaleDecimal } from "../format/number";

export type OrderUnitCode = "SET" | "PCS";

/**
 * SET when one unit consists of more than one piece ("3+1", "3+3+1+1"),
 * PCS for a single piece ("3"). Null when the composition can't be read,
 * so the caller keeps whatever unit the line has.
 */
export function autoUnit(composition: string | null | undefined): OrderUnitCode | null {
  if (!composition) return null;
  const parsed = parseComposition(composition);
  if (!parsed.ok) return null;
  const pieces = parsed.pieces.reduce((total, piece) => total + piece.qty, 0);
  return pieces > 1 ? "SET" : "PCS";
}

/** A catalog model as the matchers see it. */
export type ModelRef = { id: string; code: string };
/** A catalog fabric as the matchers see it ("BOYTEKS" + "30147204"). */
export type FabricRef = { id: string; brand: string; code: string };

const fold = (value: string) => foldLetters(value).replace(/\s+/g, " ").trim();

/** Model by code, ignoring case, Turkish letters and extra spaces ("riva" → RİVA). */
export function matchModel<T extends ModelRef>(text: string, models: readonly T[]): T | null {
  const wanted = fold(text);
  if (!wanted) return null;
  return models.find((model) => fold(model.code) === wanted) ?? null;
}

/**
 * Fabric by "BRAND CODE [colour]" ("BOYTEKS 30147204 KAPUÇİNO"), the way
 * our sheets write them: longest catalog code first, so "EMK 663 V04"
 * doesn't stop at a shorter code. Case / Turkish-letter insensitive.
 */
export function matchFabric<T extends FabricRef>(text: string, fabrics: readonly T[]): T | null {
  const wanted = fold(text);
  if (!wanted) return null;
  const candidates = [...fabrics].sort((a, b) => b.code.length - a.code.length);
  return (
    candidates.find((fabric) => {
      const prefix = fold(`${fabric.brand} ${fabric.code}`);
      return wanted === prefix || wanted.startsWith(`${prefix} `);
    }) ?? null
  );
}

/** One fabric cell: a catalog fabric, or the text as typed when it isn't in the catalog. */
export type FabricMatch = { text: string; fabricId: string | null };

export type PastedLine = {
  /** 1-based row number in the pasted text (for messages). */
  row: number;
  modelText: string;
  modelId: string | null;
  composition: string;
  /** False when the composition is filled in but not "3+3+1+1"-like. */
  compositionValid: boolean;
  pieces: CompositionPiece[];
  fabrics: FabricMatch[];
  quantity: number | null;
  quantityText: string;
  /** Canonical decimal string, or null when empty / not a number. */
  unitPrice: string | null;
  unitPriceText: string;
  unit: OrderUnitCode;
};

export type PasteResult = {
  lines: PastedLine[];
  /** Whether the first row looked like column titles and was skipped. */
  skippedHeader: boolean;
};

/** Several fabrics in one cell: "APOLLO 23 / APOLLO 21", "A; B", "A, B". */
function splitFabrics(cell: string): string[] {
  return cell
    .split(/\s*[;/,]\s*|\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Excel quotes cells that contain tabs, newlines or quotes; "" is a literal quote. */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const normalized = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (quoted) {
      if (char === '"' && normalized[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

const INTEGER_RE = /^\d+$/;

/**
 * Tab-separated rows copied from Excel — model, composition, fabric(s),
 * quantity, unit price — into order lines. Nothing is dropped: an unknown
 * model has `modelId: null`, an unknown fabric `fabricId: null`, a bad
 * number `null` with the original text kept, so the grid can show each
 * problem in red for the user to fix. A first row whose quantity and price
 * cells aren't numbers is taken as column titles and skipped.
 */
export function parsePastedLines(
  text: string,
  catalog: { models: readonly ModelRef[]; fabrics: readonly FabricRef[] },
  locale: string,
): PasteResult {
  const rows = parseTsv(text);
  let skippedHeader = false;
  if (rows.length > 0) {
    const [, , , qty = "", price = ""] = rows[0].map((cell) => cell.trim());
    const looksNumeric = INTEGER_RE.test(qty) || parseLocaleDecimal(price, locale) !== null;
    if (!looksNumeric && !matchModel(rows[0][0] ?? "", catalog.models)) {
      rows.shift();
      skippedHeader = true;
    }
  }

  const lines = rows.map((cells, index): PastedLine => {
    const [modelText = "", composition = "", fabricCell = "", quantityText = "", unitPriceText = ""] = cells.map(
      (cell) => cell.trim(),
    );
    const model = matchModel(modelText, catalog.models);
    const parsed = composition ? parseComposition(composition) : null;
    const pieces = parsed?.ok ? parsed.pieces : [];
    const quantity = INTEGER_RE.test(quantityText) && Number(quantityText) > 0 ? Number(quantityText) : null;
    const unitPrice = unitPriceText ? parseLocaleDecimal(unitPriceText, locale) : null;
    return {
      row: index + 1 + (skippedHeader ? 1 : 0),
      modelText,
      modelId: model?.id ?? null,
      composition,
      compositionValid: parsed === null || parsed.ok,
      pieces,
      fabrics: splitFabrics(fabricCell).map((label) => ({
        text: label,
        fabricId: matchFabric(label, catalog.fabrics)?.id ?? null,
      })),
      quantity,
      quantityText,
      unitPrice: unitPrice !== null && !unitPrice.startsWith("-") ? unitPrice : null,
      unitPriceText,
      unit: autoUnit(composition) ?? "SET",
    };
  });

  return { lines, skippedHeader };
}

export type MatrixInput = {
  modelIds: readonly string[];
  /** Each entry is one colour: a catalog fabric or free text. */
  fabrics: readonly FabricMatch[];
  composition: string;
  quantity: number;
};

export type MatrixLine = {
  modelId: string;
  fabric: FabricMatch;
  composition: string;
  pieces: CompositionPiece[];
  quantity: number;
  unit: OrderUnitCode;
};

/**
 * "4 models × 6 colours" → 24 lines, model by model (every colour of the
 * first model, then the next model), like our order sheets list them.
 * Throws on an unreadable composition or a non-positive quantity: the
 * dialog validates those before calling.
 */
export function matrixLines({ modelIds, fabrics, composition, quantity }: MatrixInput): MatrixLine[] {
  const parsed = parseComposition(composition);
  if (!parsed.ok) throw new Error(`Invalid composition "${composition}"`);
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Invalid quantity ${quantity}`);
  const unit = autoUnit(composition) ?? "SET";
  return modelIds.flatMap((modelId) =>
    fabrics.map((fabric) => ({
      modelId,
      fabric,
      composition: composition.trim(),
      pieces: parsed.pieces.map((piece) => ({ ...piece })),
      quantity,
      unit,
    })),
  );
}

/**
 * Pieces per piece type for the summary under the totals ("3'lü 22 ·
 * 2'li 12 · 1'li 12 · Ekstra yastık 0"): every piece type in `pieceTypes`
 * order, zeros included, then any type only the order knows about.
 */
export function pieceTypeTotals(
  counts: readonly PieceCount[],
  pieceTypes: readonly string[],
): { pieceType: string; quantity: number }[] {
  const totals = new Map(pieceTypes.map((code) => [code, 0]));
  for (const { pieceType, quantity } of counts) totals.set(pieceType, (totals.get(pieceType) ?? 0) + quantity);
  return [...totals].map(([pieceType, quantity]) => ({ pieceType, quantity }));
}
