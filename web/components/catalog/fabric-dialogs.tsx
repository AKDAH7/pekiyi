"use client";

import { useState } from "react";
import { CircleCheck, CircleX, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { createFabricAction, setFabricActiveAction, updateFabricAction } from "@/actions/catalog";
import type { LocalizedText } from "@/db/schema/common";
import { useFormAction } from "@/hooks/use-form-action";
import { useVersionedForm } from "@/hooks/use-versioned-form";
import { FormField, fieldAria } from "@/components/form-field";
import { FormStatus } from "@/components/form-status";
import { TranslatedInput } from "@/components/translated-input";
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

export type FabricItem = {
  id: string;
  version: number;
  brand: string;
  code: string;
  colorKey: string | null;
  colorName: LocalizedText | null;
  active: boolean;
};

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

function FabricFields({ fabric, errors }: { fabric?: FabricItem; errors: Record<string, string> }) {
  const t = useTranslations("fabrics.fields");
  const prefix = fabric ? `fabric-${fabric.id}` : "fabric-new";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${prefix}-brand`} label={t("brand")} error={errors.brand}>
          <Input
            {...fieldAria(`${prefix}-brand`, errors.brand)}
            name="brand"
            className="uppercase"
            defaultValue={fabric?.brand ?? ""}
          />
        </FormField>
        <FormField id={`${prefix}-code`} label={t("code")} error={errors.code}>
          <Input {...fieldAria(`${prefix}-code`, errors.code)} name="code" defaultValue={fabric?.code ?? ""} />
        </FormField>
      </div>
      <FormField id={`${prefix}-colorKey`} label={t("colorKey")} error={errors.colorKey} hint={t("colorKeyHint")}>
        <Input
          {...fieldAria(`${prefix}-colorKey`, errors.colorKey)}
          name="colorKey"
          defaultValue={fabric?.colorKey ?? ""}
        />
      </FormField>
      <TranslatedInput
        id={`${prefix}-colorName`}
        name="colorName"
        label={t("colorName")}
        defaultValue={fabric?.colorName}
        errors={errors}
        maxLength={100}
      />
    </>
  );
}

export function CreateFabricButton() {
  const t = useTranslations("fabrics");
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useFormAction(createFabricAction, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t("new")}
      </Button>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FabricFields errors={state.fieldErrors ?? {}} />
          <FormStatus state={state} />
          <Footer pending={pending} submitLabel={t("create")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFabricForm({ fabric, onDone }: { fabric: FabricItem; onDone: () => void }) {
  const common = useTranslations("common");
  const { state, pending, onSubmit, conflict } = useVersionedForm(updateFabricAction, fabric.version, onDone);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={fabric.id} />
      <input type="hidden" name="version" value={fabric.version} />
      {/* Deactivating has its own menu entry; the edit form keeps the current state. */}
      {fabric.active ? <input type="hidden" name="active" value="on" /> : null}
      <div key={fabric.version} className="flex flex-col gap-4">
        <FabricFields fabric={fabric} errors={state.fieldErrors ?? {}} />
      </div>
      <FormStatus state={state} conflict={conflict} />
      <Footer pending={pending} submitLabel={common("save")} />
    </form>
  );
}

function SetActiveForm({ fabric, onDone }: { fabric: FabricItem; onDone: () => void }) {
  const t = useTranslations("fabrics");
  const common = useTranslations("common");
  const { state, pending, onSubmit, conflict } = useVersionedForm(setFabricActiveAction, fabric.version, onDone);
  const activating = !fabric.active;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={fabric.id} />
      <input type="hidden" name="version" value={fabric.version} />
      <input type="hidden" name="active" value={String(activating)} />
      <FormStatus state={state} conflict={conflict} />
      <AlertDialogFooter>
        <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
        <Button type="submit" variant={activating ? "default" : "destructive"} disabled={pending}>
          {pending ? common("saving") : t(activating ? "reactivate" : "deactivate")}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

export function FabricActions({ fabric }: { fabric: FabricItem }) {
  const t = useTranslations("fabrics");
  const common = useTranslations("common");
  const [open, setOpen] = useState<"edit" | "active" | null>(null);
  const close = () => setOpen(null);
  const onOpenChange = (next: boolean) => {
    if (!next) close();
  };
  const label = `${fabric.brand} ${fabric.code}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label={common("actionsFor", { name: label })}>
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen("edit")}>
            <Pencil />
            {common("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant={fabric.active ? "destructive" : "default"}
            onClick={() => setOpen("active")}
          >
            {fabric.active ? <CircleX /> : <CircleCheck />}
            {t(fabric.active ? "deactivate" : "reactivate")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "edit"} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <EditFabricForm fabric={fabric} onDone={close} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={open === "active"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(fabric.active ? "deactivateTitle" : "reactivateTitle", { name: label })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(fabric.active ? "deactivateDescription" : "reactivateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <SetActiveForm fabric={fabric} onDone={close} />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
