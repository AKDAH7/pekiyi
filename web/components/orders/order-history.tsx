"use client";

import { useMemo, useState } from "react";
import { ArrowRight, FileCheck2, History, ListChecks, PencilLine, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { toDocumentLanguage } from "@/lib/documents/languages";
import { BUSINESS_TIME_ZONE } from "@/lib/format/dates";
import { filterEntry, HISTORY_FILTERS, type HistoryEntry, type HistoryFilter, type HistoryValue } from "@/lib/orders/history";
import { cn } from "@/lib/utils";

import { IssueDownloads } from "./proforma-documents";
import { StatusBadge } from "./status-badge";

const KIND_ICON = { created: Plus, edited: PencilLine, status: ListChecks, issue: FileCheck2 } as const;

/**
 * The order's timeline: who changed what and when, newest first, filterable
 * by type. Issued proformas can be downloaded from their entry when
 * `downloads` is on (roles that may read proformas).
 */
export function OrderHistory({ entries, orderId, downloads }: { entries: HistoryEntry[]; orderId: string; downloads: boolean }) {
  const t = useTranslations("orders.history");
  const fields = useTranslations("audit.fields");
  const statuses = useTranslations("orders.statuses");
  const languages = useTranslations("languages");
  const common = useTranslations("common");
  const format = useFormatter();
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const shown = useMemo(
    () => entries.flatMap((entry) => {
      const part = filterEntry(entry, filter);
      return part ? [part] : [];
    }),
    [entries, filter],
  );

  const show = (value: HistoryValue, field?: string) => {
    if (value === null || value === "") return <span className="text-muted-foreground">—</span>;
    if (typeof value === "boolean") return value ? common("yes") : common("no");
    if (field === "status" && typeof value === "string" && statuses.has(value)) return statuses(value);
    return <bdi>{String(value)}</bdi>;
  };
  const fieldName = (field: string) => (fields.has(field) ? fields(field) : field);

  return (
    <section aria-labelledby="order-history-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="order-history-title" className="flex items-center gap-2 text-lg font-semibold">
          <History className="size-5" />
          {t("title")}
        </h2>
        <div role="radiogroup" aria-label={t("filter")} className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {HISTORY_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                filter === value && "bg-background text-foreground shadow-sm",
              )}
            >
              {t(`filters.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : null}

      <ol className="flex flex-col gap-3" data-testid="order-history">
        {shown.map((entry) => {
          const Icon = KIND_ICON[entry.kind];
          return (
            <li key={entry.id} data-kind={entry.kind} className="flex gap-3 rounded-lg border bg-card p-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{t(`kinds.${entry.kind}`)}</span>
                  {/* <bdi>: a Latin name next to a date stays readable in Arabic. */}
                  <span className="text-muted-foreground">
                    <bdi>{entry.by ?? t("system")}</bdi> ·{" "}
                    <bdi>{format.dateTime(new Date(entry.at), { dateStyle: "medium", timeStyle: "short", timeZone: BUSINESS_TIME_ZONE })}</bdi>
                  </span>
                </p>

                {entry.duplicatedFrom ? <p className="text-sm">{t("duplicatedFrom", { number: entry.duplicatedFrom })}</p> : null}

                {entry.issue ? (
                  <p className="text-sm">
                    {t("issued", {
                      number: entry.issue.number,
                      revision: `REV${entry.issue.revision}`,
                      language: languages.has(entry.issue.language) ? languages(entry.issue.language) : entry.issue.language,
                    })}
                  </p>
                ) : null}
                {entry.issue && entry.issue.document === "proforma" && downloads ? (
                  <IssueDownloads orderId={orderId} issueId={entry.id} defaultLanguage={toDocumentLanguage(entry.issue.language)} />
                ) : null}

                {entry.status ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      {entry.status.from ? <StatusBadge status={entry.status.from} label={statuses(entry.status.from)} /> : null}
                      <ArrowRight className="size-4 rtl:rotate-180" aria-label={t("to")} />
                      <StatusBadge status={entry.status.to} label={statuses(entry.status.to)} />
                    </p>
                    {entry.status.reason ? <p>{t("reason", { reason: entry.status.reason })}</p> : null}
                    {entry.status.note ? <p className="text-muted-foreground">{t("note", { note: entry.status.note })}</p> : null}
                  </div>
                ) : null}

                {entry.header.length > 0 ? (
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
                    {entry.header.map((change) => (
                      <div key={change.field} className="contents">
                        <dt className="text-muted-foreground">{fieldName(change.field)}</dt>
                        <dd className="min-w-0 break-words">
                          {entry.kind === "created" ? (
                            show(change.after, change.field)
                          ) : (
                            <>
                              <del className="text-muted-foreground">{show(change.before, change.field)}</del>{" "}
                              <ArrowRight className="inline size-3.5 rtl:rotate-180" aria-label={t("to")} />{" "}
                              <ins className="no-underline">{show(change.after, change.field)}</ins>
                            </>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                {entry.lines.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {entry.lines.map((change, index) => (
                      <li key={`${change.change}-${change.label}-${index}`} data-change={change.change} className="min-w-0 break-words">
                        <span
                          className={cn(
                            "me-2 inline-flex h-5 items-center rounded px-1.5 text-xs font-medium",
                            change.change === "added" && "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
                            change.change === "removed" && "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
                            change.change === "changed" && "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
                            change.change === "reordered" && "bg-muted text-muted-foreground",
                          )}
                        >
                          {t(`lineChanges.${change.change}`, { line: change.label })}
                        </span>
                        {change.change === "added" ? show(change.after) : null}
                        {change.change === "removed" ? <del className="text-muted-foreground">{show(change.before)}</del> : null}
                        {change.change === "changed" || change.change === "reordered" ? (
                          <>
                            <del className="text-muted-foreground">{show(change.before)}</del>{" "}
                            <ArrowRight className="inline size-3.5 rtl:rotate-180" aria-label={t("to")} />{" "}
                            <ins className="no-underline">{show(change.after)}</ins>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
