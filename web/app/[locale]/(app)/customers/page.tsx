import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";
import { requirePermission } from "@/lib/auth/session";

export default async function CustomersPage() {
  await requirePermission("customers", "read");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.customers")} description={t("common.comingSoonDescription")} />;
}
