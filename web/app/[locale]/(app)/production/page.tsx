import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";

export default async function ProductionPage() {
  const t = await getTranslations();
  return (
    <ComingSoon title={t("nav.production")} description={t("common.comingSoonDescription")} />
  );
}
