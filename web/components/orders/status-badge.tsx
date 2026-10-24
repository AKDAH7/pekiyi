import type { OrderStatus } from "@/db/schema/orders";
import { STATUS_TONE } from "@/lib/orders/constants";
import { cn } from "@/lib/utils";

/** Order status as a coloured pill; `label` is the translated status. */
export function StatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  return (
    <span
      data-status={status}
      className={cn("inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap", STATUS_TONE[status])}
    >
      {label}
    </span>
  );
}
