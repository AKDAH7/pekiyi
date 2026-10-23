import { ShieldX } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";

/** Rendered (with a 403) when requirePermission() calls `forbidden()`. */
export default async function Forbidden() {
  const t = await getTranslations("forbidden");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <ShieldX className="size-12 text-muted-foreground" aria-hidden />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <Link href="/dashboard" className={buttonVariants()}>
        {t("backToDashboard")}
      </Link>
    </div>
  );
}
