import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";
import { requirePermission } from "@/lib/auth/session";

export default async function OrdersPage() {
  await requirePermission("orders", "read");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.orders")} description={t("common.comingSoonDescription")} />;
}
