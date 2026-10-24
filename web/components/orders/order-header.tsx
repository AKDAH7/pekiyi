"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { LocalizedText } from "@/db/schema/common";
import { LABEL_BRANDINGS } from "@/db/schema/customers";
import type { DocumentOptions } from "@/db/schema/orders";
import { CUSTOMER_INCOTERMS } from "@/lib/customers/constants";
import type { RatesToTry } from "@/lib/domain/types";
import { formatDecimal } from "@/lib/format/number";
import { ADVANCE_MODES, DOCUMENT_OPTION_KEYS } from "@/lib/orders/constants";
import { compactText, defaultSecondaryRate, type EditorHeader, type EditorOptions } from "@/lib/orders/editor";
import { CURRENCIES } from "@/lib/validation/currencies";
import { DecimalInput } from "@/components/decimal-input";
import { FormField, fieldAria } from "@/components/form-field";
import { OptionSelect } from "@/components/option-select";
import { SearchableSelect } from "@/components/searchable-select";
import { TranslatedInput, TranslatedTextarea } from "@/components/translated-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  header: EditorHeader;
  onChange: (patch: Partial<EditorHeader>) => void;
  options: EditorOptions;
  rates: RatesToTry;
  /** Header field errors from the last save ("secondaryRate" → message). */
  errors: Record<string, string>;
  editable: boolean;
  canWritePrices: boolean;
  canSeePrices: boolean;
};

const NONE = "none";

export function OrderHeaderForm({ header, onChange, options, rates, errors, editable, canWritePrices, canSeePrices }: Props) {
  const t = useTranslations("orders.header");
  const branding = useTranslations("customers.branding");
  const locale = useLocale();
  // Bumped when the rate is filled in programmatically, so the input shows it.
  const [rateKey, setRateKey] = useState(0);
  const disabled = !editable;
  const text = (value: LocalizedText) => compactText(value);

  const todayRate = defaultSecondaryRate(header.currency, header.secondaryCurrency, rates);
  const setSecondary = (secondaryCurrency: string | null) => {
    const rate = defaultSecondaryRate(header.currency, secondaryCurrency, rates);
    onChange({
      secondaryCurrency,
      secondaryRate: secondaryCurrency ? rate || header.secondaryRate : "",
      documentOptions: { ...header.documentOptions, showSecondaryCurrency: secondaryCurrency !== null },
    });
    setRateKey((key) => key + 1);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>{t("sections.general")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <FormField id="order-customer" label={t("fields.customer")} error={errors.customerId}>
              <SearchableSelect
                id="order-customer"
                name="customerId"
                options={options.customers.map((customer) => ({
                  value: customer.id,
                  label: customer.companyName,
                  flag: customer.country,
                }))}
                defaultValue={header.customerId}
                emptyText={t("noCustomer")}
                disabled={disabled}
                invalid={Boolean(errors.customerId)}
                onValueChange={(customerId) => {
                  if (customerId) onChange({ customerId });
                }}
              />
            </FormField>
          </div>
          <FormField id="order-date" label={t("fields.orderDate")} error={errors.orderDate}>
            <Input
              {...fieldAria("order-date", errors.orderDate)}
              type="date"
              value={header.orderDate}
              disabled={disabled}
              onChange={(event) => onChange({ orderDate: event.target.value })}
            />
          </FormField>
          <FormField id="order-currency" label={t("fields.currency")} error={errors.currency}>
            <OptionSelect
              id="order-currency"
              name="currency"
              defaultValue={header.currency}
              disabled={disabled}
              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
              onValueChange={(currency) => onChange({ currency })}
            />
          </FormField>
          <FormField id="order-incoterm" label={t("fields.incoterm")} error={errors.incoterm}>
            <OptionSelect
              id="order-incoterm"
              name="incoterm"
              defaultValue={header.incoterm}
              disabled={disabled}
              options={CUSTOMER_INCOTERMS.map((code) => ({ value: code, label: code }))}
              onValueChange={(incoterm) => onChange({ incoterm })}
            />
          </FormField>
          <FormField id="order-secondary" label={t("fields.secondaryCurrency")} error={errors.secondaryCurrency}>
            <OptionSelect
              id="order-secondary"
              name="secondaryCurrency"
              defaultValue={header.secondaryCurrency ?? NONE}
              disabled={disabled}
              options={[
                { value: NONE, label: t("none") },
                ...CURRENCIES.filter((code) => code !== header.currency).map((code) => ({ value: code, label: code })),
              ]}
              onValueChange={(value) => setSecondary(value === NONE ? null : value)}
            />
          </FormField>
          {header.secondaryCurrency ? (
            <FormField
              id="order-rate"
              label={t("fields.secondaryRate")}
              error={errors.secondaryRate}
              hint={t("secondaryRateHint", { currency: header.currency, secondary: header.secondaryCurrency })}
            >
              <div className="flex items-center gap-2">
                <DecimalInput
                  key={rateKey}
                  {...fieldAria("order-rate", errors.secondaryRate)}
                  name="secondaryRate"
                  defaultValue={header.secondaryRate}
                  minimumFractionDigits={2}
                  maximumFractionDigits={6}
                  disabled={disabled}
                  onValueChange={(value) => onChange({ secondaryRate: value ?? "" })}
                />
                {editable && todayRate && todayRate !== header.secondaryRate ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={t("useTodayRate", { rate: formatDecimal(todayRate, locale, { minimumFractionDigits: 4 }) })}
                    aria-label={t("useTodayRate", { rate: formatDecimal(todayRate, locale, { minimumFractionDigits: 4 }) })}
                    onClick={() => {
                      onChange({ secondaryRate: todayRate });
                      setRateKey((key) => key + 1);
                    }}
                  >
                    <RefreshCw />
                  </Button>
                ) : null}
              </div>
            </FormField>
          ) : null}
          <TranslatedInput
            id="order-delivery"
            name="deliveryTime"
            label={t("fields.deliveryTime")}
            defaultValue={header.deliveryTime}
            disabled={disabled}
            maxLength={200}
            errors={errors}
            onValueChange={(value) => onChange({ deliveryTime: text(value) })}
          />
          <TranslatedInput
            id="order-payment"
            name="paymentTerms"
            label={t("fields.paymentTerms")}
            defaultValue={header.paymentTerms}
            disabled={disabled}
            maxLength={500}
            errors={errors}
            className="sm:col-span-2"
            onValueChange={(value) => onChange({ paymentTerms: text(value) })}
          />
          {canSeePrices ? (
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
              <FormField id="order-advance" label={t("fields.advance")} error={errors.advanceMode}>
                <OptionSelect
                  id="order-advance"
                  name="advanceMode"
                  defaultValue={header.advanceMode}
                  disabled={disabled || !canWritePrices}
                  options={ADVANCE_MODES.map((mode) => ({ value: mode, label: t(`advanceModes.${mode}`) }))}
                  onValueChange={(mode) => onChange({ advanceMode: mode as EditorHeader["advanceMode"] })}
                />
              </FormField>
              {header.advanceMode !== "none" ? (
                <FormField
                  id="order-advance-value"
                  label={header.advanceMode === "percent" ? t("fields.advancePercent") : t("fields.advanceAmount", { currency: header.currency })}
                  error={errors.advanceValue}
                >
                  <DecimalInput
                    {...fieldAria("order-advance-value", errors.advanceValue)}
                    name="advanceValue"
                    defaultValue={header.advanceValue}
                    disabled={disabled || !canWritePrices}
                    onValueChange={(value) => onChange({ advanceValue: value ?? "" })}
                  />
                </FormField>
              ) : null}
              {!canWritePrices && editable ? (
                <p className="col-span-2 text-xs text-muted-foreground">{t("pricesReadOnly")}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sections.documents")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t("fields.documentOptions")}</legend>
            {DOCUMENT_OPTION_KEYS.map((key) => (
              <Label key={key} className="font-normal">
                <Checkbox
                  checked={header.documentOptions[key]}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      documentOptions: { ...header.documentOptions, [key]: checked === true } as Required<DocumentOptions>,
                    })
                  }
                />
                {t(`documentOptions.${key}`)}
              </Label>
            ))}
          </fieldset>
          <FormField id="order-branding" label={t("fields.labelBranding")} error={errors.labelBranding}>
            <OptionSelect
              id="order-branding"
              name="labelBranding"
              defaultValue={header.labelBranding ?? NONE}
              disabled={disabled}
              options={[
                { value: NONE, label: t("customerDefault") },
                ...LABEL_BRANDINGS.map((value) => ({ value, label: branding(value) })),
              ]}
              onValueChange={(value) =>
                onChange({ labelBranding: value === NONE ? null : (value as EditorHeader["labelBranding"]) })
              }
            />
          </FormField>
          <FormField id="order-template" label={t("fields.labelTemplate")} error={errors.labelTemplateId}>
            <OptionSelect
              id="order-template"
              name="labelTemplateId"
              defaultValue={header.labelTemplateId ?? NONE}
              disabled={disabled}
              options={[
                { value: NONE, label: t("customerDefault") },
                ...options.labelTemplates
                  .filter((template) => template.active || template.id === header.labelTemplateId)
                  .map((template) => ({ value: template.id, label: template.name })),
              ]}
              onValueChange={(value) => onChange({ labelTemplateId: value === NONE ? null : value })}
            />
          </FormField>
        </CardContent>
      </Card>

      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle>{t("sections.notes")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <TranslatedTextarea
            id="order-customer-notes"
            name="customerNotes"
            label={t("fields.customerNotes")}
            hint={t("customerNotesHint")}
            defaultValue={header.customerNotes}
            disabled={disabled}
            maxLength={4000}
            errors={errors}
            onValueChange={(value) => onChange({ customerNotes: text(value) })}
          />
          <TranslatedTextarea
            id="order-production-notes"
            name="productionNotes"
            label={t("fields.productionNotes")}
            hint={t("productionNotesHint")}
            defaultValue={header.productionNotes}
            disabled={disabled}
            maxLength={4000}
            errors={errors}
            onValueChange={(value) => onChange({ productionNotes: text(value) })}
          />
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label className="font-normal">
              <Checkbox
                checked={header.sampleApprovalRequired}
                disabled={disabled}
                onCheckedChange={(checked) => onChange({ sampleApprovalRequired: checked === true })}
              />
              {t("fields.sampleApprovalRequired")}
            </Label>
            {header.sampleApprovalRequired ? (
              <TranslatedInput
                id="order-sample-text"
                name="sampleApprovalText"
                label={t("fields.sampleApprovalText")}
                defaultValue={header.sampleApprovalText}
                disabled={disabled}
                maxLength={1000}
                errors={errors}
                onValueChange={(value) => onChange({ sampleApprovalText: text(value) })}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
