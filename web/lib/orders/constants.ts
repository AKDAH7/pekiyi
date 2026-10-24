/**
 * Choices and limits of the order pages. Client-safe (only type imports
 * from the schema), so the editor and the server share them.
 */
import type { AdvanceType, OrderStatus, OrderUnit } from "@/db/schema/orders";

export const ORDER_STATUS_LIST = [
  "offer",
  "proforma",
  "confirmed",
  "in_production",
  "ready",
  "loading",
  "shipped",
  "closed",
  "cancelled",
] as const satisfies readonly OrderStatus[];

export const ORDER_UNIT_LIST = ["SET", "PCS"] as const satisfies readonly OrderUnit[];

/** The advance select; "none" is stored as advance_type = null. */
export const ADVANCE_MODES = ["none", "amount", "percent"] as const;
export type AdvanceMode = "none" | AdvanceType;

export const DOCUMENT_OPTION_KEYS = [
  "showPiecePrices",
  "showSecondaryCurrency",
  "showCbm",
  "showPhotos",
  "bankOrderCurrencyOnly",
] as const;

/** Compositions offered for every model, after the model's own presets. */
export const COMMON_COMPOSITIONS = ["3+3+1+1", "3+2+1", "3+1+1", "3+1", "3", "2", "1"] as const;

export const ORDERS_PAGE_SIZE = 25;
export const MAX_ORDER_LINES = 500;
export const MAX_PIECES_PER_LINE = 20;
export const MAX_FABRICS_PER_LINE = 10;

/** How often an open order checks whether someone else saved it. */
export const VERSION_POLL_MS = 20_000;

/** Line photos uploaded from the grid (lib/storage keys in the "orders" folder). */
export const ORDER_PHOTO_KEY_RE =
  /^orders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** Badge colours per status (Tailwind classes, RTL-neutral). */
export const STATUS_TONE: Record<OrderStatus, string> = {
  offer: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  proforma: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  confirmed: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100",
  in_production: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  ready: "bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-100",
  loading: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100",
  shipped: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  closed: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  cancelled: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
};
