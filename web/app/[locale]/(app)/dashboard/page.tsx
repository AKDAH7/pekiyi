import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";

export default async function DashboardPage() {
  const t = await getTranslations();
  return <ComingSoon title={t("nav.dashboard")} description={t("common.comingSoonDescription")} />;
}
