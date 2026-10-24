"use client";

import { createContext, useContext } from "react";

/**
 * What the order page's own actions (status menu, "Issue proforma") need
 * from the editor around them: the version the editor holds, and whether it
 * has unsaved changes — those actions only run on a saved, clean order.
 */
export type OrderEditorStatus = { version: number; dirty: boolean; saving: boolean };

export const OrderEditorContext = createContext<OrderEditorStatus | null>(null);

export function useOrderEditorStatus(): OrderEditorStatus {
  const status = useContext(OrderEditorContext);
  if (!status) throw new Error("useOrderEditorStatus must be used inside <OrderEditor>");
  return status;
}
