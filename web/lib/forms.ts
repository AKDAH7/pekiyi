import "server-only";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import type { FormState } from "./form-state";

export type { FormState };

/** Translates a zod error into `{ field: message }` (first error per field). */
export async function fieldErrorsFrom(error: z.ZodError): Promise<FormState> {
  const t = await getTranslations("validation");
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
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
