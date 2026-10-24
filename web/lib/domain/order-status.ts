/**
 * The order status flow (DOMAIN.md "Orders"):
 *
 *   offer → proforma → confirmed → in_production → ready → loading → shipped → closed
 *
 * - forward one step at a time;
 * - cancelled from any status before shipped;
 * - an admin may move back one step (a cancelled order back to the status
 *   it was cancelled from), always with a reason.
 *
 * Pure; the status action (actions/orders.ts) and the status menu share it.
 */
import type { OrderStatus } from "@/db/schema/orders";

export const STATUS_FLOW = [
  "offer",
  "proforma",
  "confirmed",
  "in_production",
  "ready",
  "loading",
  "shipped",
  "closed",
] as const satisfies readonly OrderStatus[];

export type StatusMove = "forward" | "cancel" | "back";

export type StatusTransition = { to: OrderStatus; move: StatusMove };

function flowIndex(status: OrderStatus): number {
  return (STATUS_FLOW as readonly OrderStatus[]).indexOf(status);
}

export function nextStatus(status: OrderStatus): OrderStatus | null {
  const index = flowIndex(status);
  return index >= 0 && index < STATUS_FLOW.length - 1 ? STATUS_FLOW[index + 1] : null;
}

/** Cancelling is possible until the goods have left. */
export function canCancel(status: OrderStatus): boolean {
  const index = flowIndex(status);
  return index >= 0 && index < flowIndex("shipped");
}

/**
 * One step back. For a cancelled order that is the status it was cancelled
 * from (`cancelledFrom`, read from the audit trail); unknown → none.
 */
export function previousStatus(status: OrderStatus, cancelledFrom: OrderStatus | null = null): OrderStatus | null {
  if (status === "cancelled") return cancelledFrom && canCancel(cancelledFrom) ? cancelledFrom : null;
  const index = flowIndex(status);
  return index > 0 ? STATUS_FLOW[index - 1] : null;
}

/** What a user may change `status` to. Moving back needs `mayStepBack` (admin). */
export function allowedTransitions(
  status: OrderStatus,
  { mayStepBack, cancelledFrom = null }: { mayStepBack: boolean; cancelledFrom?: OrderStatus | null },
): StatusTransition[] {
  const result: StatusTransition[] = [];
  const next = nextStatus(status);
  if (next) result.push({ to: next, move: "forward" });
  if (canCancel(status)) result.push({ to: "cancelled", move: "cancel" });
  if (mayStepBack) {
    const previous = previousStatus(status, cancelledFrom);
    if (previous) result.push({ to: previous, move: "back" });
  }
  return result;
}

/** The transition from `status` to `to`, or null when it isn't allowed. */
export function findTransition(
  status: OrderStatus,
  to: OrderStatus,
  options: { mayStepBack: boolean; cancelledFrom?: OrderStatus | null },
): StatusTransition | null {
  return allowedTransitions(status, options).find((transition) => transition.to === to) ?? null;
}
