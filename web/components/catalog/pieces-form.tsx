"use client";

import { useLocale, useTranslations } from "next-intl";

import { updatePiecesAction } from "@/actions/catalog";
import type { LocalizedText } from "@/db/schema/common";
import { useVersionedForm } from "@/hooks/use-versioned-form";
import { formatDecimal } from "@/lib/format/number";
import { CURRENCIES } from "@/lib/validation/currencies";
import { DecimalInput } from "@/components/decimal-input";
import { FormStatus } from "@/components/form-status";
import { OptionSelect } from "@/components/option-select";
import { TranslatedInput } from "@/components/translated-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type PieceTableRow = {
  pieceTypeId: string;
  pieceTypeName: string;
  isAccessory: boolean;
  /** The saved catalog row; null when this piece has no data yet. */
  saved: {
    id: string;
    version: number;
    /** Only sent to the client for roles with `prices.read`. */
    basePrice: string | null;
    baseCurrency: string | null;
    unitCbm: string | null;
    unitWeightKg: string | null;
    packageCount: number;
    packageContents: LocalizedText | null;
  } | null;
};

type Props = {
  modelId: string;
  rows: PieceTableRow[];
  canEdit: boolean;
  /** Admin: price inputs. Without it the price inputs aren't even rendered. */
  canEditPrices: boolean;
  canSeePrices: boolean;
};

function CellError({ message, id }: { message?: string; id: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-1 text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

export function PiecesForm({ modelId, rows, canEdit, canEditPrices, canSeePrices }: Props) {
  const t = useTranslations("catalog.pieces");
  const common = useTranslations("common");
  const locale = useLocale();
  // One form saves every row; together their versions identify what was loaded.
  const versionKey = rows.map((row) => (row.saved ? `${row.saved.id}:${row.saved.version}` : "-")).join("|");
  const { state, pending, onSubmit, conflict } = useVersionedForm(updatePiecesAction, versionKey);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="modelId" value={modelId} />
      <div className="overflow-x-auto rounded-lg border">
        <Table key={versionKey} className="min-w-[60rem]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("piece")}</TableHead>
              {canSeePrices ? <TableHead className="w-56">{t("basePrice")}</TableHead> : null}
              <TableHead className="w-28">{t("unitCbm")}</TableHead>
              <TableHead className="w-28">{t("unitWeightKg")}</TableHead>
              <TableHead className="w-24">{t("packageCount")}</TableHead>
              <TableHead className="min-w-64">{t("packageContents")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const name = (field: string) => `pieces.${index}.${field}`;
              const id = (field: string) => `piece-${row.pieceTypeId}-${field}`;
              const error = (field: string) => errors[name(field)];
              const aria = (field: string) => ({
                id: id(field),
                "aria-invalid": error(field) ? true : undefined,
                "aria-describedby": error(field) ? `${id(field)}-error` : undefined,
              });
              const saved = row.saved;
              return (
                <TableRow key={row.pieceTypeId} className="align-top">
                  <TableCell className="py-3 font-medium whitespace-normal">
                    <input type="hidden" name={name("pieceTypeId")} value={row.pieceTypeId} />
                    {saved ? (
                      <>
                        <input type="hidden" name={name("id")} value={saved.id} />
                        <input type="hidden" name={name("version")} value={saved.version} />
                      </>
                    ) : null}
                    <div className="flex flex-col items-start gap-1">
                      <span>{row.pieceTypeName}</span>
                      {row.isAccessory ? <Badge variant="outline">{t("accessory")}</Badge> : null}
                      {!saved ? <span className="text-xs font-normal text-muted-foreground">{t("noData")}</span> : null}
                    </div>
                  </TableCell>

                  {canSeePrices ? (
                    <TableCell className="py-3">
                      {canEditPrices && canEdit ? (
                        <div className="flex gap-2">
                          <DecimalInput
                            {...aria("basePrice")}
                            name={name("basePrice")}
                            defaultValue={saved?.basePrice}
                            aria-label={t("basePriceOf", { piece: row.pieceTypeName })}
                          />
                          <div className="w-24 shrink-0">
                            <OptionSelect
                              id={id("baseCurrency")}
                              name={name("baseCurrency")}
                              defaultValue={saved?.baseCurrency ?? "TRY"}
                              options={CURRENCIES.map((code) => ({ value: code, label: code }))}
                            />
                          </div>
                        </div>
                      ) : (
                        // Read-only for export: no input, so nothing is submitted.
                        <span dir="ltr" className="block py-1.5 text-end tabular-nums">
                          {saved?.basePrice
                            ? `${formatDecimal(saved.basePrice, locale)} ${saved.baseCurrency ?? ""}`
                            : "—"}
                        </span>
                      )}
                      <CellError message={error("basePrice")} id={`${id("basePrice")}-error`} />
                    </TableCell>
                  ) : null}

                  <TableCell className="py-3">
                    <DecimalInput
                      {...aria("unitCbm")}
                      name={name("unitCbm")}
                      defaultValue={saved?.unitCbm}
                      minimumFractionDigits={3}
                      disabled={!canEdit}
                      aria-label={t("unitCbmOf", { piece: row.pieceTypeName })}
                    />
                    <CellError message={error("unitCbm")} id={`${id("unitCbm")}-error`} />
                  </TableCell>
                  <TableCell className="py-3">
                    <DecimalInput
                      {...aria("unitWeightKg")}
                      name={name("unitWeightKg")}
                      defaultValue={saved?.unitWeightKg}
                      disabled={!canEdit}
                      aria-label={t("unitWeightOf", { piece: row.pieceTypeName })}
                    />
                    <CellError message={error("unitWeightKg")} id={`${id("unitWeightKg")}-error`} />
                  </TableCell>
                  <TableCell className="py-3">
                    <Input
                      {...aria("packageCount")}
                      name={name("packageCount")}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      step={1}
                      dir="ltr"
                      className="text-end"
                      // Accessories without a row travel inside another package.
                      defaultValue={saved?.packageCount ?? (row.isAccessory ? 0 : 1)}
                      disabled={!canEdit}
                      aria-label={t("packageCountOf", { piece: row.pieceTypeName })}
                    />
                    <CellError message={error("packageCount")} id={`${id("packageCount")}-error`} />
                  </TableCell>
                  <TableCell className="py-3">
                    <TranslatedInput
                      id={id("packageContents")}
                      name={name("packageContents")}
                      label={t("packageContentsOf", { piece: row.pieceTypeName })}
                      hideLabel
                      defaultValue={saved?.packageContents}
                      errors={errors}
                      disabled={!canEdit}
                      maxLength={200}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{t("packageHint")}</p>
      <FormStatus state={state} conflict={conflict} successMessage={common("saved")} />
      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? common("saving") : t("save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
