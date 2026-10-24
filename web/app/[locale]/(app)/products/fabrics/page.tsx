import { Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listFabrics } from "@/lib/catalog/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { fabricsSearchSchema } from "@/lib/validation/catalog";
import { CatalogTabs } from "@/components/catalog/catalog-tabs";
import { CreateFabricButton, FabricActions } from "@/components/catalog/fabric-dialogs";
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

export default async function FabricsPage({ searchParams }: Props) {
  const filters = fabricsSearchSchema.parse(await searchParams);
  const me = await requirePermission("catalog", "read");

  const [items, t, catalog, common, locale] = await Promise.all([
    listFabrics(filters),
    getTranslations("fabrics"),
    getTranslations("catalog"),
    getTranslations("common"),
    getLocale(),
  ]);
  const canEdit = can(me.role, "catalog", "update");
  const filtered = Boolean(filters.q || (filters.status && filters.status !== "all"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={catalog("title")}
        description={t("description")}
        actions={can(me.role, "catalog", "create") ? <CreateFabricButton /> : null}
      />
      <CatalogTabs />

      <form role="search" className="flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-2 sm:w-64">
          <Label htmlFor="fabrics-q">{common("search")}</Label>
          <Input id="fabrics-q" name="q" type="search" defaultValue={filters.q} placeholder={t("searchPlaceholder")} />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-40">
          <Label htmlFor="fabrics-status">{common("status")}</Label>
          <OptionSelect
            id="fabrics-status"
            name="status"
            defaultValue={filters.status ?? "all"}
            options={[
              { value: "all", label: common("all") },
              { value: "active", label: common("active") },
              { value: "inactive", label: common("inactive") },
            ]}
          />
        </div>
        <Button type="submit" variant="outline">
          <Search />
          {common("apply")}
        </Button>
        {filtered ? (
          <Link href="/products/fabrics" className={buttonVariants({ variant: "ghost" })}>
            {common("clear")}
          </Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.brand")}</TableHead>
              <TableHead>{t("fields.code")}</TableHead>
              <TableHead>{t("fields.colorKey")}</TableHead>
              <TableHead>{t("fields.colorName")}</TableHead>
              <TableHead>{common("status")}</TableHead>
              {canEdit ? (
                <TableHead className="w-0">
                  <span className="sr-only">{common("actions")}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((fabric) => (
                <TableRow key={fabric.id} className={fabric.active ? undefined : "text-muted-foreground"}>
                  <TableCell className="font-medium">{fabric.brand}</TableCell>
                  <TableCell>{fabric.code}</TableCell>
                  <TableCell>{fabric.colorKey ?? "—"}</TableCell>
                  <TableCell>{pickLocalized(fabric.colorName, locale) || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={fabric.active ? "secondary" : "destructive"}>
                      {common(fabric.active ? "active" : "inactive")}
                    </Badge>
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <FabricActions
                        fabric={{
                          id: fabric.id,
                          version: fabric.version,
                          brand: fabric.brand,
                          code: fabric.code,
                          colorKey: fabric.colorKey,
                          colorName: fabric.colorName,
                          active: fabric.active,
                        }}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
