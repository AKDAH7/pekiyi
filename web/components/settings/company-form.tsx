"use client";

import { useTranslations } from "next-intl";

import { updateCompanySettingsAction } from "@/actions/settings";
import type { LocalizedText } from "@/db/schema/common";
import { useVersionedForm } from "@/hooks/use-versioned-form";
import { FormField, fieldAria } from "@/components/form-field";
import { FormStatus } from "@/components/form-status";
import { ImageInput } from "@/components/image-input";
import { TranslatedTextarea } from "@/components/translated-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type CompanyFormValues = {
  version: number;
  legalName: string;
  brandName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hsCode: string | null;
  orderCode: string;
  defaultDeliveryTime: LocalizedText | null;
  defaultPaymentTerms: LocalizedText | null;
  logoUrl: string | null;
};

export function CompanyForm({ values }: { values: CompanyFormValues }) {
  const t = useTranslations("company");
  const common = useTranslations("common");
  const { state, pending, onSubmit, conflict } = useVersionedForm(
    updateCompanySettingsAction,
    values.version,
  );
  const errors = state.fieldErrors ?? {};

  const text = (name: keyof CompanyFormValues, options: { dir?: "ltr"; type?: string } = {}) => (
    <FormField id={`company-${name}`} label={t(`fields.${name}`)} error={errors[name]}>
      <Input
        {...fieldAria(`company-${name}`, errors[name])}
        name={name}
        type={options.type}
        dir={options.dir}
        defaultValue={(values[name] as string | null) ?? ""}
        className={options.dir ? "text-start" : undefined}
      />
    </FormField>
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate encType="multipart/form-data">
      <input type="hidden" name="version" value={values.version} />
      {/* Re-mounted with fresh values after a save or a reload (new version). */}
      <div key={values.version} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("identityTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {text("legalName")}
            {text("brandName")}
            <div className="md:col-span-2">{text("address")}</div>
            {text("phone", { dir: "ltr" })}
            {text("email", { dir: "ltr", type: "email" })}
            {text("website", { dir: "ltr" })}
            {text("hsCode", { dir: "ltr" })}
            <div className="md:col-span-2">
              <ImageInput
                id="company-logo"
                name="logo"
                removeName="removeLogo"
                label={t("fields.logo")}
                currentUrl={values.logoUrl}
                error={errors.logo}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("ordersTitle")}</CardTitle>
            <CardDescription>{t("ordersDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FormField
              id="company-orderCode"
              label={t("fields.orderCode")}
              error={errors.orderCode}
              hint={t("orderCodeNote")}
            >
              <Input
                {...fieldAria("company-orderCode", errors.orderCode)}
                name="orderCode"
                dir="ltr"
                defaultValue={values.orderCode}
                className="max-w-40 text-start font-mono uppercase"
                maxLength={10}
              />
            </FormField>
            <TranslatedTextarea
              id="company-delivery"
              name="defaultDeliveryTime"
              label={t("fields.defaultDeliveryTime")}
              defaultValue={values.defaultDeliveryTime}
              errors={errors}
              maxLength={1000}
            />
            <TranslatedTextarea
              id="company-payment"
              name="defaultPaymentTerms"
              label={t("fields.defaultPaymentTerms")}
              defaultValue={values.defaultPaymentTerms}
              errors={errors}
              maxLength={1000}
            />
          </CardContent>
        </Card>
      </div>

      <FormStatus state={state} conflict={conflict} successMessage={common("saved")} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? common("saving") : common("save")}
        </Button>
      </div>
    </form>
  );
}
