import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listCustomerCountries, listCustomers } from "@/lib/customers/queries";
import { countryName } from "@/lib/domain/countries";
import { formatPhone, whatsappUrl } from "@/lib/domain/phone";
import { customersSearchSchema, type CustomerFilters } from "@/lib/validation/customers";
import { WhatsAppButton } from "@/components/customers/contact";
import { CountryLabel } from "@/components/customers/country";
import { OptionSelect } from "@/components/option-select";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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

function pageHref(filters: CustomerFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.country) params.set("country", filters.country);
  if (filters.status !== "active") params.set("status", filters.status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}

export default async function CustomersPage({ searchParams }: Props) {
  const filters = customersSearchSchema.parse(await searchParams);
  const me = await requirePermission("customers", "read");

  const [{ rows, total, pageCount }, countries, t, common, languages, locale] = await Promise.all([
    listCustomers(filters),
    listCustomerCountries(),
    getTranslations("customers"),
    getTranslations("common"),
    getTranslations("languages"),
    getLocale(),
  ]);
  const collator = new Intl.Collator(locale);
  const countryChoices = countries
    .map((code) => ({ value: code, label: countryName(code, locale) }))
    .sort((a, b) => collator.compare(a.label, b.label));
  const filtered = Boolean(filters.q || filters.country || filters.status !== "active");
  const page = Math.min(filters.page, pageCount);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          can(me.role, "customers", "create") ? (
            <Link href="/customers/new" className={buttonVariants()}>
              <Plus />
              {t("new")}
            </Link>
          ) : null
        }
      />

      <form role="search" className="flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-2 sm:w-72">
          <Label htmlFor="customers-q">{common("search")}</Label>
          <Input
            id="customers-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-52">
          <Label htmlFor="customers-country">{t("fields.country")}</Label>
          <OptionSelect
            id="customers-country"
            name="country"
            defaultValue={filters.country ?? "all"}
            options={[{ value: "all", label: t("allCountries") }, ...countryChoices]}
          />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-40">
          <Label htmlFor="customers-status">{common("status")}</Label>
          <OptionSelect
            id="customers-status"
            name="status"
            defaultValue={filters.status}
            options={[
              { value: "active", label: common("active") },
              { value: "inactive", label: common("inactive") },
              { value: "all", label: common("all") },
            ]}
          />
        </div>
        <Button type="submit" variant="outline">
          <Search />
          {common("apply")}
        </Button>
        {filtered ? (
          <Link href="/customers" className={buttonVariants({ variant: "ghost" })}>
            {common("clear")}
          </Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.company")}</TableHead>
              <TableHead>{t("columns.country")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("columns.city")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("columns.contact")}</TableHead>
              <TableHead>{t("columns.phone")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("columns.docLanguage")}</TableHead>
              <TableHead className="text-end">{t("columns.orders")}</TableHead>
              <TableHead>{common("status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((customer) => {
                const whatsapp = customer.whatsapp ? whatsappUrl(customer.whatsapp) : null;
                return (
                  <TableRow key={customer.id} className={customer.active ? undefined : "text-muted-foreground"}>
                    <TableCell className="font-medium whitespace-normal">
                      <Link href={`/customers/${customer.id}`} className="underline-offset-4 hover:underline">
                        {customer.companyName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CountryLabel code={customer.country} name={countryName(customer.country, locale)} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{customer.city ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{customer.contactPerson ?? "—"}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        {customer.phone ? (
                          <a href={`tel:${customer.phone}`} dir="ltr" className="underline-offset-4 hover:underline">
                            {formatPhone(customer.phone)}
                          </a>
                        ) : (
                          "—"
                        )}
                        {whatsapp ? <WhatsAppButton url={whatsapp} compact /> : null}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{languages(customer.docLanguage)}</TableCell>
                    <TableCell className="text-end tabular-nums">{customer.orderCount}</TableCell>
                    <TableCell>
                      <Badge variant={customer.active ? "secondary" : "destructive"}>
                        {common(customer.active ? "active" : "inactive")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <nav aria-label={t("pagination.label")} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {t("pagination.summary", { page, pages: pageCount, count: total })}
        </span>
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
