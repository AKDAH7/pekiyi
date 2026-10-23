import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";
import { requirePermission } from "@/lib/auth/session";

export default async function LabelsPage() {
  await requirePermission("labels", "read");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.labels")} description={t("common.comingSoonDescription")} />;
}
