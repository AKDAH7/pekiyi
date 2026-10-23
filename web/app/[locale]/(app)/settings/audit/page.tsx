import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { listAuditFilterOptions, listAuditLog } from "@/lib/audit/queries";
import { requirePermission } from "@/lib/auth/session";
import { auditSearchSchema } from "@/lib/validation/users";
import { AuditTable, type AuditRow } from "@/components/audit/audit-table";
import { OptionSelect } from "@/components/option-select";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Select value meaning "no filter" (Base UI treats "" as no selection). */
const ALL = "all";

export default async function AuditLogPage({ searchParams }: Props) {
  const params = auditSearchSchema.parse(await searchParams);
  await requirePermission("auditLog", "read");

  const userId = params.user && params.user !== ALL ? params.user : undefined;
  const entity = params.entity && params.entity !== ALL ? params.entity : undefined;
  const page = params.page ?? 1;

  const [{ rows, pageCount }, options, t, format] = await Promise.all([
    listAuditLog({ page, userId, entity }),
    listAuditFilterOptions(),
    getTranslations("audit"),
    getFormatter(),
  ]);

  const tableRows: AuditRow[] = rows.map(({ createdAt, ...row }) => ({
    ...row,
    time: format.dateTime(createdAt, { dateStyle: "medium", timeStyle: "medium" }),
  }));

  const query = (nextPage: number) => ({
    ...(userId ? { user: userId } : {}),
    ...(entity ? { entity } : {}),
    page: String(nextPage),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />

      <form className="flex flex-wrap items-end gap-3">
        <div className="flex w-56 flex-col gap-2">
          <Label htmlFor="filter-user">{t("filterUser")}</Label>
          <OptionSelect
            id="filter-user"
            name="user"
            defaultValue={userId ?? ALL}
            options={[
              { value: ALL, label: t("allUsers") },
              ...options.users.map((user) => ({ value: user.id, label: user.name })),
            ]}
          />
        </div>
        <div className="flex w-56 flex-col gap-2">
          <Label htmlFor="filter-entity">{t("filterEntity")}</Label>
          <OptionSelect
            id="filter-entity"
            name="entity"
            defaultValue={entity ?? ALL}
            options={[
              { value: ALL, label: t("allEntities") },
              ...options.entities.map((value) => ({
                value,
                label: t.has(`entities.${value}`) ? t(`entities.${value}`) : value,
              })),
            ]}
          />
        </div>
        <Button type="submit">{t("apply")}</Button>
        {userId || entity ? (
          <Link href="/settings/audit" className={buttonVariants({ variant: "ghost" })}>
            {t("clear")}
          </Link>
        ) : null}
      </form>

      <AuditTable rows={tableRows} />

      <nav className="flex items-center justify-between gap-2" aria-label={t("pageOf", { page, pageCount })}>
        <p className="text-sm text-muted-foreground">{t("pageOf", { page, pageCount })}</p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={{ pathname: "/settings/audit", query: query(page - 1) }}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("previous")}
            </Link>
          ) : (
            <Button variant="outline" disabled>
              {t("previous")}
            </Button>
          )}
          {page < pageCount ? (
            <Link
              href={{ pathname: "/settings/audit", query: query(page + 1) }}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("next")}
            </Link>
          ) : (
            <Button variant="outline" disabled>
              {t("next")}
            </Button>
          )}
        </div>
      </nav>
    </div>
  );
}
