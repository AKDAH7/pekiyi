import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";
import { requirePermission } from "@/lib/auth/session";

export default async function LoadingControlPage() {
  await requirePermission("loading", "read");
  const t = await getTranslations();
  return <ComingSoon title={t("nav.loading")} description={t("common.comingSoonDescription")} />;
}
