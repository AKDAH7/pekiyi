import { z } from "zod";

import { normalizeComposition } from "@/lib/domain/composition";

import {
  checkbox,
  currency,
  decimal,
  id,
  localizedOptional,
  localizedRequired,
  moneyValue,
  optionalFile,
  optionalText,
  requiredText,
  version,
} from "./common";

/** Model codes as written on our sheets: "ZERDA", "İKLİM", "VERA 2". */
const modelCode = requiredText(40)
  .transform((value) => value.toLocaleUpperCase("tr"))
  .pipe(z.string().regex(/^[\p{Lu}\p{N}][\p{Lu}\p{N} .\-/]*$/u, { error: "invalidCode" }));

export const createModelSchema = z.object({
  code: modelCode,
  name: localizedRequired(100),
  isSofabed: checkbox,
});

export const updateModelSchema = z.object({
  id,
  version,
  code: modelCode,
  name: localizedRequired(100),
  description: localizedOptional(2000),
  isSofabed: checkbox,
  active: checkbox,
  photo: optionalFile,
  removePhoto: checkbox,
});

export const deleteModelSchema = z.object({ id, version });

const packageCount = z.coerce
  .number({ error: "invalidNumber" })
  .int({ error: "wholeNumber" })
  .min(0, { error: "invalidNumber" })
  .max(99, { error: "numberTooLarge" });

/**
 * One row of the piece table. A row that doesn't exist yet has no id/version.
 * `basePrice` / `baseCurrency` are price fields: their inputs are only
 * rendered for users with `prices.update`, and the action refuses them (403)
 * from anyone else — see lib/catalog/price-guard.ts.
 */
const pieceRow = z.object({
  pieceTypeId: id,
  id: id.optional(),
  version: version.optional(),
  basePrice: moneyValue,
  baseCurrency: currency.optional(),
  unitCbm: decimal({ scale: 3, integerDigits: 5, positive: true }),
  unitWeightKg: decimal({ scale: 2, integerDigits: 6, positive: true }),
  packageCount: z.preprocess((value) => (value === "" ? undefined : value), packageCount.optional()),
  packageContents: localizedOptional(200),
});

export type PieceRowInput = z.infer<typeof pieceRow>;

export const updatePiecesSchema = z.object({
  modelId: id,
  pieces: z.array(pieceRow).max(50),
});

const composition = requiredText(40).transform((value, ctx) => {
  const normalized = normalizeComposition(value);
  if (normalized === null || normalized === "") {
    ctx.addIssue({ code: "custom", message: "invalidComposition" });
    return z.NEVER;
  }
  return normalized;
});

/** `fixedPrice` / `currency` are price fields, guarded like the piece prices. */
export const createPresetSchema = z.object({
  modelId: id,
  composition,
  fixedPrice: moneyValue,
  currency: currency.optional(),
});

export const updatePresetSchema = createPresetSchema.extend({ id, version });

export const deletePresetSchema = z.object({ id, version });

export const fabricSchema = z.object({
  brand: requiredText(60).transform((value) => value.toLocaleUpperCase("tr")),
  code: requiredText(60),
  colorKey: optionalText(60),
  colorName: localizedOptional(100),
  active: checkbox,
});

export const updateFabricSchema = fabricSchema.extend({ id, version });

export const setFabricActiveSchema = z.object({ id, version, active: z.enum(["true", "false"]) });

const searchText = z.string().trim().max(100).optional().catch(undefined);

export const modelsSearchSchema = z.object({
  q: searchText,
  status: z.enum(["all", "active", "inactive"]).optional().catch(undefined),
  missing: z.enum(["all", "any", "prices", "cbm"]).optional().catch(undefined),
});

export const fabricsSearchSchema = z.object({
  q: searchText,
  status: z.enum(["all", "active", "inactive"]).optional().catch(undefined),
});
