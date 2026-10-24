"use server";

import { count, eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";

import { customerProductCodes, customers, orders } from "@/db/schema";
import { redirect } from "@/i18n/navigation";
import { fail, runMutation } from "@/lib/actions";
import { logAudit, rowSnapshot } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import type { CustomerFormState } from "@/lib/customers/form-state";
import { listDuplicateCandidates } from "@/lib/customers/queries";
import { loadVersioned, updateVersioned } from "@/lib/db/versioned";
import { findDuplicates } from "@/lib/domain/duplicates";
import { formDataToObject } from "@/lib/form-data";
import { fieldError, fieldErrorsFrom, formError, type FormState } from "@/lib/forms";
import { saveFormImage, settleImages } from "@/lib/uploads";
import {
  createCustomerSchema,
  createProductCodeSchema,
  deleteCustomerSchema,
  deleteProductCodeSchema,
  setCustomerActiveSchema,
  updateCustomerSchema,
  updateProductCodeSchema,
} from "@/lib/validation/customers";

// Every action: zod → requirePermission → transaction (optimistic locking +
// logAudit) via runMutation.

const NOT_FOUND = { kind: "form", key: "recordNotFound" } as const;
const TEMPLATE_NOT_FOUND = { kind: "field", field: "defaultLabelTemplateId", key: "recordNotFound" } as const;
const LOGO_REQUIRED = { kind: "field", field: "logo", key: "logoRequired" } as const;

export async function createCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const parsed = createCustomerSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("customers", "create");
  const { confirmDuplicates, logo, ...data } = parsed.data;

  if (!confirmDuplicates) {
    const matches = findDuplicates(data, await listDuplicateCandidates());
    if (matches.length > 0) {
      return {
        status: "error",
        duplicates: matches.map(({ customer, reasons }) => ({
          id: customer.id,
          companyName: customer.companyName,
          country: customer.country,
          city: customer.city,
          active: customer.active,
          reasons,
        })),
      };
    }
  }
  if (data.labelBranding === "customer_logo" && !logo) return fieldError(LOGO_REQUIRED.field, LOGO_REQUIRED.key);

  let uploaded: string | null = null;
  if (logo) {
    const saved = await saveFormImage(logo, "customers", "logo");
    if ("error" in saved) return saved.error;
    uploaded = saved.key;
  }

  let createdId = "";
  const state = await runMutation(async (tx) => {
    const [created] = await tx
      .insert(customers)
      .values({ ...data, logoPath: uploaded, createdBy: actor.id })
      .returning();
    createdId = created.id;
    await logAudit(tx, {
      userId: actor.id,
      entity: "customer",
      entityId: created.id,
      action: "create",
      after: rowSnapshot(created),
    });
  }, { inUse: TEMPLATE_NOT_FOUND });
  await settleImages(state, { uploaded, replaced: null });

  if (state.status !== "success") return state;
  redirect({ href: `/customers/${createdId}`, locale: await getLocale() });
  return state;
}

export async function updateCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = updateCustomerSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("customers", "update");
  const { id, version, logo, removeLogo, ...data } = parsed.data;

  let uploaded: string | null = null;
  if (logo) {
    const saved = await saveFormImage(logo, "customers", "logo");
    if ("error" in saved) return saved.error;
    uploaded = saved.key;
  }

  let replaced: string | null = null;
  const state = await runMutation(async (tx) => {
    const before = await loadVersioned(tx, customers, { id, version });
    const logoPath = uploaded ?? (removeLogo ? null : before.logoPath);
    if (data.labelBranding === "customer_logo" && !logoPath) fail(LOGO_REQUIRED);
    if (logoPath !== before.logoPath) replaced = before.logoPath;

    const after = await updateVersioned(tx, customers, { id, version }, { ...data, logoPath });
    await logAudit(tx, {
      userId: actor.id,
      entity: "customer",
      entityId: id,
      action: before.active === after.active ? "update" : after.active ? "reactivate" : "deactivate",
      before: rowSnapshot(before),
      after: rowSnapshot(after),
    });
  }, { inUse: TEMPLATE_NOT_FOUND });
  await settleImages(state, { uploaded, replaced });

  if (state.status !== "success") return state;
  redirect({ href: `/customers/${id}`, locale: await getLocale() });
  return state;
}

export async function setCustomerActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = setCustomerActiveSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError("invalid");

  const actor = await requirePermission("customers", "update");
  const { id, version } = parsed.data;
  const active = parsed.data.active === "true";

  return runMutation(async (tx) => {
    const before = await loadVersioned(tx, customers, { id, version });
    if (before.active === active) return;
    const after = await updateVersioned(tx, customers, { id, version }, { active });
    await logAudit(tx, {
      userId: actor.id,
      entity: "customer",
      entityId: id,
      action: active ? "reactivate" : "deactivate",
      before: rowSnapshot(before),
      after: rowSnapshot(after),
    });
  });
}

/** Admin only, and only for customers without orders; everyone else deactivates. */
export async function deleteCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = deleteCustomerSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError("invalid");

  const actor = await requirePermission("customers", "delete");
  const { id, version } = parsed.data;
  const HAS_ORDERS = { kind: "form", key: "customerHasOrders" } as const;

  let logo: string | null = null;
  const state = await runMutation(async (tx) => {
    const before = await loadVersioned(tx, customers, { id, version });
    const [{ orderCount }] = await tx
      .select({ orderCount: count() })
      .from(orders)
      .where(eq(orders.customerId, id));
    if (orderCount > 0) fail(HAS_ORDERS);
    logo = before.logoPath;

    // The product codes go with the customer (cascade); log them too.
    const codes = await tx.select().from(customerProductCodes).where(eq(customerProductCodes.customerId, id));
    await tx.delete(customers).where(eq(customers.id, id));
    for (const code of codes) {
      await logAudit(tx, {
        userId: actor.id,
        entity: "customer_product_code",
        entityId: code.id,
        action: "delete",
        before: rowSnapshot(code),
      });
    }
    await logAudit(tx, {
      userId: actor.id,
      entity: "customer",
      entityId: id,
      action: "delete",
      before: rowSnapshot(before),
    });
  }, { inUse: HAS_ORDERS });

  if (state.status !== "success") return state;
  await settleImages(state, { uploaded: null, replaced: logo });
  redirect({ href: "/customers", locale: await getLocale() });
  return state;
}

const PRODUCT_CODE_UNIQUE = {
  customer_product_codes_customer_barcode_unique: { kind: "field", field: "barcode", key: "barcodeTaken" },
  customer_product_codes_customer_product_unique: { kind: "form", key: "productCodeExists" },
} as const;

/** Product codes belong to the customer: editing them is editing the customer. */
export async function createProductCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createProductCodeSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("customers", "update");

  return runMutation(async (tx) => {
    const [created] = await tx
      .insert(customerProductCodes)
      .values({ ...parsed.data, createdBy: actor.id })
      .returning();
    await logAudit(tx, {
      userId: actor.id,
      entity: "customer_product_code",
      entityId: created.id,
      action: "create",
      after: rowSnapshot(created),
    });
  }, { unique: PRODUCT_CODE_UNIQUE, inUse: NOT_FOUND });
}

export async function updateProductCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = updateProductCodeSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("customers", "update");
  const { id, version, ...data } = parsed.data;

  return runMutation(async (tx) => {
    const before = await loadVersioned(tx, customerProductCodes, { id, version });
    const after = await updateVersioned(tx, customerProductCodes, { id, version }, data);
    await logAudit(tx, {
      userId: actor.id,
      entity: "customer_product_code",
      entityId: id,
      action: "update",
      before: rowSnapshot(before),
      after: rowSnapshot(after),
    });
  }, { unique: PRODUCT_CODE_UNIQUE, inUse: NOT_FOUND });
}

export async function deleteProductCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = deleteProductCodeSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError("invalid");

  const actor = await requirePermission("customers", "update");
  const { id, version } = parsed.data;

  return runMutation(async (tx) => {
    const before = await loadVersioned(tx, customerProductCodes, { id, version });
    await tx.delete(customerProductCodes).where(eq(customerProductCodes.id, id));
    await logAudit(tx, {
      userId: actor.id,
      entity: "customer_product_code",
      entityId: id,
      action: "delete",
      before: rowSnapshot(before),
    });
  });
}
