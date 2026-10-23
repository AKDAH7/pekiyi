import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";

export default async function OrdersPage() {
  const t = await getTranslations();
  return <ComingSoon title={t("nav.orders")} description={t("common.comingSoonDescription")} />;
}
