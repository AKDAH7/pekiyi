import "server-only";

import { countryOptions } from "@/lib/domain/countries";
import { pickLocalized } from "@/lib/i18n/localized";

import { listLabelTemplateOptions } from "./queries";

/** Choices of the customer form, with names in the UI language. */
export async function customerFormOptions(locale: string, currentTemplateId?: string | null) {
  const templates = await listLabelTemplateOptions();
  const countries = countryOptions(locale);
  return {
    countries: countries.map(({ code, name }) => ({ value: code, label: name, keywords: code, flag: code })),
    countryNames: Object.fromEntries(countries.map(({ code, name }) => [code, name])),
    // Inactive templates are hidden unless the customer already uses one.
    labelTemplates: templates
      .filter((template) => template.active || template.id === currentTemplateId)
      .map((template) => ({ value: template.id, label: pickLocalized(template.name, locale) })),
  };
}
