import { effectiveModel, type OrderForTotals } from "./types";

export type PieceCount = {
  /** Model the piece is built as (piece override applied). */
  model: string;
  pieceType: string;
  /** Fabric labels of the piece; several when a line has more than one. */
  fabrics: string[];
  quantity: number;
};

/**
 * Physical pieces of an order grouped by (effective model, piece type,
 * fabric), in order of first appearance — the basis of the loading control
 * form. Uses no prices, so it is safe for the production role.
 */
export function computePieceCounts(order: Pick<OrderForTotals, "items">): PieceCount[] {
  const groups = new Map<string, PieceCount>();

  for (const line of order.items) {
    for (const piece of line.pieces) {
      const model = effectiveModel(line, piece);
      const fabrics = piece.fabric ? [piece.fabric] : [...line.fabrics];
      const key = JSON.stringify([model, piece.pieceType, fabrics]);
      const quantity = line.quantity * piece.qtyPerUnit;
      const existing = groups.get(key);
      if (existing) existing.quantity += quantity;
      else groups.set(key, { model, pieceType: piece.pieceType, fabrics, quantity });
    }
  }

  return [...groups.values()];
}

/** Total pieces per piece type: { SEAT_3: 60, SEAT_1: 60, CUSHION_EXTRA: 60 }. */
export function countByPieceType(counts: readonly PieceCount[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const { pieceType, quantity } of counts) {
    result[pieceType] = (result[pieceType] ?? 0) + quantity;
  }
  return result;
}
