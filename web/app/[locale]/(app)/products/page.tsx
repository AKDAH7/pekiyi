import Image from "next/image";
import { ImageIcon, Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listModels, listPieceTypes } from "@/lib/catalog/queries";
import { pickLocalized } from "@/lib/i18n/localized";
import { getLatestRates } from "@/lib/settings/queries";
import { fileUrl } from "@/lib/storage/urls";
import { modelsSearchSchema } from "@/lib/validation/catalog";
import { CatalogTabs } from "@/components/catalog/catalog-tabs";
import { CreateModelButton } from "@/components/catalog/create-model-button";
import { MissingRateBanner } from "@/components/missing-rate-banner";
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

export default async function ProductsPage({ searchParams }: Props) {
  const filters = modelsSearchSchema.parse(await searchParams);
  const me = await requirePermission("catalog", "read");

  const [items, pieceTypes, latest, t, common, locale] = await Promise.all([
    listModels(filters),
    listPieceTypes(),
    getLatestRates(),
    getTranslations("catalog"),
    getTranslations("common"),
    getLocale(),
  ]);
  const shortName = new Map(
    pieceTypes.map((type) => [type.code, pickLocalized(type.shortName ?? type.name, locale) || type.code]),
  );
  const filtered = Boolean(filters.q || (filters.status && filters.status !== "all") || (filters.missing && filters.missing !== "all"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={can(me.role, "catalog", "create") ? <CreateModelButton /> : null}
      />
      <CatalogTabs />
      <MissingRateBanner role={me.role} latest={latest} />

      <form role="search" className="flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-2 sm:w-64">
          <Label htmlFor="models-q">{common("search")}</Label>
          <Input id="models-q" name="q" type="search" defaultValue={filters.q} placeholder={t("searchPlaceholder")} />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-40">
          <Label htmlFor="models-status">{common("status")}</Label>
          <OptionSelect
            id="models-status"
            name="status"
            defaultValue={filters.status ?? "all"}
            options={[
              { value: "all", label: common("all") },
              { value: "active", label: common("active") },
              { value: "inactive", label: common("inactive") },
            ]}
          />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-48">
          <Label htmlFor="models-missing">{t("missingFilter")}</Label>
          <OptionSelect
            id="models-missing"
            name="missing"
            defaultValue={filters.missing ?? "all"}
            options={[
              { value: "all", label: common("all") },
              { value: "any", label: t("missing.any") },
              { value: "prices", label: t("missing.prices") },
              { value: "cbm", label: t("missing.cbm") },
            ]}
          />
        </div>
        <Button type="submit" variant="outline">
          <Search />
          {common("apply")}
        </Button>
        {filtered ? (
          <Link href="/products" className={buttonVariants({ variant: "ghost" })}>
            {common("clear")}
          </Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-0">
                <span className="sr-only">{t("fields.photo")}</span>
              </TableHead>
              <TableHead>{t("fields.code")}</TableHead>
              <TableHead>{t("fields.name")}</TableHead>
              <TableHead>{t("fields.isSofabed")}</TableHead>
              <TableHead>{common("status")}</TableHead>
              <TableHead>{t("pricedPieces")}</TableHead>
              <TableHead>{t("dataCheck")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((model) => (
                <TableRow key={model.id} className={model.active ? undefined : "text-muted-foreground"}>
                  <TableCell>
                    <div className="flex size-10 items-center justify-center overflow-hidden rounded-md border bg-muted">
                      {model.mainPhotoPath ? (
                        <Image
                          src={fileUrl(model.mainPhotoPath, { thumb: true })}
                          alt=""
                          width={40}
                          height={40}
                          unoptimized
                          className="size-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/products/models/${model.id}`} className="underline-offset-4 hover:underline">
                      {model.code}
                    </Link>
                  </TableCell>
                  <TableCell>{pickLocalized(model.name, locale)}</TableCell>
                  <TableCell>{common(model.isSofabed ? "yes" : "no")}</TableCell>
                  <TableCell>
                    <Badge variant={model.active ? "secondary" : "destructive"}>
                      {common(model.active ? "active" : "inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {model.pricedPieceTypes.length === 0
                        ? "—"
                        : model.pricedPieceTypes.map((code) => (
                            <Badge key={code} variant="outline">
                              {shortName.get(code) ?? code}
                            </Badge>
                          ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {model.missingPrices ? (
                        <Badge variant="destructive">{t("missing.noPrices")}</Badge>
                      ) : null}
                      {model.missingCbm ? <Badge variant="destructive">{t("missing.noCbm")}</Badge> : null}
                      {!model.missingPrices && !model.missingCbm ? (
                        <span className="text-muted-foreground">{t("complete")}</span>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
