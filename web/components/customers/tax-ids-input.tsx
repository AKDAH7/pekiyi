"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = { uid: number; key: string; value: string };

let nextUid = 0;
const row = (key = "", value = ""): Row => ({ uid: nextUid++, key, value });

/** Editable key/value list submitted as taxIds.N.key / taxIds.N.value ("VAT" → "NL 0037…"). */
export function TaxIdsInput({
  defaultValue,
  errors,
}: {
  defaultValue: Record<string, string> | null;
  errors: Record<string, string>;
}) {
  const t = useTranslations("customers");
  const [rows, setRows] = useState<Row[]>(() => {
    const entries = Object.entries(defaultValue ?? {});
    return entries.length > 0 ? entries.map(([key, value]) => row(key, value)) : [row()];
  });

  const update = (uid: number, patch: Partial<Row>) =>
    setRows((current) => current.map((entry) => (entry.uid === uid ? { ...entry, ...patch } : entry)));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm leading-none font-medium">{t("fields.taxIds")}</legend>
      {rows.map((entry, index) => {
        const keyError = errors[`taxIds.${index}.key`];
        const valueError = errors[`taxIds.${index}.value`];
        return (
          <div key={entry.uid} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <Input
                name={`taxIds.${index}.key`}
                value={entry.key}
                onChange={(event) => update(entry.uid, { key: event.target.value })}
                placeholder={t("taxIdKeyPlaceholder")}
                aria-label={t("taxIdKeyLabel", { index: index + 1 })}
                aria-invalid={keyError ? true : undefined}
                className="w-28 shrink-0 uppercase"
                maxLength={30}
              />
              <Input
                name={`taxIds.${index}.value`}
                value={entry.value}
                onChange={(event) => update(entry.uid, { value: event.target.value })}
                placeholder={t("taxIdValuePlaceholder")}
                aria-label={t("taxIdValueLabel", { index: index + 1 })}
                aria-invalid={valueError ? true : undefined}
                dir="ltr"
                className="min-w-0 flex-1 text-start"
                maxLength={100}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removeTaxId", { index: index + 1 })}
                onClick={() =>
                  setRows((current) => {
                    const rest = current.filter((other) => other.uid !== entry.uid);
                    return rest.length > 0 ? rest : [row()];
                  })
                }
              >
                <X />
              </Button>
            </div>
            {keyError || valueError ? (
              <p role="alert" className="text-sm text-destructive">
                {keyError ?? valueError}
              </p>
            ) : null}
          </div>
        );
      })}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((current) => [...current, row()])}>
          <Plus />
          {t("addTaxId")}
        </Button>
      </div>
    </fieldset>
  );
}
