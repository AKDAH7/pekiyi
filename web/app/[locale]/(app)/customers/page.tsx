import { getTranslations } from "next-intl/server";

import { ComingSoon } from "@/components/coming-soon";

export default async function CustomersPage() {
  const t = await getTranslations();
  return <ComingSoon title={t("nav.customers")} description={t("common.comingSoonDescription")} />;
}
