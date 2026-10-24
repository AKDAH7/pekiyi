"use server";

import { eq } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { getLocale } from "next-intl/server";

import { fabrics, modelPiecePrices, modelPresets, models, pieceTypes } from "@/db/schema";
import type { LocalizedText } from "@/db/schema/common";
import { redirect } from "@/i18n/navigation";
import { fail, runMutation } from "@/lib/actions";
import { logAudit, rowSnapshot } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { mayWritePriceFields } from "@/lib/catalog/price-guard";
import { loadVersioned, updateVersioned, VersionConflictError } from "@/lib/db/versioned";
import { dec } from "@/lib/domain/decimal";
import { defaultPackageCount } from "@/lib/domain/labels";
import { formDataToObject } from "@/lib/form-data";
import { fieldErrorsFrom, formError, type FormState } from "@/lib/forms";
import { saveFormImage, settleImages } from "@/lib/uploads";
import {
  createModelSchema,
  createPresetSchema,
  deleteModelSchema,
  deletePresetSchema,
  fabricSchema,
  setFabricActiveSchema,
  updateFabricSchema,
  updateModelSchema,
  updatePiecesSchema,
  updatePresetSchema,
} from "@/lib/validation/catalog";

// Every action: zod → requirePermission (+ the price guard) → transaction
// (optimistic locking + logAudit) via runMutation.

const MODEL_NOT_FOUND = { kind: "form", key: "recordNotFound" } as const;
const CODE_TAKEN = { kind: "field", field: "code", key: "modelCodeTaken" } as const;

export async function createModelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createModelSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("catalog", "create");

  let createdId = "";
  const state = await runMutation(async (tx) => {
    const [created] = await tx
      .insert(models)
      .values({ ...parsed.data, createdBy: actor.id })
      .returning();
    createdId = created.id;
    await logAudit(tx, {
      userId: actor.id,
      entity: "model",
      entityId: created.id,
      action: "create",
      after: rowSnapshot(created),
    });
  }, { unique: { models_code_unique: CODE_TAKEN } });

  if (state.status !== "success") return state;
  redirect({ href: `/products/models/${createdId}`, locale: await getLocale() });
  return state;
}

export async function updateModelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = updateModelSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("catalog", "update");
  const { id, version, photo, removePhoto, ...data } = parsed.data;

  let uploaded: string | null = null;
  if (photo) {
    const saved = await saveFormImage(photo, "models", "photo");
    if ("error" in saved) return saved.error;
    uploaded = saved.key;
  }

  let replaced: string | null = null;
  const state = await runMutation(async (tx) => {
    const before = await loadVersioned(tx, models, { id, version });
    const mainPhotoPath = uploaded ?? (removePhoto ? null : before.mainPhotoPath);
    if (mainPhotoPath !== before.mainPhotoPath) replaced = before.mainPhotoPath;

    const after = await updateVersioned(tx, models, { id, version }, { ...data, mainPhotoPath });
    await logAudit(tx, {
      userId: actor.id,
      entity: "model",
      entityId: id,
      action: before.active === after.active ? "update" : after.active ? "reactivate" : "deactivate",
      before: rowSnapshot(before),
      after: rowSnapshot(after),
    });
  }, { unique: { models_code_unique: CODE_TAKEN } });
  await settleImages(state, { uploaded, replaced });
  return state;
}

/** Only models no order, order piece or customer code refers to can be deleted. */
export async function deleteModelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = deleteModelSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError("invalid");

  const actor = await requirePermission("catalog", "delete");
  const { id, version } = parsed.data;

  let photo: string | null = null;
  const state = await runMutation(async (tx) => {
    const before = await loadVersioned(tx, models, { id, version });
    photo = before.mainPhotoPath;
    await tx.delete(models).where(eq(models.id, id));
    await logAudit(tx, {
      userId: actor.id,
      entity: "model",
      entityId: id,
      action: "delete",
      before: rowSnapshot(before),
    });
  }, { inUse: { kind: "form", key: "modelInUse" } });

  if (state.status !== "success") return state;
  await settleImages(state, { uploaded: null, replaced: photo });
  redirect({ href: "/products", locale: await getLocale() });
  return state;
}

function sameDecimal(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return dec(a).equals(b);
}

function sameText(a: LocalizedText | null, b: LocalizedText | null): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].every((key) => a?.[key as keyof LocalizedText] === b?.[key as keyof LocalizedText]);
}

/**
 * Saves the whole piece table of a model at once. Each existing row is
 * checked against the version it was loaded with; one stale row rolls back
 * the entire save. Rows without an id are created only when something was
 * filled in. Price fields are written only for `prices.update` holders, and
 * anyone else sending them gets a 403.
 */
export async function updatePiecesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = updatePiecesSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("catalog", "update");
  if (!mayWritePriceFields(actor.role, "modelPiecePrices", parsed.data.pieces)) forbidden();
  const writesPrices = can(actor.role, "prices", "update");
  const { modelId, pieces } = parsed.data;

  return runMutation(async (tx) => {
    const [model] = await tx.select({ id: models.id }).from(models).where(eq(models.id, modelId));
    if (!model) fail(MODEL_NOT_FOUND);
    const types = await tx.select().from(pieceTypes);
    const existing = await tx.select().from(modelPiecePrices).where(eq(modelPiecePrices.modelId, modelId));
    const accessories = { accessoryPieceTypes: types.filter((t) => t.isAccessory).map((t) => t.code) };

    for (const row of pieces) {
      const type = types.find((entry) => entry.id === row.pieceTypeId);
      if (!type) fail({ kind: "form", key: "invalid" });

      const packing = {
        unitCbm: row.unitCbm ?? null,
        unitWeightKg: row.unitWeightKg ?? null,
        packageCount: row.packageCount ?? defaultPackageCount(type.code, accessories),
        packageContents: row.packageContents,
      };
      const prices = writesPrices
        ? { basePrice: row.basePrice ?? null, baseCurrency: row.baseCurrency ?? "TRY" }
        : {};
      const current = existing.find((entry) => entry.pieceTypeId === row.pieceTypeId);

      if (row.id) {
        if (!current || current.id !== row.id || current.version !== row.version) {
          throw new VersionConflictError("model_piece_prices", row.id);
        }
        const unchanged =
          sameDecimal(current.unitCbm, packing.unitCbm) &&
          sameDecimal(current.unitWeightKg, packing.unitWeightKg) &&
          current.packageCount === packing.packageCount &&
          sameText(current.packageContents, packing.packageContents) &&
          (!writesPrices ||
            (sameDecimal(current.basePrice, prices.basePrice ?? null) &&
              current.baseCurrency === prices.baseCurrency));
        if (unchanged) continue;

        const after = await updateVersioned(
          tx,
          modelPiecePrices,
          { id: row.id, version: row.version! },
          { ...packing, ...prices },
        );
        await logAudit(tx, {
          userId: actor.id,
          entity: "model_piece_price",
          entityId: row.id,
          action: "update",
          before: rowSnapshot(current),
          after: rowSnapshot(after),
        });
      } else {
        // Someone else created this row after our page loaded.
        if (current) throw new VersionConflictError("model_piece_prices", current.id);
        const empty =
          packing.unitCbm === null &&
          packing.unitWeightKg === null &&
          packing.packageContents === null &&
          packing.packageCount === defaultPackageCount(type.code, accessories) &&
          (prices.basePrice ?? null) === null;
        if (empty) continue;

        const [created] = await tx
          .insert(modelPiecePrices)
          .values({ modelId, pieceTypeId: type.id, ...packing, ...prices, createdBy: actor.id })
          .returning();
        await logAudit(tx, {
          userId: actor.id,
          entity: "model_piece_price",
          entityId: created.id,
          action: "create",
          after: rowSnapshot(created),
        });
      }
    }
  });
}

const PRESET_EXISTS = { kind: "field", field: "composition", key: "presetExists" } as const;

export async function createPresetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createPresetSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("catalog", "create");
  if (!mayWritePriceFields(actor.role, "modelPresets", [parsed.data])) forbidden();
  const { modelId, composition, fixedPrice, currency } = parsed.data;

  return runMutation(async (tx) => {
    const [model] = await tx.select({ id: models.id }).from(models).where(eq(models.id, modelId));
    if (!model) fail(MODEL_NOT_FOUND);
    const [created] = await tx
      .insert(modelPresets)
      .values({
        modelId,
        composition,
        fixedPrice: fixedPrice ?? null,
        ...(currency ? { currency } : {}),
        createdBy: actor.id,
      })
      .returning();
    await logAudit(tx, {
      userId: actor.id,
      entity: "model_preset",
      entityId: created.id,
      action: "create",
      after: rowSnapshot(created),
    });
  }, { unique: { model_presets_model_composition_unique: PRESET_EXISTS } });
}

export async function updatePresetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = updatePresetSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("catalog", "update");
  if (!mayWritePriceFields(actor.role, "modelPresets", [parsed.data])) forbidden();
  const { id, version, composition, fixedPrice, currency } = parsed.data;
  const writesPrices = can(actor.role, "prices", "update");

  return runMutation(async (tx) => {
    const before = await loadVersioned(tx, modelPresets, { id, version });
    const after = await updateVersioned(
      tx,
      modelPresets,
      { id, version },
      writesPrices
        ? { composition, fixedPrice: fixedPrice ?? null, currency: currency ?? before.currency }
        : { composition },
    );
    await logAudit(tx, {
      userId: actor.id,
      entity: "model_preset",
      entityId: id,
      action: "update",
      before: rowSnapshot(before),
      after: rowSnapshot(after),
    });
  }, { unique: { model_presets_model_composition_unique: PRESET_EXISTS } });
}

export async function deletePresetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = deletePresetSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError("invalid");

  const actor = await requirePermission("catalog", "delete");
  const { id, version } = parsed.data;

  return runMutation(async (tx) => {
    const before = await loadVersioned(tx, modelPresets, { id, version });
    await tx.delete(modelPresets).where(eq(modelPresets.id, id));
    await logAudit(tx, {
      userId: actor.id,
      entity: "model_preset",
      entityId: id,
      action: "delete",
      before: rowSnapshot(before),
    });
  });
}

const FABRIC_EXISTS = { kind: "field", field: "code", key: "fabricExists" } as const;

export async function createFabricAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = fabricSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("catalog", "create");

  return runMutation(async (tx) => {
    const [created] = await tx
      .insert(fabrics)
      .values({ ...parsed.data, active: true, createdBy: actor.id })
      .returning();
    await logAudit(tx, {
      userId: actor.id,
      entity: "fabric",
      entityId: created.id,
      action: "create",
      after: rowSnapshot(created),
    });
  }, { unique: { fabrics_brand_code_unique: FABRIC_EXISTS } });
}

export async function updateFabricAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = updateFabricSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const actor = await requirePermission("catalog", "update");
  const { id, version, ...data } = parsed.data;

  return runMutation(async (tx) => {
    const before = await loadVersioned(tx, fabrics, { id, version });
    const after = await updateVersioned(tx, fabrics, { id, version }, data);
    await logAudit(tx, {
      userId: actor.id,
      entity: "fabric",
      entityId: id,
      action: before.active === after.active ? "update" : after.active ? "reactivate" : "deactivate",
      before: rowSnapshot(before),
      after: rowSnapshot(after),
    });
  }, { unique: { fabrics_brand_code_unique: FABRIC_EXISTS } });
}

export async function setFabricActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = setFabricActiveSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError("invalid");

  const actor = await requirePermission("catalog", "update");
  const { id, version } = parsed.data;
  const active = parsed.data.active === "true";

  return runMutation(async (tx) => {
    const before = await loadVersioned(tx, fabrics, { id, version });
    if (before.active === active) return;
    const after = await updateVersioned(tx, fabrics, { id, version }, { active });
    await logAudit(tx, {
      userId: actor.id,
      entity: "fabric",
      entityId: id,
      action: active ? "reactivate" : "deactivate",
      before: rowSnapshot(before),
      after: rowSnapshot(after),
    });
  });
}
