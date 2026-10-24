"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/products", key: "models" },
  { href: "/products/fabrics", key: "fabrics" },
] as const;

/** Models / Fabrics switcher shown on top of the catalog pages. */
export function CatalogTabs() {
  const t = useTranslations("catalog.tabs");
  const pathname = usePathname();
  const current = pathname.startsWith("/products/fabrics") ? "/products/fabrics" : "/products";

  return (
    <nav aria-label={t("label")} className="flex gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={current === tab.href ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            current === tab.href && "border-primary text-foreground",
          )}
        >
          {t(tab.key)}
        </Link>
      ))}
    </nav>
  );
}
