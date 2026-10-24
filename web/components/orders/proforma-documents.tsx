"use client";

import { useState } from "react";
import { ChevronDown, Eye, FileSpreadsheet, FileText } from "lucide-react";
import { useTranslations } from "next-intl";

import { DOCUMENT_LANGUAGES, type DocumentFormat, type DocumentLanguage } from "@/lib/documents/languages";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The customer's language first, then the others. */
function ordered(first: DocumentLanguage): DocumentLanguage[] {
  return [first, ...DOCUMENT_LANGUAGES.filter((lang) => lang !== first)];
}

/** "Preview" ▾ language: the draft PDF of the saved order, with a DRAFT watermark, in a new tab. */
export function ProformaPreviewMenu({ orderId, defaultLanguage }: { orderId: string; defaultLanguage: DocumentLanguage }) {
  const t = useTranslations("orders.documents");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "outline" })} title={t("previewHint")}>
        <Eye />
        {t("preview")}
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ordered(defaultLanguage).map((lang) => (
          <DropdownMenuItem
            key={lang}
            render={<a href={`/api/orders/${orderId}/proforma/preview?lang=${lang}`} target="_blank" rel="noopener" />}
          >
            {t(`languages.${lang}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** On an issued revision: a language picker and "Download PDF" / "Download Excel". */
export function IssueDownloads({
  orderId,
  issueId,
  defaultLanguage,
}: {
  orderId: string;
  issueId: string;
  defaultLanguage: DocumentLanguage;
}) {
  const t = useTranslations("orders.documents");
  const [language, setLanguage] = useState<DocumentLanguage>(defaultLanguage);
  const href = (format: DocumentFormat) => `/api/orders/${orderId}/proforma/${issueId}?format=${format}&lang=${language}`;
  const options = ordered(defaultLanguage).map((lang) => ({ value: lang, label: t(`languages.${lang}`) }));

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="issue-downloads">
      <Select
        items={options}
        value={language}
        onValueChange={(value) => {
          const picked = DOCUMENT_LANGUAGES.find((lang) => lang === value);
          if (picked) setLanguage(picked);
        }}
      >
        <SelectTrigger size="sm" className="w-44" aria-label={t("language")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a href={href("pdf")} download className={buttonVariants({ variant: "outline", size: "sm" })}>
        <FileText />
        {t("downloadPdf")}
      </a>
      <a href={href("xlsx")} download className={buttonVariants({ variant: "outline", size: "sm" })}>
        <FileSpreadsheet />
        {t("downloadExcel")}
      </a>
    </div>
  );
}
