import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";

export default async function LabelsPage() {
  const t = await getTranslations();
  return <ComingSoon title={t("nav.labels")} description={t("common.comingSoonDescription")} />;
}
