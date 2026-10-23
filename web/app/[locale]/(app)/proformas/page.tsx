import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";

export default async function ProformasPage() {
  const t = await getTranslations();
  return (
    <ComingSoon title={t("nav.proformas")} description={t("common.comingSoonDescription")} />
  );
}
