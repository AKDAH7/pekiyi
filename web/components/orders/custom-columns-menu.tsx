"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Columns3, LayoutTemplate, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { deleteColumnTemplateAction, saveColumnTemplateAction } from "@/actions/orders";
import type { LocalizedText } from "@/db/schema/common";
import type { CustomColumn, DocumentTarget } from "@/db/schema/orders";
import { pickLocalized } from "@/lib/i18n/localized";
import {
  applyTemplateColumns,
  columnKeyFor,
  CUSTOM_COLUMN_TYPES,
  DOCUMENT_TARGET_LIST,
  linesWithValue,
  MAX_CUSTOM_COLUMNS,
} from "@/lib/orders/custom-columns";
import { compactText, type EditorLine } from "@/lib/orders/editor";
import { FormField, FormMessage } from "@/components/form-field";
import { OptionSelect } from "@/components/option-select";
import { TranslatedInput } from "@/components/translated-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A template offered on this order (lib/orders/queries.ts listColumnTemplates). */
export type TemplateOption = {
  id: string;
  name: string;
  scope: "global" | "customer";
  isDefault: boolean;
  columns: CustomColumn[];
};

type Props = {
  columns: CustomColumn[];
  lines: readonly EditorLine[];
  /** Replaces the column set; values of removed columns are dropped from the lines. */
  onChange: (columns: CustomColumn[]) => void;
  templates: readonly TemplateOption[];
  customerId: string;
  /** Whether "Save as template" is offered (the user may edit the order). */
  canManageTemplates: boolean;
};

type Draft = { key: string | null; label: LocalizedText; type: CustomColumn["type"]; showOn: DocumentTarget[] };

const EMPTY_DRAFT: Draft = { key: null, label: {}, type: "text", showOn: ["proforma"] };

/** The order's "Columns" menu: add / edit / remove / reorder custom columns, and column templates. */
export function CustomColumnsMenu({ columns, lines, onChange, templates, customerId, canManageTemplates }: Props) {
  const t = useTranslations("orders.columns");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Remounts the label input when another column is edited.
  const [draftId, setDraftId] = useState(0);
  const [draftError, setDraftError] = useState<string | null>(null);

  const title = (column: Pick<CustomColumn, "label" | "key">) => pickLocalized(column.label, locale) || column.key;

  function edit(next: Draft) {
    setDraft(next);
    setDraftId((id) => id + 1);
    setDraftError(null);
  }

  function saveDraft() {
    if (!draft) return;
    const label = compactText(draft.label);
    if (!label?.tr) {
      setDraftError(t("labelRequired"));
      return;
    }
    if (draft.key) {
      onChange(columns.map((column) => (column.key === draft.key ? { ...column, label, type: draft.type, showOn: draft.showOn } : column)));
    } else {
      const key = columnKeyFor(label, columns.map((column) => column.key));
      onChange([...columns, { key, label, type: draft.type, showOn: draft.showOn }]);
    }
    setDraft(null);
  }

  function remove(column: CustomColumn) {
    const used = linesWithValue(lines, column.key);
    if (used > 0 && !window.confirm(t("confirmRemove", { column: title(column), count: used }))) return;
    onChange(columns.filter((entry) => entry.key !== column.key));
    if (draft?.key === column.key) setDraft(null);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function apply(template: TemplateOption) {
    const { columns: next, removed } = applyTemplateColumns(columns, template.columns);
    const lost = removed.reduce((count, key) => count + linesWithValue(lines, key), 0);
    if (lost > 0 && !window.confirm(t("confirmApply", { template: template.name, count: lost }))) return;
    onChange(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDraft(null);
      }}
    >
      <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Columns3 />
        {t("menu")}
        {columns.length > 0 ? <span className="tabular-nums text-muted-foreground">({columns.length})</span> : null}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <section aria-labelledby="custom-columns-list" className="flex flex-col gap-2">
          <h3 id="custom-columns-list" className="text-sm font-medium">
            {t("current")}
          </h3>
          {columns.length === 0 ? <p className="text-sm text-muted-foreground">{t("none")}</p> : null}
          <ul className="flex flex-col divide-y rounded-md border">
            {columns.map((column, index) => (
              <li key={column.key} data-column={column.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{title(column)}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {t(`types.${column.type}`)}
                    {column.showOn.length > 0 ? ` · ${column.showOn.map((target) => t(`targets.${target}`)).join(", ")}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("moveUp", { column: title(column) })}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("moveDown", { column: title(column) })}
                    disabled={index === columns.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("edit", { column: title(column) })}
                    onClick={() => edit({ key: column.key, label: column.label, type: column.type, showOn: [...column.showOn] })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("remove", { column: title(column) })}
                    onClick={() => remove(column)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {draft === null ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={columns.length >= MAX_CUSTOM_COLUMNS}
                onClick={() => edit(EMPTY_DRAFT)}
              >
                <Plus />
                {t("add")}
              </Button>
            </div>
          ) : (
            <fieldset className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
              <legend className="px-1 text-sm font-medium">{draft.key ? t("editTitle") : t("addTitle")}</legend>
              <TranslatedInput
                key={draftId}
                id="custom-column-label"
                name="label"
                label={t("label")}
                defaultValue={draft.label}
                maxLength={60}
                errors={draftError ? { label: draftError } : undefined}
                onValueChange={(label) => setDraft((current) => (current ? { ...current, label } : current))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="custom-column-type" label={t("type")}>
                  <OptionSelect
                    key={`type-${draftId}`}
                    id="custom-column-type"
                    name="type"
                    defaultValue={draft.type}
                    options={CUSTOM_COLUMN_TYPES.map((type) => ({ value: type, label: t(`types.${type}`) }))}
                    onValueChange={(type) =>
                      setDraft((current) => (current ? { ...current, type: type === "number" ? "number" : "text" } : current))
                    }
                  />
                </FormField>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium">{t("showOn")}</legend>
                  {DOCUMENT_TARGET_LIST.map((target) => (
                    <Label key={target} className="font-normal">
                      <Checkbox
                        checked={draft.showOn.includes(target)}
                        onCheckedChange={(checked) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  showOn: DOCUMENT_TARGET_LIST.filter((entry) =>
                                    entry === target ? checked === true : current.showOn.includes(entry),
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                      {t(`targets.${target}`)}
                    </Label>
                  ))}
                </fieldset>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={saveDraft}>
                  {draft.key ? t("update") : t("addColumn")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                  {t("cancel")}
                </Button>
              </div>
            </fieldset>
          )}
        </section>

        <TemplatesSection
          templates={templates}
          columns={columns}
          customerId={customerId}
          canSave={canManageTemplates}
          onApply={apply}
        />

        <DialogFooter>
          <DialogClose className={buttonVariants()}>{t("done")}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesSection({
  templates,
  columns,
  customerId,
  canSave,
  onApply,
}: {
  templates: readonly TemplateOption[];
  columns: readonly CustomColumn[];
  customerId: string;
  canSave: boolean;
  onApply: (template: TemplateOption) => void;
}) {
  const t = useTranslations("orders.columns");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"customer" | "global">("customer");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setSaved(null);
    startTransition(async () => {
      const result = await saveColumnTemplateAction({ name, scope, customerId, isDefault, columns });
      if (result.status === "success") {
        setSaved(t("templateSaved", { name: name.trim() }));
        setName("");
        setIsDefault(false);
        setError(null);
      } else {
        setError(result.fieldErrors?.name ?? result.fieldErrors?.columns ?? result.formError ?? t("templateFailed"));
      }
    });
  }

  function remove(template: TemplateOption) {
    if (!window.confirm(t("confirmDeleteTemplate", { template: template.name }))) return;
    startTransition(async () => {
      await deleteColumnTemplateAction({ id: template.id });
    });
  }

  return (
    <section aria-labelledby="column-templates" className="flex flex-col gap-3 border-t pt-4">
      <h3 id="column-templates" className="flex items-center gap-2 text-sm font-medium">
        <LayoutTemplate className="size-4" />
        {t("templates")}
      </h3>
      {templates.length === 0 ? <p className="text-sm text-muted-foreground">{t("noTemplates")}</p> : null}
      <ul className="flex flex-col divide-y rounded-md border empty:hidden">
        {templates.map((template) => (
          <li key={template.id} data-template={template.name} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{template.name}</span>{" "}
              <span className="text-xs text-muted-foreground">
                {template.scope === "customer" ? t("scopeCustomer") : t("scopeGlobal")}
                {template.isDefault ? ` · ${t("default")}` : ""} · {t("columnCount", { count: template.columns.length })}
              </span>
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => onApply(template)}>
              {t("apply")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("deleteTemplate", { template: template.name })}
              disabled={pending}
              onClick={() => remove(template)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      {canSave ? (
        <fieldset className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3" disabled={pending}>
          <legend className="px-1 text-sm font-medium">{t("saveAsTemplate")}</legend>
          <FormField id="column-template-name" label={t("templateName")} error={error ?? undefined}>
            <Input
              id="column-template-name"
              value={name}
              maxLength={80}
              aria-invalid={error ? true : undefined}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <div className="flex flex-col gap-2">
            <Label className="font-normal">
              <Checkbox checked={scope === "global"} onCheckedChange={(checked) => setScope(checked === true ? "global" : "customer")} />
              {t("forAllCustomers")}
            </Label>
            <Label className="font-normal">
              <Checkbox
                checked={scope === "customer" && isDefault}
                disabled={scope === "global"}
                onCheckedChange={(checked) => setIsDefault(checked === true)}
              />
              {t("makeDefault")}
            </Label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={save} disabled={columns.length === 0 || name.trim() === ""}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {t("saveTemplate")}
            </Button>
            {columns.length === 0 ? <span className="text-xs text-muted-foreground">{t("addColumnsFirst")}</span> : null}
          </div>
          <FormMessage success={saved ?? undefined} />
        </fieldset>
      ) : null}
    </section>
  );
}
