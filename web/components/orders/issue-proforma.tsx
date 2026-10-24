"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { issueProformaAction } from "@/actions/orders";
import { DOC_LANGUAGES, type DocLanguage } from "@/db/schema/common";
import { BUSINESS_TIME_ZONE } from "@/lib/format/dates";
import { FormField, FormMessage } from "@/components/form-field";
import { OptionSelect } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useOrderEditorStatus } from "./editor-context";

export type LastIssue = {
  number: string;
  revision: number;
  language: string;
  issuedAt: string;
  issuedByName: string | null;
};

/**
 * "Issue proforma": freezes a snapshot as the next revision. The language is
 * only the default for its downloads (History tab); it is not part of the revision.
 */
export function IssueProformaButton({ orderId, defaultLanguage }: { orderId: string; defaultLanguage: DocLanguage }) {
  const t = useTranslations("orders.issue");
  const languages = useTranslations("languages");
  const router = useRouter();
  const { version, dirty, saving } = useOrderEditorStatus();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<DocLanguage>(defaultLanguage);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blocked = dirty || saving;

  function issue() {
    startTransition(async () => {
      const result = await issueProformaAction({ id: orderId, version, language });
      if (result.status === "success") {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.formError ?? Object.values(result.fieldErrors ?? {})[0] ?? null);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={blocked}
        title={blocked ? t("saveFirst") : undefined}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <FileCheck2 />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField id="issue-language" label={t("language")}>
              <OptionSelect
                id="issue-language"
                name="language"
                defaultValue={language}
                options={DOC_LANGUAGES.map((lang) => ({ value: lang, label: languages(lang) }))}
                onValueChange={(value) => setLanguage(DOC_LANGUAGES.find((lang) => lang === value) ?? defaultLanguage)}
              />
            </FormField>
            <FormMessage error={error ?? undefined} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={issue} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Last issued: REV2 on 24 Oct 2026 by Ayşe" + a badge while the saved order differs from it. */
export function IssueState({ last, changed }: { last: LastIssue | null; changed: boolean }) {
  const t = useTranslations("orders.issue");
  const format = useFormatter();
  if (!last) return <p className="text-sm text-muted-foreground">{t("neverIssued")}</p>;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid="last-issue">
      <span>
        {t("lastIssued", {
          revision: `REV${last.revision}`,
          date: format.dateTime(new Date(last.issuedAt), { dateStyle: "medium", timeStyle: "short", timeZone: BUSINESS_TIME_ZONE }),
          name: last.issuedByName ?? t("someone"),
        })}
      </span>
      {changed ? (
        <span className="inline-flex h-5 items-center rounded-full bg-amber-100 px-2 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {t("changedSince")}
        </span>
      ) : null}
    </p>
  );
}
