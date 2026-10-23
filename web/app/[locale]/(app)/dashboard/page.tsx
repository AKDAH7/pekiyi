import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  // Every role may see the dashboard.
  await requireUser();
  const t = await getTranslations();
  return <ComingSoon title={t("nav.dashboard")} description={t("common.comingSoonDescription")} />;
}
