"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { createModelAction } from "@/actions/catalog";
import { useFormAction } from "@/hooks/use-form-action";
import { CheckboxField } from "@/components/checkbox-field";
import { FormField, fieldAria } from "@/components/form-field";
import { FormStatus } from "@/components/form-status";
import { TranslatedInput } from "@/components/translated-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function CreateModelForm() {
  const t = useTranslations("catalog");
  const common = useTranslations("common");
  // On success the action redirects to the new model's page.
  const { state, pending, onSubmit } = useFormAction(createModelAction);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField id="model-new-code" label={t("fields.code")} error={errors.code} hint={t("codeHint")}>
        <Input
          {...fieldAria("model-new-code", errors.code)}
          name="code"
          autoComplete="off"
          className="uppercase"
          maxLength={40}
        />
      </FormField>
      <TranslatedInput id="model-new-name" name="name" label={t("fields.name")} errors={errors} maxLength={100} />
      <CheckboxField id="model-new-sofabed" name="isSofabed" label={t("fields.isSofabed")} defaultChecked />
      <FormStatus state={state} />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{common("cancel")}</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? common("saving") : t("createSubmit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateModelButton() {
  const t = useTranslations("catalog");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t("newModel")}
      </Button>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDescription")}</DialogDescription>
        </DialogHeader>
        <CreateModelForm />
      </DialogContent>
    </Dialog>
  );
}
