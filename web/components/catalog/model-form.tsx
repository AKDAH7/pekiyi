"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { deleteModelAction, updateModelAction } from "@/actions/catalog";
import type { LocalizedText } from "@/db/schema/common";
import { useFormAction } from "@/hooks/use-form-action";
import { useVersionedForm } from "@/hooks/use-versioned-form";
import { CheckboxField } from "@/components/checkbox-field";
import { FormField, FormMessage, fieldAria } from "@/components/form-field";
import { FormStatus } from "@/components/form-status";
import { ImageInput } from "@/components/image-input";
import { TranslatedInput, TranslatedTextarea } from "@/components/translated-input";
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
import { Input } from "@/components/ui/input";

export type ModelFormValues = {
  id: string;
  version: number;
  code: string;
  name: LocalizedText;
  description: LocalizedText | null;
  isSofabed: boolean;
  active: boolean;
  photoUrl: string | null;
};

export function ModelForm({ model, canEdit }: { model: ModelFormValues; canEdit: boolean }) {
  const t = useTranslations("catalog");
  const common = useTranslations("common");
  const { state, pending, onSubmit, conflict } = useVersionedForm(updateModelAction, model.version);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={model.id} />
      <input type="hidden" name="version" value={model.version} />
      <fieldset key={model.version} disabled={!canEdit} className="grid gap-4 md:grid-cols-2">
        <FormField id="model-code" label={t("fields.code")} error={errors.code}>
          <Input
            {...fieldAria("model-code", errors.code)}
            name="code"
            defaultValue={model.code}
            className="uppercase"
            maxLength={40}
          />
        </FormField>
        <TranslatedInput
          id="model-name"
          name="name"
          label={t("fields.name")}
          defaultValue={model.name}
          errors={errors}
          maxLength={100}
        />
        <div className="md:col-span-2">
          <TranslatedTextarea
            id="model-description"
            name="description"
            label={t("fields.description")}
            defaultValue={model.description}
            errors={errors}
            maxLength={2000}
          />
        </div>
        <div className="flex flex-col gap-3">
          <CheckboxField id="model-sofabed" name="isSofabed" label={t("fields.isSofabed")} defaultChecked={model.isSofabed} />
          <CheckboxField
            id="model-active"
            name="active"
            label={t("fields.active")}
            defaultChecked={model.active}
            hint={t("activeHint")}
          />
        </div>
        <ImageInput
          id="model-photo"
          name="photo"
          removeName="removePhoto"
          label={t("fields.photo")}
          currentUrl={model.photoUrl}
          error={errors.photo}
        />
      </fieldset>
      <FormStatus state={state} conflict={conflict} successMessage={common("saved")} />
      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? common("saving") : common("save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function DeleteModelButton({ model }: { model: { id: string; version: number; code: string } }) {
  const t = useTranslations("catalog");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useFormAction(deleteModelAction);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trash2 />
        {common("delete")}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle", { code: model.code })}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={model.id} />
          <input type="hidden" name="version" value={model.version} />
          <FormMessage error={state.formError} />
          <AlertDialogFooter>
            <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? common("saving") : common("delete")}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
