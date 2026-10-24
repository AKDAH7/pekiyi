import { getTranslations } from "next-intl/server";

import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { getLatestRates } from "@/lib/settings/queries";
import { ComingSoon } from "@/components/coming-soon";
import { MissingRateBanner } from "@/components/missing-rate-banner";

export default async function DashboardPage() {
  // Every role may see the dashboard.
  const user = await requireUser();
  const t = await getTranslations();
  // Production never sees rates, so don't even query them for that role.
  const latest = can(user.role, "prices", "read") ? await getLatestRates() : null;

  return (
    <div className="flex flex-col gap-6">
      {latest ? <MissingRateBanner role={user.role} latest={latest} /> : null}
      <ComingSoon title={t("nav.dashboard")} description={t("common.comingSoonDescription")} />
    </div>
  );
}
