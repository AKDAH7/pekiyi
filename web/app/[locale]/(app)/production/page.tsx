import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";
import { requirePermission } from "@/lib/auth/session";

export default async function ProductionPage() {
  await requirePermission("production", "read");
  const t = await getTranslations();
  return (
    <ComingSoon title={t("nav.production")} description={t("common.comingSoonDescription")} />
  );
}
