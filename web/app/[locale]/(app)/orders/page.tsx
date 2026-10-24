import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { countryName } from "@/lib/domain/countries";
import { formatDecimal, numberLocale } from "@/lib/format/number";
import { ORDER_STATUS_LIST } from "@/lib/orders/constants";
import { listOrderCustomers, listOrders } from "@/lib/orders/queries";
import { ordersSearchSchema, type OrderFilters } from "@/lib/validation/orders";
import { CountryLabel } from "@/components/customers/country";
import { OptionSelect } from "@/components/option-select";
import { StatusBadge } from "@/components/orders/status-badge";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ALL = "all";

function pageHref(filters: OrderFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.customer) params.set("customer", filters.customer);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/orders?${query}` : "/orders";
}

export default async function OrdersPage({ searchParams }: Props) {
  const filters = ordersSearchSchema.parse(await searchParams);
  const me = await requirePermission("orders", "read");

  const [{ rows, total, pageCount }, customers, t, common, format, locale] = await Promise.all([
    listOrders(filters),
    listOrderCustomers(),
    getTranslations("orders"),
    getTranslations("common"),
    getFormatter(),
    getLocale(),
  ]);
  const canSeePrices = can(me.role, "prices", "read");
  const integer = new Intl.NumberFormat(numberLocale(locale));
  const filtered = Boolean(filters.q || filters.status || filters.customer || filters.from || filters.to);
  const page = Math.min(filters.page, pageCount);
  const columnCount = canSeePrices ? 7 : 6;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          can(me.role, "orders", "create") ? (
            <Link href="/orders/new" className={buttonVariants()}>
              <Plus />
              {t("newOrder")}
            </Link>
          ) : null
        }
      />

      <form role="search" className="flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-2 sm:w-64">
          <Label htmlFor="orders-q">{common("search")}</Label>
          <Input id="orders-q" name="q" type="search" defaultValue={filters.q} placeholder={t("searchPlaceholder")} />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-44">
          <Label htmlFor="orders-status">{common("status")}</Label>
          <OptionSelect
            id="orders-status"
            name="status"
            defaultValue={filters.status ?? ALL}
            options={[
              { value: ALL, label: t("allStatuses") },
              ...ORDER_STATUS_LIST.map((status) => ({ value: status, label: t(`statuses.${status}`) })),
            ]}
          />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-56">
          <Label htmlFor="orders-customer">{t("columns.customer")}</Label>
          <OptionSelect
            id="orders-customer"
            name="customer"
            defaultValue={filters.customer ?? ALL}
            options={[
              { value: ALL, label: t("allCustomers") },
              ...customers.map((customer) => ({ value: customer.id, label: customer.companyName })),
            ]}
          />
        </div>
        <div className="flex w-[calc(50%-0.375rem)] flex-col gap-2 sm:w-40">
          <Label htmlFor="orders-from">{t("from")}</Label>
          <Input id="orders-from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div className="flex w-[calc(50%-0.375rem)] flex-col gap-2 sm:w-40">
          <Label htmlFor="orders-to">{t("to")}</Label>
          <Input id="orders-to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <Button type="submit" variant="outline">
          <Search />
          {common("apply")}
        </Button>
        {filtered ? (
          <Link href="/orders" className={buttonVariants({ variant: "ghost" })}>
            {common("clear")}
          </Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.number")}</TableHead>
              <TableHead>{t("columns.customer")}</TableHead>
              <TableHead>{t("columns.date")}</TableHead>
              <TableHead>{common("status")}</TableHead>
              <TableHead className="text-end">{t("columns.setsPieces")}</TableHead>
              <TableHead className="text-end">{t("columns.cbm")}</TableHead>
              {canSeePrices ? <TableHead className="text-end">{t("columns.total")}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">
                    <Link href={`/orders/${order.id}`} dir="ltr" className="underline-offset-4 hover:underline">
                      {order.number}
                    </Link>
                    {order.revision > 0 ? (
                      <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {t("revision", { revision: order.revision })}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="inline-flex flex-col">
                      <span>{order.companyName}</span>
                      <span className="text-xs text-muted-foreground">
                        <CountryLabel code={order.country} name={countryName(order.country, locale)} />
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {format.dateTime(new Date(`${order.orderDate}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} label={t(`statuses.${order.status}`)} />
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {integer.format(order.sets)} / {integer.format(order.pieces)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums" dir="ltr">
                    {formatDecimal(order.totalCbm, locale, { minimumFractionDigits: 3 })}
                  </TableCell>
                  {canSeePrices ? (
                    <TableCell className="text-end font-medium tabular-nums" dir="ltr">
                      {formatDecimal(order.total, locale)} {order.currency}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <nav aria-label={t("pagination.label")} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{t("pagination.summary", { page, pages: pageCount, count: total })}</span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={pageHref(filters, page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ChevronLeft className="rtl:rotate-180" />
              {t("pagination.previous")}
            </Link>
          ) : null}
          {page < pageCount ? (
            <Link href={pageHref(filters, page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("pagination.next")}
              <ChevronRight className="rtl:rotate-180" />
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
