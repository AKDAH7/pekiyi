import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";
import { requirePermission } from "@/lib/auth/session";

export default async function ProformasPage() {
  await requirePermission("proformas", "read");
  const t = await getTranslations();
  return (
    <ComingSoon title={t("nav.proformas")} description={t("common.comingSoonDescription")} />
  );
}
