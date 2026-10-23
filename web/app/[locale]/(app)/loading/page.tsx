import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";

export default async function LoadingControlPage() {
  const t = await getTranslations();
  return <ComingSoon title={t("nav.loading")} description={t("common.comingSoonDescription")} />;
}
