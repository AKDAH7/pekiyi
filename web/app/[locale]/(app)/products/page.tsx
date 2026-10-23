import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";
import { requirePermission } from "@/lib/auth/session";

export default async function ProductsPage() {
  await requirePermission("products", "read");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.products")} description={t("common.comingSoonDescription")} />;
}
