import { requirePermission } from "@/lib/auth/session";
import { getOrderVersion, lastOrderChange } from "@/lib/orders/queries";
import { orderIdSchema } from "@/lib/validation/orders";

/**
 * The order editor polls this every 20 s (while the tab is visible) to
 * notice that someone else saved the order: current version, who saved it
 * last and when.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = orderIdSchema.safeParse(await ctx.params);
  if (!parsed.success) return new Response(null, { status: 404 });

  await requirePermission("orders", "read");
  const [row, change] = await Promise.all([getOrderVersion(parsed.data.id), lastOrderChange(parsed.data.id)]);
  if (!row) return new Response(null, { status: 404 });

  return Response.json(
    {
      version: row.version,
      changedBy: change?.userName ?? null,
      changedAt: (change?.at ?? row.updatedAt).toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
