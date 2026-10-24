import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { formatDecimal } from "@/lib/format/number";
import { getLatestRates, listRateDays } from "@/lib/settings/queries";
import { MissingRateBanner } from "@/components/missing-rate-banner";
import { PageHeader } from "@/components/page-header";
import { AddRatesForm, EditRatesButton } from "@/components/settings/rate-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ExchangeRatesPage() {
  // Rates are price data: whoever sees prices may see them; only admins add them.
  const me = await requirePermission("prices", "read");
  const [days, latest, t, common, format, locale] = await Promise.all([
    listRateDays(),
    getLatestRates(),
    getTranslations("rates"),
    getTranslations("common"),
    getFormatter(),
    getLocale(),
  ]);
  const canEdit = can(me.role, "settings", "update");
  const rate = (value: string | null | undefined) =>
    value ? formatDecimal(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "—";
  const dateLabel = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <MissingRateBanner role={me.role} latest={latest} />

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("addTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AddRatesForm today={latest.today} />
          </CardContent>
        </Card>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead className="text-end">{t("usdTry")}</TableHead>
              <TableHead className="text-end">{t("eurTry")}</TableHead>
              <TableHead className="text-end">{t("usdPerEur")}</TableHead>
              {canEdit ? (
                <TableHead className="w-0">
                  <span className="sr-only">{common("actions")}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              days.map((day) => (
                <TableRow key={day.date}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {dateLabel(day.date)}
                    {day.date === latest.today ? (
                      <span className="ms-2 text-xs text-muted-foreground">({t("today")})</span>
                    ) : null}
                  </TableCell>
                  <TableCell dir="ltr" className="text-end tabular-nums">
                    {rate(day.usd?.rate)}
                  </TableCell>
                  <TableCell dir="ltr" className="text-end tabular-nums">
                    {rate(day.eur?.rate)}
                  </TableCell>
                  <TableCell dir="ltr" className="text-end tabular-nums">
                    {day.usdPerEur
                      ? formatDecimal(day.usdPerEur, locale, { minimumFractionDigits: 4 })
                      : "—"}
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      {day.usd && day.eur ? (
                        <EditRatesButton
                          day={{ date: day.date, dateLabel: dateLabel(day.date), usd: day.usd, eur: day.eur }}
                        />
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">{t("derivedNote")}</p>
    </div>
  );
}
