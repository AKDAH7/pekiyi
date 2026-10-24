import { ArrowLeft, ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/session";
import { customerFormOptions } from "@/lib/customers/form-options";
import { CustomerForm } from "@/components/customers/customer-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";

export default async function NewCustomerPage() {
  await requirePermission("customers", "create");
  const locale = await getLocale();
  const [options, t] = await Promise.all([customerFormOptions(locale), getTranslations("customers")]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/customers" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="rtl:hidden" />
          <ArrowRight className="hidden rtl:block" />
          {t("backToList")}
        </Link>
      </div>
      <PageHeader title={t("createTitle")} description={t("createDescription")} />
      <CustomerForm mode="create" {...options} />
    </div>
  );
}
