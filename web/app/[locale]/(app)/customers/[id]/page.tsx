import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ImageIcon, PackageOpen, Pencil } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { getCustomer, listProductCodes, productCodeOptions } from "@/lib/customers/queries";
import { countryName } from "@/lib/domain/countries";
import { formatPhone, whatsappUrl } from "@/lib/domain/phone";
import { pickLocalized } from "@/lib/i18n/localized";
import { fileUrl } from "@/lib/storage/urls";
import { customerTabSchema } from "@/lib/validation/customers";
import { cn } from "@/lib/utils";
import { CopyableValue, CopyButton, WhatsAppButton } from "@/components/customers/contact";
import { CountryLabel } from "@/components/customers/country";
import { CustomerActions } from "@/components/customers/customer-actions";
import { ProductCodes } from "@/components/customers/product-codes";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TABS = ["info", "orders", "codes"] as const;

function Fields({ items }: { items: [label: string, value: React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="min-w-0 text-sm break-words">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function CustomerPage({ params, searchParams }: Props) {
  const { id } = await params;
  const me = await requirePermission("customers", "read");
  if (!z.uuid().safeParse(id).success) notFound();
  const tab = customerTabSchema.parse((await searchParams).tab);

  const [detail, t, common, languages, locale] = await Promise.all([
    getCustomer(id),
    getTranslations("customers"),
    getTranslations("common"),
    getTranslations("languages"),
    getLocale(),
  ]);
  if (!detail) notFound();
  const { customer, orderCount, labelTemplateName } = detail;
  const canEdit = can(me.role, "customers", "update");
  const country = countryName(customer.country, locale);
  const whatsapp = customer.whatsapp ? whatsappUrl(customer.whatsapp) : null;

  const [codes, options] = tab === "codes" ? await Promise.all([listProductCodes(id), productCodeOptions()]) : [[], null];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/customers" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="rtl:hidden" />
          <ArrowRight className="hidden rtl:block" />
          {t("backToList")}
        </Link>
      </div>
      <PageHeader
        title={customer.companyName}
        description={[country, customer.city].filter(Boolean).join(", ")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {customer.active ? null : <Badge variant="destructive">{common("inactive")}</Badge>}
            {whatsapp ? <WhatsAppButton url={whatsapp} /> : null}
            {canEdit ? (
              <>
                <Link href={`/customers/${id}/edit`} className={buttonVariants()}>
                  <Pencil />
                  {common("edit")}
                </Link>
                <CustomerActions
                  customer={{
                    id,
                    version: customer.version,
                    companyName: customer.companyName,
                    active: customer.active,
                  }}
                  canDelete={can(me.role, "customers", "delete") && orderCount === 0}
                />
              </>
            ) : null}
          </div>
        }
      />

      <nav aria-label={t("tabs.label")} className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((key) => (
          <Link
            key={key}
            href={key === "info" ? `/customers/${id}` : `/customers/${id}?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              tab === key && "border-primary text-foreground",
            )}
          >
            {t(`tabs.${key}`)}
          </Link>
        ))}
      </nav>

      {tab === "info" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("sections.company")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Fields
                items={[
                  [t("fields.contactPerson"), customer.contactPerson],
                  [
                    t("fields.phone"),
                    customer.phone ? (
                      <CopyableValue
                        value={customer.phone}
                        display={formatPhone(customer.phone)}
                        href={`tel:${customer.phone}`}
                        label={t("fields.phone")}
                      />
                    ) : null,
                  ],
                  [
                    t("fields.whatsapp"),
                    customer.whatsapp ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <CopyableValue
                          value={customer.whatsapp}
                          display={formatPhone(customer.whatsapp)}
                          label={t("fields.whatsapp")}
                        />
                        {whatsapp ? <WhatsAppButton url={whatsapp} compact /> : null}
                      </span>
                    ) : null,
                  ],
                  [
                    t("fields.email"),
                    customer.email ? (
                      <CopyableValue value={customer.email} href={`mailto:${customer.email}`} label={t("fields.email")} />
                    ) : null,
                  ],
                  [
                    t("fields.website"),
                    customer.website ? (
                      <a
                        href={customer.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        className="underline-offset-4 hover:underline"
                      >
                        {customer.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : null,
                  ],
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("sections.address")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Fields
                items={[
                  [t("fields.country"), <CountryLabel key="country" code={customer.country} name={country} />],
                  [t("fields.city"), customer.city],
                  [
                    t("fields.address"),
                    customer.address ? (
                      <span className="inline-flex items-start gap-1">
                        <span className="whitespace-pre-line">{customer.address}</span>
                        <CopyButton value={customer.address} label={t("fields.address")} />
                      </span>
                    ) : null,
                  ],
                  ...Object.entries(customer.taxIds ?? {}).map(
                    ([key, value]): [string, React.ReactNode] => [key, <CopyableValue key={key} value={value} label={key} />],
                  ),
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("sections.documents")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Fields
                items={[
                  [t("fields.docLanguage"), languages(customer.docLanguage)],
                  [t("fields.defaultCurrency"), customer.defaultCurrency],
                  [t("fields.secondaryCurrency"), customer.secondaryCurrency],
                  [t("fields.defaultIncoterm"), customer.defaultIncoterm],
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("sections.labels")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Fields
                items={[
                  [t("fields.labelBranding"), t(`branding.${customer.labelBranding}`)],
                  [t("fields.defaultLabelTemplate"), labelTemplateName ? pickLocalized(labelTemplateName, locale) : null],
                  [
                    t("fields.logo"),
                    <div
                      key="logo"
                      className="flex size-16 items-center justify-center overflow-hidden rounded-md border bg-muted"
                    >
                      {customer.logoPath ? (
                        <Image
                          src={fileUrl(customer.logoPath, { thumb: true })}
                          alt={t("fields.logo")}
                          width={64}
                          height={64}
                          unoptimized
                          className="size-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                      )}
                    </div>,
                  ],
                ]}
              />
            </CardContent>
          </Card>

          {customer.notes ? (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("sections.notes")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line">{customer.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "orders" ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-12 text-center">
          <PackageOpen className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">{t("orders.emptyTitle")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t("orders.emptyDescription")}</p>
          {orderCount > 0 ? (
            <p className="text-sm text-muted-foreground">{t("orders.existing", { count: orderCount })}</p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            {orderCount > 0 ? (
              <Link href={`/orders?customer=${id}`} className={buttonVariants({ variant: "outline" })}>
                {t("orders.showOrders")}
              </Link>
            ) : null}
            {can(me.role, "orders", "create") && customer.active ? (
              <Link href={`/orders/new?customer=${id}`} className={buttonVariants()}>
                {t("orders.newOrder")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "codes" && options ? (
        <ProductCodes
          customerId={id}
          canEdit={canEdit}
          codes={codes.map((code) => ({
            id: code.id,
            version: code.version,
            modelId: code.modelId,
            modelLabel: code.modelCode,
            pieceTypeId: code.pieceTypeId,
            pieceTypeLabel: code.pieceTypeName ? pickLocalized(code.pieceTypeName, locale) : null,
            fabricId: code.fabricId,
            fabricLabel: code.fabricBrand ? `${code.fabricBrand} ${code.fabricCode}` : null,
            barcode: code.barcode,
            stockCode: code.stockCode,
            customerProductName: code.customerProductName,
            brandText: code.brandText,
          }))}
          options={{
            models: options.models
              .filter((model) => model.active || codes.some((code) => code.modelId === model.id))
              .map((model) => {
                const name = pickLocalized(model.name, locale);
                return {
                  value: model.id,
                  label: name && name !== model.code ? `${model.code} · ${name}` : model.code,
                };
              }),
            pieceTypes: options.pieceTypes.map((type) => ({
              value: type.id,
              label: pickLocalized(type.name, locale) || type.code,
            })),
            fabrics: options.fabrics
              .filter((fabric) => fabric.active || codes.some((code) => code.fabricId === fabric.id))
              .map((fabric) => ({ value: fabric.id, label: `${fabric.brand} ${fabric.code}` })),
          }}
        />
      ) : null}
    </div>
  );
}
