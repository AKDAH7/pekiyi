"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { createProductCodeAction, deleteProductCodeAction, updateProductCodeAction } from "@/actions/customers";
import { useFormAction } from "@/hooks/use-form-action";
import { useVersionedForm } from "@/hooks/use-versioned-form";
import { BarcodeInput } from "@/components/customers/barcode-input";
import { CopyButton } from "@/components/customers/contact";
import { FormField, fieldAria } from "@/components/form-field";
import { FormStatus } from "@/components/form-status";
import { OptionSelect } from "@/components/option-select";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ProductCodeItem = {
  id: string;
  version: number;
  modelId: string;
  modelLabel: string;
  pieceTypeId: string | null;
  pieceTypeLabel: string | null;
  fabricId: string | null;
  fabricLabel: string | null;
  barcode: string;
  stockCode: string | null;
  customerProductName: string | null;
  brandText: string | null;
};

export type ProductCodeOptions = {
  models: SearchableOption[];
  pieceTypes: { value: string; label: string }[];
  fabrics: SearchableOption[];
};

function CodeFields({
  code,
  options,
  errors,
}: {
  code?: ProductCodeItem;
  options: ProductCodeOptions;
  errors: Record<string, string>;
}) {
  const t = useTranslations("customers.codes");
  const prefix = code ? `code-${code.id}` : "code-new";
  const text = (name: "stockCode" | "customerProductName" | "brandText", maxLength: number) => (
    <FormField id={`${prefix}-${name}`} label={t(name)} error={errors[name]}>
      <Input
        {...fieldAria(`${prefix}-${name}`, errors[name])}
        name={name}
        defaultValue={code?.[name] ?? ""}
        maxLength={maxLength}
        autoComplete="off"
      />
    </FormField>
  );

  return (
    <>
      <FormField id={`${prefix}-model`} label={t("model")} error={errors.modelId}>
        <SearchableSelect
          id={`${prefix}-model`}
          name="modelId"
          options={options.models}
          defaultValue={code?.modelId}
          placeholder={t("modelPlaceholder")}
          emptyText={t("noMatch")}
          invalid={!!errors.modelId}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${prefix}-pieceType`} label={t("pieceType")} error={errors.pieceTypeId}>
          <OptionSelect
            id={`${prefix}-pieceType`}
            name="pieceTypeId"
            defaultValue={code?.pieceTypeId ?? "none"}
            options={[{ value: "none", label: t("allPieceTypes") }, ...options.pieceTypes]}
          />
        </FormField>
        <FormField id={`${prefix}-fabric`} label={t("fabric")} error={errors.fabricId}>
          <SearchableSelect
            id={`${prefix}-fabric`}
            name="fabricId"
            options={[{ value: "", label: t("anyFabric") }, ...options.fabrics]}
            defaultValue={code?.fabricId ?? ""}
            emptyText={t("noMatch")}
          />
        </FormField>
      </div>
      <FormField id={`${prefix}-barcode`} label={t("barcode")}>
        <BarcodeInput id={`${prefix}-barcode`} defaultValue={code?.barcode} error={errors.barcode} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        {text("stockCode", 60)}
        {text("brandText", 100)}
      </div>
      {text("customerProductName", 200)}
    </>
  );
}

function Footer({ pending, submitLabel }: { pending: boolean; submitLabel: string }) {
  const common = useTranslations("common");
  return (
    <DialogFooter>
      <DialogClose render={<Button type="button" variant="outline" />}>{common("cancel")}</DialogClose>
      <Button type="submit" disabled={pending}>
        {pending ? common("saving") : submitLabel}
      </Button>
    </DialogFooter>
  );
}

function CreateCodeButton({ customerId, options }: { customerId: string; options: ProductCodeOptions }) {
  const t = useTranslations("customers.codes");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t("new")}
      </Button>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        {/* Mounted per opening, so a new code starts from an empty form. */}
        {open ? <CreateCodeForm customerId={customerId} options={options} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateCodeForm({
  customerId,
  options,
  onDone,
}: {
  customerId: string;
  options: ProductCodeOptions;
  onDone: () => void;
}) {
  const t = useTranslations("customers.codes");
  const { state, pending, onSubmit } = useFormAction(createProductCodeAction, onDone);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="customerId" value={customerId} />
      <CodeFields options={options} errors={state.fieldErrors ?? {}} />
      <FormStatus state={state} />
      <Footer pending={pending} submitLabel={t("add")} />
    </form>
  );
}

function EditCodeForm({
  code,
  options,
  onDone,
}: {
  code: ProductCodeItem;
  options: ProductCodeOptions;
  onDone: () => void;
}) {
  const common = useTranslations("common");
  const { state, pending, onSubmit, conflict } = useVersionedForm(updateProductCodeAction, code.version, onDone);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={code.id} />
      <input type="hidden" name="version" value={code.version} />
      <div key={code.version} className="flex flex-col gap-4">
        <CodeFields code={code} options={options} errors={state.fieldErrors ?? {}} />
      </div>
      <FormStatus state={state} conflict={conflict} />
      <Footer pending={pending} submitLabel={common("save")} />
    </form>
  );
}

function DeleteCodeForm({ code, onDone }: { code: ProductCodeItem; onDone: () => void }) {
  const common = useTranslations("common");
  const { state, pending, onSubmit, conflict } = useVersionedForm(deleteProductCodeAction, code.version, onDone);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={code.id} />
      <input type="hidden" name="version" value={code.version} />
      <FormStatus state={state} conflict={conflict} />
      <AlertDialogFooter>
        <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? common("saving") : common("delete")}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

function CodeActions({ code, options }: { code: ProductCodeItem; options: ProductCodeOptions }) {
  const t = useTranslations("customers.codes");
  const common = useTranslations("common");
  const [open, setOpen] = useState<"edit" | "delete" | null>(null);
  const close = () => setOpen(null);
  const onOpenChange = (next: boolean) => {
    if (!next) close();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label={common("actionsFor", { name: code.barcode })}>
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen("edit")}>
            <Pencil />
            {common("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setOpen("delete")}>
            <Trash2 />
            {common("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "edit"} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <EditCodeForm code={code} options={options} onDone={close} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={open === "delete"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { barcode: code.barcode })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <DeleteCodeForm code={code} onDone={close} />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ProductCodes({
  customerId,
  codes,
  options,
  canEdit,
}: {
  customerId: string;
  codes: ProductCodeItem[];
  options: ProductCodeOptions;
  canEdit: boolean;
}) {
  const t = useTranslations("customers.codes");
  const common = useTranslations("common");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        {canEdit ? <CreateCodeButton customerId={customerId} options={options} /> : null}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("model")}</TableHead>
              <TableHead>{t("pieceType")}</TableHead>
              <TableHead>{t("fabric")}</TableHead>
              <TableHead>{t("barcode")}</TableHead>
              <TableHead>{t("stockCode")}</TableHead>
              <TableHead>{t("customerProductName")}</TableHead>
              <TableHead>{t("brandText")}</TableHead>
              {canEdit ? (
                <TableHead className="w-0">
                  <span className="sr-only">{common("actions")}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {codes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              codes.map((code) => (
                <TableRow key={code.id}>
                  <TableCell className="font-medium">{code.modelLabel}</TableCell>
                  <TableCell>{code.pieceTypeLabel ?? t("allPieceTypes")}</TableCell>
                  <TableCell>{code.fabricLabel ?? t("anyFabric")}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1">
                      <span dir="ltr" className="font-mono tabular-nums">
                        {code.barcode}
                      </span>
                      <CopyButton value={code.barcode} label={t("barcode")} />
                    </span>
                  </TableCell>
                  <TableCell>{code.stockCode ?? "—"}</TableCell>
                  <TableCell className="whitespace-normal">{code.customerProductName ?? "—"}</TableCell>
                  <TableCell>{code.brandText ?? "—"}</TableCell>
                  {canEdit ? (
                    <TableCell>
                      <CodeActions code={code} options={options} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
