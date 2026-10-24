import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/session";
import { customerFormOptions } from "@/lib/customers/form-options";
import { getCustomer } from "@/lib/customers/queries";
import { formatPhone } from "@/lib/domain/phone";
import { fileUrl } from "@/lib/storage/urls";
import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";

type Props = { params: Promise<{ id: string }> };

export default async function EditCustomerPage({ params }: Props) {
  const { id } = await params;
  await requirePermission("customers", "update");
  if (!z.uuid().safeParse(id).success) notFound();

  const locale = await getLocale();
  const [detail, t] = await Promise.all([getCustomer(id), getTranslations("customers")]);
  if (!detail) notFound();
  const { customer } = detail;
  const options = await customerFormOptions(locale, customer.defaultLabelTemplateId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/customers/${id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="rtl:hidden" />
          <ArrowRight className="hidden rtl:block" />
          {customer.companyName}
        </Link>
      </div>
      <PageHeader title={t("editTitle", { name: customer.companyName })} />
      <CustomerForm
        mode="edit"
        {...options}
        customer={{
          id: customer.id,
          version: customer.version,
          companyName: customer.companyName,
          contactPerson: customer.contactPerson,
          country: customer.country,
          city: customer.city,
          address: customer.address,
          phone: customer.phone ? formatPhone(customer.phone) : null,
          whatsapp: customer.whatsapp ? formatPhone(customer.whatsapp) : null,
          email: customer.email,
          website: customer.website,
          taxIds: customer.taxIds,
          notes: customer.notes,
          docLanguage: customer.docLanguage,
          defaultCurrency: customer.defaultCurrency,
          secondaryCurrency: customer.secondaryCurrency,
          defaultIncoterm: customer.defaultIncoterm,
          labelBranding: customer.labelBranding,
          defaultLabelTemplateId: customer.defaultLabelTemplateId,
          logoUrl: customer.logoPath ? fileUrl(customer.logoPath, { thumb: true }) : null,
          active: customer.active,
        }}
      />
    </div>
  );
}
