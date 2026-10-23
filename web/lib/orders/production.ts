import "server-only";

import { db } from "@/db";

import {
  pickProductionCustomValues,
  productionCustomColumns,
  productionQueries,
} from "./production-queries";

/**
 * An order as the production role may see it: everything needed to build
 * the production sheet and the loading control form, and no price data
 * (see production-queries.ts). Callers still check the role/permission.
 */
export async function getOrderForProduction(orderId: string) {
  const queries = productionQueries(db, orderId);
  const [[order], items, pieces, fabrics, referenceNotes] = await Promise.all([
    queries.order,
    queries.items,
    queries.pieces,
    queries.fabrics,
    queries.referenceNotes,
  ]);
  if (!order) return null;

  const { customerLabelBranding, customColumns, ...rest } = order;
  return {
    ...rest,
    labelBranding: order.labelBranding ?? customerLabelBranding,
    customColumns: productionCustomColumns(customColumns),
    referenceNotes,
    items: items.map((item) => ({
      ...item,
      customValues: pickProductionCustomValues(customColumns, item.customValues),
      pieces: pieces.filter((piece) => piece.itemId === item.id),
      fabrics: fabrics.filter((fabric) => fabric.itemId === item.id),
    })),
  };
}

export type ProductionOrder = NonNullable<Awaited<ReturnType<typeof getOrderForProduction>>>;
