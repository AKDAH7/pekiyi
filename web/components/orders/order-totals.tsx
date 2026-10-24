"use client";

import { useLocale, useTranslations } from "next-intl";

import type { OrderTotals as Totals } from "@/lib/domain/totals";
import { formatDecimal, numberLocale } from "@/lib/format/number";

type Props = {
  totals: Totals;
  /** Pieces per piece type, every type listed (zeros too). */
  pieceSummary: { name: string; quantity: number }[];
  totalPieces: number;
  lineCount: number;
  canSeePrices: boolean;
  /** Lines left out of the figures because their model isn't chosen yet. */
  linesWithoutModel: number;
};

function Figure({ label, value, testId, strong }: { label: string; value: string; testId: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd data-testid={testId} dir="ltr" className={strong ? "text-lg font-semibold tabular-nums" : "font-medium tabular-nums"}>
        {value}
      </dd>
    </div>
  );
}

/** Live totals under the grid (computeOrderTotals / computePieceCounts). */
export function OrderTotals({ totals, pieceSummary, totalPieces, lineCount, canSeePrices, linesWithoutModel }: Props) {
  const t = useTranslations("orders.totals");
  const locale = useLocale();
  const money = (value: string, currency: string) => `${formatDecimal(value, locale)} ${currency}`;
  const integer = new Intl.NumberFormat(numberLocale(locale));

  return (
    <section aria-label={t("label")} className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {canSeePrices ? (
          <>
            <Figure label={t("total")} value={money(totals.total, totals.currency)} testId="total" strong />
            <Figure label={t("advance")} value={money(totals.advance, totals.currency)} testId="advance" />
            <Figure label={t("balance")} value={money(totals.balance, totals.currency)} testId="balance" />
            {totals.secondary ? (
              <Figure
                label={t("secondaryTotal", { currency: totals.secondary.currency })}
                value={money(totals.secondary.total, totals.secondary.currency)}
                testId="secondary-total"
              />
            ) : null}
          </>
        ) : null}
        <Figure label={t("totalCbm")} value={`${formatDecimal(totals.totalCbm, locale, { minimumFractionDigits: 3 })} m³`} testId="total-cbm" />
        <Figure label={t("pieces")} value={integer.format(totalPieces)} testId="total-pieces" />
      </dl>
      <p data-testid="piece-summary" className="text-sm">
        {pieceSummary.map((entry) => `${entry.name} ${integer.format(entry.quantity)}`).join(" · ")}
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li>{t("lines", { count: lineCount })}</li>
        {canSeePrices && totals.unpricedLines > 0 ? <li className="text-amber-700 dark:text-amber-400">{t("unpriced", { count: totals.unpricedLines })}</li> : null}
        {totals.linesMissingCbm > 0 ? <li className="text-amber-700 dark:text-amber-400">{t("missingCbm", { count: totals.linesMissingCbm })}</li> : null}
        {linesWithoutModel > 0 ? <li className="text-destructive">{t("withoutModel", { count: linesWithoutModel })}</li> : null}
      </ul>
    </section>
  );
}
