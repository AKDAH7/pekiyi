"use server";

import { and, eq, ne } from "drizzle-orm";

import { bankAccounts, companySettings, exchangeRates } from "@/db/schema";
import { fail, runMutation } from "@/lib/actions";
import { logAudit, rowSnapshot } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { loadVersioned, updateVersioned } from "@/lib/db/versioned";
import { dec } from "@/lib/domain/decimal";
import { formDataToObject } from "@/lib/form-data";
import { fieldErrorsFrom, formError, type FormState } from "@/lib/forms";
import { saveFormImage, settleImages } from "@/lib/uploads";
import {
  addRatesSchema,
  bankAccountSchema,
  companySettingsSchema,
  setBankAccountActiveSchema,
  updateBankAccountSchema,
  updateRatesSchema,
} from "@/lib/validation/settings";

// Every action: zod → requirePermission → transaction (optimistic locking +
// logAudit) via runMutation.

export async function updateCompanySettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = companySettingsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("settings", "update");
  const { version, logo, removeLogo, ...data } = parsed.data;

  let uploaded: string | null = null;
  if (logo) {
    const saved = await saveFormImage(logo, "company", "logo");
    if ("error" in saved) return saved.error;
    uploaded = saved.key;
  }

  let replaced: string | null = null;
  const state = await runMutation(async (tx) => {
    const before = await loadVersioned(tx, companySettings, { id: 1, version });
    const logoPath = uploaded ?? (removeLogo ? null : before.logoPath);
    if (logoPath !== before.logoPath) replaced = before.logoPath;

    const after = await updateVersioned(tx, companySettings, { id: 1, version }, { ...data, logoPath });
    await logAudit(tx, {
      userId: actor.id,
      entity: "company_settings",
      entityId: "1",
      action: "update",
      before: rowSnapshot(before),
      after: rowSnapshot(after),
    });
  });
  await settleImages(state, { uploaded, replaced });
  return state;
}

const IBAN_TAKEN = { kind: "field", field: "iban", key: "ibanTaken" } as const;
const CURRENCY_HAS_ACTIVE = { kind: "field", field: "currency", key: "activeAccountExists" } as const;

const BANK_UNIQUE = {
  bank_accounts_iban_unique: IBAN_TAKEN,
  bank_accounts_active_currency_unique: CURRENCY_HAS_ACTIVE,
};

export async function createBankAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = bankAccountSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("settings", "update");

  return runMutation(async (tx) => {
    const [active] = await tx
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.currency, parsed.data.currency), eq(bankAccounts.active, true)));
    if (active) fail(CURRENCY_HAS_ACTIVE);

    const [created] = await tx
      .insert(bankAccounts)
      .values({ ...parsed.data, createdBy: actor.id })
      .returning();
    await logAudit(tx, {
      userId: actor.id,
      entity: "bank_account",
      entityId: created.id,
      action: "create",
      after: rowSnapshot(created),
    });
  }, { unique: BANK_UNIQUE });
}

export async function updateBankAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = updateBankAccountSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("settings", "update");
  const { id, version, ...data } = parsed.data;

  return runMutation(async (tx) => {
    const before = await loadVersioned(tx, bankAccounts, { id, version });
    if (before.active && data.currency !== before.currency) {
      const [other] = await tx
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(
          and(eq(bankAccounts.currency, data.currency), eq(bankAccounts.active, true), ne(bankAccounts.id, id)),
        );
      if (other) fail(CURRENCY_HAS_ACTIVE);
    }

    const after = await updateVersioned(tx, bankAccounts, { id, version }, data);
    await logAudit(tx, {
      userId: actor.id,
      entity: "bank_account",
      entityId: id,
      action: "update",
      before: rowSnapshot(before),
      after: rowSnapshot(after),
    });
  }, { unique: BANK_UNIQUE });
}

export async function setBankAccountActiveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = setBankAccountActiveSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError("invalid");

  const actor = await requirePermission("settings", "update");
  const { id, version } = parsed.data;
  const active = parsed.data.active === "true";
  const ACTIVE_EXISTS = { kind: "form", key: "activeAccountExists" } as const;

  return runMutation(async (tx) => {
    const before = await loadVersioned(tx, bankAccounts, { id, version });
    if (before.active === active) return;
    if (active) {
      const [other] = await tx
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.currency, before.currency), eq(bankAccounts.active, true)));
      if (other) fail(ACTIVE_EXISTS);
    }

    const after = await updateVersioned(tx, bankAccounts, { id, version }, { active });
    await logAudit(tx, {
      userId: actor.id,
      entity: "bank_account",
      entityId: id,
      action: active ? "reactivate" : "deactivate",
      before: rowSnapshot(before),
      after: rowSnapshot(after),
    });
  }, { unique: { bank_accounts_active_currency_unique: ACTIVE_EXISTS } });
}

const RATES_EXIST = { kind: "field", field: "date", key: "ratesExist" } as const;

export async function addRatesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = addRatesSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("settings", "update");
  const { date, usdTry, eurTry } = parsed.data;

  return runMutation(async (tx) => {
    const existing = await tx
      .select({ id: exchangeRates.id })
      .from(exchangeRates)
      .where(and(eq(exchangeRates.date, date), eq(exchangeRates.toCurrency, "TRY")));
    if (existing.length > 0) fail(RATES_EXIST);

    const rows = await tx
      .insert(exchangeRates)
      .values([
        { date, fromCurrency: "USD", toCurrency: "TRY", rate: usdTry!, createdBy: actor.id },
        { date, fromCurrency: "EUR", toCurrency: "TRY", rate: eurTry!, createdBy: actor.id },
      ])
      .returning();
    for (const row of rows) {
      await logAudit(tx, {
        userId: actor.id,
        entity: "exchange_rate",
        entityId: row.id,
        action: "create",
        after: rowSnapshot(row),
      });
    }
  }, { unique: { exchange_rates_date_pair_unique: RATES_EXIST } });
}

export async function updateRatesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = updateRatesSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("settings", "update");
  const { usdId, usdVersion, eurId, eurVersion, usdTry, eurTry } = parsed.data;

  return runMutation(async (tx) => {
    for (const [expected, rate] of [
      [{ id: usdId, version: usdVersion }, usdTry!],
      [{ id: eurId, version: eurVersion }, eurTry!],
    ] as const) {
      const before = await loadVersioned(tx, exchangeRates, expected);
      // The date and pair are fixed; only the rate is corrected.
      if (dec(before.rate).equals(rate)) continue;
      const after = await updateVersioned(tx, exchangeRates, expected, { rate });
      await logAudit(tx, {
        userId: actor.id,
        entity: "exchange_rate",
        entityId: expected.id,
        action: "update",
        before: rowSnapshot(before),
        after: rowSnapshot(after),
      });
    }
  });
}
