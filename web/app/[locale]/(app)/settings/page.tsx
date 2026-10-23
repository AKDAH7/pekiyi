import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";

export default async function SettingsPage() {
  const t = await getTranslations();
  return <ComingSoon title={t("nav.settings")} description={t("common.comingSoonDescription")} />;
}
