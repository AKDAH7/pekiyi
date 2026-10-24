import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { newOrderState } from "@/lib/orders/editor";
import { defaultTemplateColumns, getEditorOptions, listColumnTemplates, localizeEditorOptions } from "@/lib/orders/queries";
import { getCompanySettings, getLatestRates } from "@/lib/settings/queries";
import { newOrderSearchSchema } from "@/lib/validation/orders";
import { MissingRateBanner } from "@/components/missing-rate-banner";
import { NewOrderPicker } from "@/components/orders/new-order-picker";
import { OrderEditor } from "@/components/orders/order-editor";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewOrderPage({ searchParams }: Props) {
  const { customer: customerId } = newOrderSearchSchema.parse(await searchParams);
  const me = await requirePermission("orders", "create");

  const [data, latest, company, t, locale] = await Promise.all([
    getEditorOptions(),
    getLatestRates(),
    getCompanySettings(),
    getTranslations("orders"),
    getLocale(),
  ]);
  const customer = customerId ? data.customers.find((entry) => entry.id === customerId) : undefined;

  if (!customer) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("new.title")} description={t("new.description")} />
        <NewOrderPicker
          customers={data.customers
            .filter((entry) => entry.active)
            .map(({ id, companyName, country }) => ({ id, companyName, country }))}
        />
      </div>
    );
  }

  const [templates, customColumns] = await Promise.all([listColumnTemplates(customer.id), defaultTemplateColumns(customer.id)]);
  const initial = newOrderState({ customer, company, rates: latest.rates, today: latest.today, customColumns });
  return (
    <div className="flex flex-col gap-4">
      <MissingRateBanner role={me.role} latest={latest} />
      <OrderEditor
        order={null}
        initial={initial}
        options={localizeEditorOptions(data, locale)}
        rates={latest.rates}
        columnTemplates={templates}
        permissions={{
          editable: true,
          canWritePrices: can(me.role, "orderPrices", "update"),
          canSeePrices: can(me.role, "prices", "read"),
        }}
        title={
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t("new.title")}</h1>
            <p className="text-muted-foreground">
              {customer.companyName} · {t("new.numberPending")}
            </p>
          </div>
        }
        actions={
          <Link href="/orders" className={buttonVariants({ variant: "ghost" })}>
            {t("editor.backToList")}
          </Link>
        }
      />
    </div>
  );
}
