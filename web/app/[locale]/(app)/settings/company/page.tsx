import { getTranslations } from "next-intl/server";

import { requirePermission } from "@/lib/auth/session";
import { getCompanySettings } from "@/lib/settings/queries";
import { fileUrl } from "@/lib/storage/urls";
import { PageHeader } from "@/components/page-header";
import { CompanyForm } from "@/components/settings/company-form";

export default async function CompanySettingsPage() {
  await requirePermission("settings", "read");
  const [settings, t] = await Promise.all([getCompanySettings(), getTranslations("company")]);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {settings ? (
        <CompanyForm
          values={{
            version: settings.version,
            legalName: settings.legalName,
            brandName: settings.brandName,
            address: settings.address,
            phone: settings.phone,
            email: settings.email,
            website: settings.website,
            hsCode: settings.hsCode,
            orderCode: settings.orderCode,
            defaultDeliveryTime: settings.defaultDeliveryTime,
            defaultPaymentTerms: settings.defaultPaymentTerms,
            logoUrl: settings.logoPath ? fileUrl(settings.logoPath, { thumb: true }) : null,
          }}
        />
      ) : (
        // The row is created by `pnpm db:seed`.
        <p className="text-muted-foreground">{t("notSeeded")}</p>
      )}
    </div>
  );
}
