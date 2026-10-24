import "server-only";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import type { FormState } from "./form-state";

export type { FormState };

/**
 * Translates a zod error into `{ field: message }` (first error per field).
 * Nested fields are keyed by their dotted path: "name.tr", "pieces.2.unitCbm".
 */
export async function fieldErrorsFrom(error: z.ZodError): Promise<FormState> {
  const t = await getTranslations("validation");
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.map(String).join(".");
    if (!field || fieldErrors[field]) continue;
    fieldErrors[field] = t.has(issue.message) ? t(issue.message) : t("invalid");
  }
  return { status: "error", fieldErrors };
}

export async function fieldError(field: string, key: string): Promise<FormState> {
  const t = await getTranslations("validation");
  return { status: "error", fieldErrors: { [field]: t(key) } };
}

export async function formError(key: string): Promise<FormState> {
  const t = await getTranslations("validation");
  return { status: "error", formError: t(key) };
}

export function success(): FormState {
  return { status: "success", successAt: Date.now() };
}

/** "This record was changed by someone else — reload" (optimistic locking). */
export async function conflict(): Promise<FormState> {
  const t = await getTranslations("validation");
  return { status: "error", conflict: true, formError: t("conflict") };
}
