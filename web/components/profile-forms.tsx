"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";

import { changePasswordAction, updateProfileAction } from "@/actions/profile";
import { useFormAction } from "@/hooks/use-form-action";
import { FormField, FormMessage, fieldAria } from "@/components/form-field";
import { LocaleSelect } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProfileForm({ name, preferredLocale }: { name: string; preferredLocale: string }) {
  const t = useTranslations("profile");
  const common = useTranslations("common");
  const { state, pending, onSubmit } = useFormAction(updateProfileAction);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField id="profile-name" label={t("name")} error={errors.name}>
        <Input
          {...fieldAria("profile-name", errors.name)}
          name="name"
          defaultValue={name}
          autoComplete="name"
        />
      </FormField>
      <FormField id="profile-locale" label={t("language")} error={errors.preferredLocale}>
        <LocaleSelect
          id="profile-locale"
          name="preferredLocale"
          defaultValue={preferredLocale}
          invalid={!!errors.preferredLocale}
        />
      </FormField>
      <FormMessage
        error={state.formError}
        success={state.status === "success" ? common("saved") : undefined}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? common("saving") : common("save")}
        </Button>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const t = useTranslations("profile");
  const common = useTranslations("common");
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useFormAction(changePasswordAction, () =>
    formRef.current?.reset(),
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField id="current-password" label={t("currentPassword")} error={errors.currentPassword}>
        <Input
          {...fieldAria("current-password", errors.currentPassword)}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
        />
      </FormField>
      <FormField id="new-password" label={t("newPassword")} error={errors.newPassword}>
        <Input
          {...fieldAria("new-password", errors.newPassword)}
          name="newPassword"
          type="password"
          autoComplete="new-password"
        />
      </FormField>
      <FormField id="confirm-password" label={t("confirmPassword")} error={errors.confirmPassword}>
        <Input
          {...fieldAria("confirm-password", errors.confirmPassword)}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
        />
      </FormField>
      <FormMessage
        error={state.formError}
        success={state.status === "success" ? t("passwordChanged") : undefined}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? common("saving") : t("changePassword")}
        </Button>
      </div>
    </form>
  );
}
