"use client";

import { useState } from "react";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { createCustomerAction, updateCustomerAction } from "@/actions/customers";
import { useFormAction } from "@/hooks/use-form-action";
import { useVersionedForm } from "@/hooks/use-versioned-form";
import { Link } from "@/i18n/navigation";
import {
  CUSTOMER_DOC_LANGUAGES,
  CUSTOMER_INCOTERMS,
  CUSTOMER_LABEL_BRANDINGS,
} from "@/lib/customers/constants";
import type { CustomerFormState, DuplicateView } from "@/lib/customers/form-state";
import type { FormState } from "@/lib/form-state";
import { CURRENCIES } from "@/lib/validation/currencies";
import { CheckboxField } from "@/components/checkbox-field";
import { Flag } from "@/components/customers/country";
import { TaxIdsInput } from "@/components/customers/tax-ids-input";
import { FormField, fieldAria } from "@/components/form-field";
import { FormStatus } from "@/components/form-status";
import { ImageInput } from "@/components/image-input";
import { OptionSelect } from "@/components/option-select";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type CustomerFormValues = {
  id: string;
  version: number;
  companyName: string;
  contactPerson: string | null;
  country: string;
  city: string | null;
  address: string | null;
  /** Display format ("+31 6 33999931"); normalized again on save. */
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  taxIds: Record<string, string> | null;
  notes: string | null;
  docLanguage: string;
  defaultCurrency: string;
  secondaryCurrency: string | null;
  defaultIncoterm: string;
  labelBranding: string;
  defaultLabelTemplateId: string | null;
  logoUrl: string | null;
  active: boolean;
};

type Props = {
  countries: SearchableOption[];
  labelTemplates: { value: string; label: string }[];
  /** Country names by code in the UI language (for the duplicate list). */
  countryNames: Record<string, string>;
} & ({ mode: "create"; customer?: undefined } | { mode: "edit"; customer: CustomerFormValues });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function DuplicateWarning({
  duplicates,
  countryNames,
  pending,
}: {
  duplicates: DuplicateView[];
  countryNames: Record<string, string>;
  pending: boolean;
}) {
  const t = useTranslations("customers.duplicates");
  const common = useTranslations("common");
  return (
    <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <TriangleAlert />
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 text-current">
        <p>{t("description")}</p>
        <ul className="flex flex-col gap-2" aria-label={t("listLabel")}>
          {duplicates.map((match) => (
            <li key={match.id} className="flex flex-wrap items-center gap-2">
              <Link
                href={`/customers/${match.id}`}
                target="_blank"
                className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
              >
                {match.companyName}
                <ExternalLink className="size-3.5" aria-hidden />
              </Link>
              <span className="inline-flex items-center gap-1 text-sm">
                <Flag code={match.country} />
                {[countryNames[match.country] ?? match.country, match.city].filter(Boolean).join(", ")}
              </span>
              {match.reasons.map((reason) => (
                <Badge key={reason} variant="outline">
                  {t(`reasons.${reason}`)}
                </Badge>
              ))}
              {match.active ? null : <Badge variant="destructive">{common("inactive")}</Badge>}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" name="confirmDuplicates" value="on" variant="outline" disabled={pending}>
            {t("saveAnyway")}
          </Button>
          <span className="text-sm">{t("orChange")}</span>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function CustomerForm(props: Props) {
  return props.mode === "create" ? <CreateCustomerForm {...props} /> : <EditCustomerForm {...props} />;
}

function CreateCustomerForm(props: Props) {
  const { state, pending, onSubmit } = useFormAction<CustomerFormState>(createCustomerAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <CustomerFields {...props} state={state} pending={pending} />
    </form>
  );
}

function EditCustomerForm(props: Props & { mode: "edit" }) {
  const { customer } = props;
  const { state, pending, onSubmit, conflict } = useVersionedForm(updateCustomerAction, customer.version);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="id" value={customer.id} />
      <input type="hidden" name="version" value={customer.version} />
      <div key={customer.version} className="flex flex-col gap-6">
        <CustomerFields {...props} state={state} pending={pending} conflict={conflict} />
      </div>
    </form>
  );
}

function CustomerFields({
  mode,
  customer,
  countries,
  labelTemplates,
  countryNames,
  state,
  pending,
  conflict,
}: Props & { state: CustomerFormState | FormState; pending: boolean; conflict?: boolean }) {
  const t = useTranslations("customers");
  const common = useTranslations("common");
  const languages = useTranslations("languages");
  const errors = state.fieldErrors ?? {};
  const [branding, setBranding] = useState(customer?.labelBranding ?? "pekiyi");
  const duplicates = "duplicates" in state ? state.duplicates : undefined;

  const text = (
    name: "companyName" | "contactPerson" | "city" | "email" | "website",
    options: { type?: string; ltr?: boolean; maxLength: number; autoComplete?: string },
  ) => (
    <FormField id={`customer-${name}`} label={t(`fields.${name}`)} error={errors[name]}>
      <Input
        {...fieldAria(`customer-${name}`, errors[name])}
        name={name}
        type={options.type}
        dir={options.ltr ? "ltr" : undefined}
        className={options.ltr ? "text-start" : undefined}
        defaultValue={customer?.[name] ?? ""}
        maxLength={options.maxLength}
        autoComplete={options.autoComplete ?? "off"}
      />
    </FormField>
  );

  const phone = (name: "phone" | "whatsapp") => (
    <FormField id={`customer-${name}`} label={t(`fields.${name}`)} error={errors[name]} hint={t("phoneHint")}>
      <Input
        {...fieldAria(`customer-${name}`, errors[name])}
        name={name}
        type="tel"
        dir="ltr"
        className="text-start"
        defaultValue={customer?.[name] ?? ""}
        maxLength={40}
        autoComplete="off"
      />
    </FormField>
  );

  return (
    <>
      <Section title={t("sections.company")}>
        {text("companyName", { maxLength: 200 })}
        {text("contactPerson", { maxLength: 120 })}
        {phone("phone")}
        {phone("whatsapp")}
        {text("email", { type: "email", ltr: true, maxLength: 254 })}
        {text("website", { ltr: true, maxLength: 200 })}
      </Section>

      <Section title={t("sections.address")}>
        <FormField id="customer-country" label={t("fields.country")} error={errors.country}>
          <SearchableSelect
            id="customer-country"
            name="country"
            options={countries}
            defaultValue={customer?.country}
            placeholder={t("countryPlaceholder")}
            emptyText={t("countryEmpty")}
            invalid={!!errors.country}
            describedBy={errors.country ? "customer-country-error" : undefined}
          />
        </FormField>
        {text("city", { maxLength: 100 })}
        <div className="md:col-span-2">
          <FormField id="customer-address" label={t("fields.address")} error={errors.address}>
            <Textarea
              {...fieldAria("customer-address", errors.address)}
              name="address"
              rows={3}
              defaultValue={customer?.address ?? ""}
              maxLength={1000}
            />
          </FormField>
        </div>
        <div className="md:col-span-2">
          <TaxIdsInput defaultValue={customer?.taxIds ?? null} errors={errors} />
        </div>
      </Section>

      <Section title={t("sections.documents")}>
        <FormField id="customer-docLanguage" label={t("fields.docLanguage")} error={errors.docLanguage}>
          <OptionSelect
            id="customer-docLanguage"
            name="docLanguage"
            defaultValue={customer?.docLanguage ?? "en"}
            options={CUSTOMER_DOC_LANGUAGES.map((lang) => ({ value: lang, label: languages(lang) }))}
          />
        </FormField>
        <FormField id="customer-defaultIncoterm" label={t("fields.defaultIncoterm")} error={errors.defaultIncoterm}>
          <OptionSelect
            id="customer-defaultIncoterm"
            name="defaultIncoterm"
            defaultValue={customer?.defaultIncoterm ?? "EXW"}
            options={CUSTOMER_INCOTERMS.map((term) => ({ value: term, label: term }))}
          />
        </FormField>
        <FormField id="customer-defaultCurrency" label={t("fields.defaultCurrency")} error={errors.defaultCurrency}>
          <OptionSelect
            id="customer-defaultCurrency"
            name="defaultCurrency"
            defaultValue={customer?.defaultCurrency ?? "USD"}
            options={CURRENCIES.map((code) => ({ value: code, label: code }))}
          />
        </FormField>
        <FormField
          id="customer-secondaryCurrency"
          label={t("fields.secondaryCurrency")}
          error={errors.secondaryCurrency}
          hint={t("secondaryCurrencyHint")}
        >
          <OptionSelect
            id="customer-secondaryCurrency"
            name="secondaryCurrency"
            defaultValue={customer?.secondaryCurrency ?? "none"}
            invalid={!!errors.secondaryCurrency}
            options={[
              { value: "none", label: t("none") },
              ...CURRENCIES.map((code) => ({ value: code, label: code })),
            ]}
          />
        </FormField>
      </Section>

      <Section title={t("sections.labels")}>
        <FormField id="customer-labelBranding" label={t("fields.labelBranding")} error={errors.labelBranding}>
          <OptionSelect
            id="customer-labelBranding"
            name="labelBranding"
            defaultValue={branding}
            onValueChange={setBranding}
            options={CUSTOMER_LABEL_BRANDINGS.map((value) => ({ value, label: t(`branding.${value}`) }))}
          />
        </FormField>
        <FormField
          id="customer-defaultLabelTemplateId"
          label={t("fields.defaultLabelTemplate")}
          error={errors.defaultLabelTemplateId}
        >
          <OptionSelect
            id="customer-defaultLabelTemplateId"
            name="defaultLabelTemplateId"
            defaultValue={customer?.defaultLabelTemplateId ?? "none"}
            options={[{ value: "none", label: t("none") }, ...labelTemplates]}
          />
        </FormField>
        <div className="md:col-span-2">
          <ImageInput
            id="customer-logo"
            name="logo"
            removeName="removeLogo"
            label={t("fields.logo")}
            currentUrl={customer?.logoUrl ?? null}
            error={errors.logo}
          />
          {branding === "customer_logo" ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("logoHint")}</p>
          ) : null}
        </div>
      </Section>

      <Section title={t("sections.notes")}>
        <div className="md:col-span-2">
          <FormField id="customer-notes" label={t("fields.notes")} error={errors.notes}>
            <Textarea
              {...fieldAria("customer-notes", errors.notes)}
              name="notes"
              rows={4}
              defaultValue={customer?.notes ?? ""}
              maxLength={4000}
            />
          </FormField>
        </div>
        {mode === "edit" ? (
          <CheckboxField
            id="customer-active"
            name="active"
            label={t("fields.active")}
            defaultChecked={customer?.active}
            hint={t("activeHint")}
          />
        ) : null}
      </Section>

      {duplicates && duplicates.length > 0 ? (
        <DuplicateWarning duplicates={duplicates} countryNames={countryNames} pending={pending} />
      ) : null}
      {Object.keys(errors).length > 0 && !state.formError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("fixErrors")}
        </p>
      ) : null}
      <FormStatus state={state} conflict={conflict} />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? common("saving") : mode === "create" ? t("createSubmit") : common("save")}
        </Button>
        <Link
          href={customer ? `/customers/${customer.id}` : "/customers"}
          className={buttonVariants({ variant: "outline" })}
        >
          {common("cancel")}
        </Link>
      </div>
    </>
  );
}
