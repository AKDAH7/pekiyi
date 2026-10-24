import { TriangleAlert } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import type { LatestRates } from "@/lib/settings/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Warns that today's exchange rates haven't been entered yet, so price
 * suggestions use an older day's rates. Only for roles that see prices.
 */
export async function MissingRateBanner({
  role,
  latest,
}: {
  role: string | null | undefined;
  latest: LatestRates;
}) {
  if (!can(role, "prices", "read") || latest.hasToday) return null;
  const [t, format] = await Promise.all([getTranslations("rates"), getFormatter()]);
  const last = latest.dates.USD ?? latest.dates.EUR;
  const lastDate =
    last && format.dateTime(new Date(`${last}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <Alert className="border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <TriangleAlert />
      <AlertTitle>{t("missingTitle")}</AlertTitle>
      <AlertDescription className="text-amber-900/90 dark:text-amber-200/90">
        {lastDate ? t("missingUsingOlder", { date: lastDate }) : t("missingNone")}{" "}
        {can(role, "settings", "update") ? (
          <Link href="/settings/exchange-rates">{t("addToday")}</Link>
        ) : (
          t("askAdmin")
        )}
      </AlertDescription>
    </Alert>
  );
}
