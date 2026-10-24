"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { createPresetAction, deletePresetAction, updatePresetAction } from "@/actions/catalog";
import { useFormAction } from "@/hooks/use-form-action";
import { useVersionedForm } from "@/hooks/use-versioned-form";
import { normalizeComposition, parseComposition } from "@/lib/domain/composition";
import { suggestUnitPrice } from "@/lib/domain/pricing";
import { findCatalogPiece, type Catalog, type RatesToTry } from "@/lib/domain/types";
import { formatDecimal } from "@/lib/format/number";
import { CURRENCIES } from "@/lib/validation/currencies";
import { DecimalInput } from "@/components/decimal-input";
import { FormField, fieldAria } from "@/components/form-field";
import { FormStatus } from "@/components/form-status";
import { OptionSelect } from "@/components/option-select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type PresetItem = {
  id: string;
  version: number;
  composition: string;
  /** Only sent to the client for roles with `prices.read`. */
  fixedPrice: string | null;
  currency: string | null;
};

type PricingContext = {
  modelCode: string;
  catalog: Catalog;
  /** Latest rates to TRY: { USD: "49", EUR: "55.8" } */
  rates: RatesToTry;
  /** Piece type code → name in the UI language. */
  pieceNames: Record<string, string>;
};

const TARGETS = ["TRY", "USD", "EUR"] as const;

type Suggestion = {
  values: Record<(typeof TARGETS)[number], string | null>;
  /** Why some values are missing (already translated), or null. */
  reason: string | null;
};

/**
 * Suggested set price in TRY/USD/EUR exactly as orders will suggest it
 * (suggestUnitPrice): the fixed price if the preset has one, otherwise the
 * sum of the piece prices, converted at the latest rates.
 */
function useSuggest(context: PricingContext) {
  const t = useTranslations("catalog.presets");

  return (composition: string, fixedPrice: string | null, currency: string | null): Suggestion | null => {
    const parsed = parseComposition(composition);
    const normalized = normalizeComposition(composition);
    if (!parsed.ok || !normalized) return null;

    // This preset as typed replaces whatever the catalog has for that composition.
    const catalog: Catalog = {
      ...context.catalog,
      presets: [
        ...context.catalog.presets.filter((preset) => normalizeComposition(preset.composition) !== normalized),
        ...(fixedPrice
          ? [{ model: context.modelCode, composition: normalized, fixedPrice, currency: currency ?? "TRY" }]
          : []),
      ],
    };
    const line = {
      model: context.modelCode,
      composition: normalized,
      pieces: parsed.pieces.map((piece) => ({ pieceType: piece.pieceType, qtyPerUnit: piece.qty })),
    };
    const values = Object.fromEntries(
      TARGETS.map((target) => [target, suggestUnitPrice(line, catalog, context.rates, target)]),
    ) as Suggestion["values"];

    let reason: string | null = null;
    if (TARGETS.some((target) => values[target] === null)) {
      const unpriced = fixedPrice
        ? []
        : line.pieces
            .filter((piece) => {
              const entry = findCatalogPiece(catalog, context.modelCode, piece.pieceType);
              return (!entry || entry.basePrice === null) && !catalog.accessoryPieceTypes.includes(piece.pieceType);
            })
            .map((piece) => context.pieceNames[piece.pieceType] ?? piece.pieceType);
      reason = unpriced.length > 0 ? t("missingPiecePrice", { pieces: unpriced.join(", ") }) : t("missingRate");
    }
    return { values, reason };
  };
}

function SuggestedValue({ value, reason }: { value: string | null; reason: string | null }) {
  const locale = useLocale();
  if (value !== null) {
    return (
      <span dir="ltr" className="tabular-nums">
        {formatDecimal(value, locale)}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span tabIndex={0} aria-label={reason ?? undefined} className="cursor-help border-b border-dotted" />}
      >
        —
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

type Permissions = {
  canCreate: boolean;
  canEdit: boolean;
  canEditPrices: boolean;
  canDelete: boolean;
  canSeePrices: boolean;
};

function PresetFields({
  preset,
  errors,
  context,
  canEditPrices,
  canSeePrices,
}: {
  preset?: PresetItem;
  errors: Record<string, string>;
  context: PricingContext;
  canEditPrices: boolean;
  canSeePrices: boolean;
}) {
  const t = useTranslations("catalog.presets");
  const prefix = preset ? `preset-${preset.id}` : "preset-new";
  const suggest = useSuggest(context);
  const [composition, setComposition] = useState(preset?.composition ?? "");
  const [fixedPrice, setFixedPrice] = useState<string | null>(preset?.fixedPrice ?? null);
  const [currency, setCurrency] = useState<string>(preset?.currency ?? "USD");
  const suggestion = suggest(composition, fixedPrice, currency);

  return (
    <>
      <FormField id={`${prefix}-composition`} label={t("composition")} error={errors.composition} hint={t("compositionHint")}>
        <Input
          {...fieldAria(`${prefix}-composition`, errors.composition)}
          name="composition"
          dir="ltr"
          className="text-start font-mono"
          value={composition}
          onChange={(event) => setComposition(event.target.value)}
          placeholder="3+3+1+1"
        />
      </FormField>
      {canEditPrices ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <FormField id={`${prefix}-price`} label={t("fixedPrice")} error={errors.fixedPrice} hint={t("fixedPriceHint")}>
            <DecimalInput
              {...fieldAria(`${prefix}-price`, errors.fixedPrice)}
              name="fixedPrice"
              defaultValue={preset?.fixedPrice}
              onValueChange={setFixedPrice}
            />
          </FormField>
          <FormField id={`${prefix}-currency`} label={t("currency")} error={errors.currency}>
            <div className="w-24">
              <OptionSelect
                id={`${prefix}-currency`}
                name="currency"
                defaultValue={currency}
                options={CURRENCIES.map((code) => ({ value: code, label: code }))}
                onValueChange={setCurrency}
              />
            </div>
          </FormField>
        </div>
      ) : null}
      {canSeePrices ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="mb-2 font-medium">{t("suggested")}</p>
          {suggestion ? (
            <dl className="grid grid-cols-3 gap-2">
              {TARGETS.map((target) => (
                <div key={target} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{target}</dt>
                  <dd>
                    <SuggestedValue value={suggestion.values[target]} reason={suggestion.reason} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-muted-foreground">{t("typeComposition")}</p>
          )}
        </div>
      ) : null}
    </>
  );
}

function FormFooter({ pending, submitLabel }: { pending: boolean; submitLabel: string }) {
  const common = useTranslations("common");
  return (
    <DialogFooter>
      <DialogClose render={<Button type="button" variant="outline" />}>{common("cancel")}</DialogClose>
      <Button type="submit" disabled={pending}>
        {pending ? common("saving") : submitLabel}
      </Button>
    </DialogFooter>
  );
}

function CreatePresetForm({
  modelId,
  context,
  permissions,
  onDone,
}: {
  modelId: string;
  context: PricingContext;
  permissions: Permissions;
  onDone: () => void;
}) {
  const t = useTranslations("catalog.presets");
  const { state, pending, onSubmit } = useFormAction(createPresetAction, onDone);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="modelId" value={modelId} />
      <PresetFields
        errors={state.fieldErrors ?? {}}
        context={context}
        canEditPrices={permissions.canEditPrices}
        canSeePrices={permissions.canSeePrices}
      />
      <FormStatus state={state} />
      <FormFooter pending={pending} submitLabel={t("add")} />
    </form>
  );
}

function EditPresetForm({
  modelId,
  preset,
  context,
  permissions,
  onDone,
}: {
  modelId: string;
  preset: PresetItem;
  context: PricingContext;
  permissions: Permissions;
  onDone: () => void;
}) {
  const common = useTranslations("common");
  const { state, pending, onSubmit, conflict } = useVersionedForm(updatePresetAction, preset.version, onDone);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="modelId" value={modelId} />
      <input type="hidden" name="id" value={preset.id} />
      <input type="hidden" name="version" value={preset.version} />
      <div key={preset.version} className="flex flex-col gap-4">
        <PresetFields
          preset={preset}
          errors={state.fieldErrors ?? {}}
          context={context}
          canEditPrices={permissions.canEditPrices}
          canSeePrices={permissions.canSeePrices}
        />
      </div>
      <FormStatus state={state} conflict={conflict} />
      <FormFooter pending={pending} submitLabel={common("save")} />
    </form>
  );
}

function DeletePresetForm({ preset, onDone }: { preset: PresetItem; onDone: () => void }) {
  const common = useTranslations("common");
  const { state, pending, onSubmit, conflict } = useVersionedForm(deletePresetAction, preset.version, onDone);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={preset.id} />
      <input type="hidden" name="version" value={preset.version} />
      <FormStatus state={state} conflict={conflict} />
      <AlertDialogFooter>
        <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? common("saving") : common("delete")}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

function PresetRowActions({
  modelId,
  preset,
  context,
  permissions,
}: {
  modelId: string;
  preset: PresetItem;
  context: PricingContext;
  permissions: Permissions;
}) {
  const t = useTranslations("catalog.presets");
  const common = useTranslations("common");
  const [open, setOpen] = useState<"edit" | "delete" | null>(null);
  const close = () => setOpen(null);
  const onOpenChange = (next: boolean) => {
    if (!next) close();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label={common("actionsFor", { name: preset.composition })}>
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen("edit")}>
            <Pencil />
            {common("edit")}
          </DropdownMenuItem>
          {permissions.canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setOpen("delete")}>
                <Trash2 />
                {common("delete")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "edit"} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <EditPresetForm modelId={modelId} preset={preset} context={context} permissions={permissions} onDone={close} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={open === "delete"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { composition: preset.composition })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <DeletePresetForm preset={preset} onDone={close} />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function Presets({
  modelId,
  presets,
  context,
  permissions,
}: {
  modelId: string;
  presets: PresetItem[];
  context: PricingContext;
  permissions: Permissions;
}) {
  const t = useTranslations("catalog.presets");
  const common = useTranslations("common");
  const locale = useLocale();
  const suggest = useSuggest(context);
  const [creating, setCreating] = useState(false);
  const showActions = permissions.canEdit || permissions.canDelete;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("composition")}</TableHead>
              {permissions.canSeePrices ? (
                <>
                  <TableHead className="text-end">{t("fixedPrice")}</TableHead>
                  {TARGETS.map((target) => (
                    <TableHead key={target} className="text-end">
                      {t("suggestedIn", { currency: target })}
                    </TableHead>
                  ))}
                </>
              ) : null}
              {showActions ? (
                <TableHead className="w-0">
                  <span className="sr-only">{common("actions")}</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {presets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              presets.map((preset) => {
                const suggestion = suggest(preset.composition, preset.fixedPrice, preset.currency);
                return (
                  <TableRow key={preset.id}>
                    <TableCell dir="ltr" className="text-start font-mono font-medium">
                      {preset.composition}
                    </TableCell>
                    {permissions.canSeePrices ? (
                      <>
                        <TableCell dir="ltr" className="text-end tabular-nums">
                          {preset.fixedPrice ? `${formatDecimal(preset.fixedPrice, locale)} ${preset.currency}` : "—"}
                        </TableCell>
                        {TARGETS.map((target) => (
                          <TableCell key={target} className="text-end">
                            <SuggestedValue
                              value={suggestion?.values[target] ?? null}
                              reason={suggestion?.reason ?? null}
                            />
                          </TableCell>
                        ))}
                      </>
                    ) : null}
                    {showActions ? (
                      <TableCell>
                        <PresetRowActions modelId={modelId} preset={preset} context={context} permissions={permissions} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {permissions.canCreate ? (
        <Dialog open={creating} onOpenChange={setCreating}>
          <div>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus />
              {t("new")}
            </Button>
          </div>
          <DialogContent showCloseButton={false} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("createTitle")}</DialogTitle>
            </DialogHeader>
            <CreatePresetForm
              modelId={modelId}
              context={context}
              permissions={permissions}
              onDone={() => setCreating(false)}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
