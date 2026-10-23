/**
 * Compositions describe one set: "3+3+1+1" = two 3-seaters + two armchairs.
 * Each digit is a seat count that maps to a piece type.
 */

export type CompositionPiece = { pieceType: string; qty: number };

export type CompositionError =
  | { code: "empty" }
  | { code: "unknown_token"; token: string }
  | { code: "empty_token" };

export type CompositionResult =
  | { ok: true; pieces: CompositionPiece[] }
  | { ok: false; error: CompositionError };

/** Seat count → piece type code. Mirrors piece_types.seats for non-accessories. */
export const DEFAULT_SEAT_PIECE_TYPES: Readonly<Record<string, string>> = {
  "3": "SEAT_3",
  "2": "SEAT_2",
  "1": "SEAT_1",
};

/**
 * "3+3+1+1" → [{SEAT_3, 2}, {SEAT_1, 2}], grouped, in order of first
 * appearance. Whitespace around tokens is ignored.
 */
export function parseComposition(
  text: string,
  seatPieceTypes: Readonly<Record<string, string>> = DEFAULT_SEAT_PIECE_TYPES,
): CompositionResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: { code: "empty" } };

  const counts = new Map<string, number>();
  for (const raw of trimmed.split("+")) {
    const token = raw.trim();
    if (token === "") return { ok: false, error: { code: "empty_token" } };
    const pieceType = Object.hasOwn(seatPieceTypes, token) ? seatPieceTypes[token] : undefined;
    if (!pieceType) return { ok: false, error: { code: "unknown_token", token } };
    counts.set(pieceType, (counts.get(pieceType) ?? 0) + 1);
  }

  return {
    ok: true,
    pieces: [...counts].map(([pieceType, qty]) => ({ pieceType, qty })),
  };
}

/**
 * Reverse of parseComposition: [{SEAT_3, 2}, {SEAT_1, 2}] → "3+3+1+1".
 * Piece types without a seat digit (accessories) are left out. Larger
 * pieces come first, as on our documents.
 */
export function formatComposition(
  pieces: readonly CompositionPiece[],
  seatPieceTypes: Readonly<Record<string, string>> = DEFAULT_SEAT_PIECE_TYPES,
): string {
  const digitOf = new Map(Object.entries(seatPieceTypes).map(([digit, code]) => [code, digit]));
  return pieces
    .flatMap(({ pieceType, qty }) => {
      const digit = digitOf.get(pieceType);
      return digit === undefined ? [] : Array<string>(qty).fill(digit);
    })
    .sort((a, b) => Number(b) - Number(a))
    .join("+");
}

/** Normalised form used to compare compositions ("3 + 1+3+1" equals "3+3+1+1"). */
export function normalizeComposition(
  text: string,
  seatPieceTypes: Readonly<Record<string, string>> = DEFAULT_SEAT_PIECE_TYPES,
): string | null {
  const parsed = parseComposition(text, seatPieceTypes);
  return parsed.ok ? formatComposition(parsed.pieces, seatPieceTypes) : null;
}
