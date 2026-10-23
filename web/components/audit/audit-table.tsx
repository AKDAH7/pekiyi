"use client";

import { Fragment, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { diffSnapshots } from "@/lib/audit/sanitize";
import { isRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type AuditRow = {
  id: string;
  /** Already formatted on the server, in the viewer's locale. */
  time: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string;
  entityLabel: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

const COLUMN_COUNT = 5;

function useValueFormatter() {
  const common = useTranslations("common");
  const roles = useTranslations("roles");
  const languages = useTranslations("languages");

  return (field: string, value: unknown): string => {
    if (value === undefined || value === null || value === "") return "—";
    if (typeof value === "boolean") return common(value ? "yes" : "no");
    if (field === "role" && isRole(value)) return roles(value);
    if (field === "preferredLocale" && typeof value === "string" && languages.has(value)) {
      return languages(value);
    }
    return typeof value === "string" ? value : JSON.stringify(value);
  };
}

function AuditDiff({ row }: { row: AuditRow }) {
  const t = useTranslations("audit");
  const formatValue = useValueFormatter();
  const diff = diffSnapshots(row.before, row.after);

  if (diff.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noDetails")}</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-muted-foreground">
          <th className="py-1 pe-4 text-start font-medium">{t("field")}</th>
          <th className="py-1 pe-4 text-start font-medium">{t("before")}</th>
          <th className="w-6" aria-hidden />
          <th className="py-1 text-start font-medium">{t("after")}</th>
        </tr>
      </thead>
      <tbody>
        {diff.map((item) => (
          <tr key={item.field} className={cn(!item.changed && "text-muted-foreground")}>
            <td className="py-1 pe-4 font-medium">
              {t.has(`fields.${item.field}`) ? t(`fields.${item.field}`) : item.field}
            </td>
            <td className={cn("py-1 pe-4", item.changed && "text-destructive line-through")}>
              {formatValue(item.field, item.before)}
            </td>
            <td aria-hidden className="text-muted-foreground">
              {/* Points from "before" to "after" in either reading direction. */}
              <ArrowRight className="size-3.5 rtl:hidden" />
              <ArrowLeft className="hidden size-3.5 rtl:block" />
            </td>
            <td
              className={cn(
                "py-1",
                item.changed && "font-medium text-emerald-700 dark:text-emerald-400",
              )}
            >
              {formatValue(item.field, item.after)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const t = useTranslations("audit");
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-0" />
            <TableHead>{t("columns.time")}</TableHead>
            <TableHead>{t("columns.user")}</TableHead>
            <TableHead>{t("columns.action")}</TableHead>
            <TableHead>{t("columns.record")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center text-muted-foreground">
                {t("empty")}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const isOpen = expanded === row.id;
              const detailsId = `audit-details-${row.id}`;
              return (
                <Fragment key={row.id}>
                  <TableRow
                    className="cursor-pointer"
                    data-state={isOpen ? "selected" : undefined}
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                  >
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-expanded={isOpen}
                        aria-controls={detailsId}
                        aria-label={t(isOpen ? "hideDetails" : "showDetails")}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpanded(isOpen ? null : row.id);
                        }}
                      >
                        <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} />
                      </Button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{row.time}</TableCell>
                    <TableCell>{row.actorName ?? t("system")}</TableCell>
                    <TableCell>
                      {t.has(`actions.${row.action}`) ? t(`actions.${row.action}`) : row.action}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {t.has(`entities.${row.entity}`) ? t(`entities.${row.entity}`) : row.entity}
                        {": "}
                      </span>
                      {row.entityLabel ?? row.entityId}
                    </TableCell>
                  </TableRow>
                  {isOpen ? (
                    <TableRow id={detailsId} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={COLUMN_COUNT - 1} className="whitespace-normal">
                        <AuditDiff row={row} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
