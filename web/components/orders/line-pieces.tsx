"use client";

import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { formatComposition } from "@/lib/domain/composition";
import { formatDecimal, parseLocaleDecimal } from "@/lib/format/number";
import { newId, type EditorLine, type EditorOptions, type EditorPiece } from "@/lib/orders/editor";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const controlClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 aria-invalid:border-destructive";

type Props = {
  line: EditorLine;
  lineNumber: number;
  options: Pick<EditorOptions, "models" | "fabrics" | "pieceTypes">;
  /** Per-piece prices are on (document option "show piece prices"). */
  piecePricing: boolean;
  editable: boolean;
  canWritePrices: boolean;
  /** Field errors of this line ("pieces.0.qtyPerUnit" → message). */
  errors: Record<string, string>;
  onChange: (pieces: EditorPiece[], composition: string) => void;
};

/**
 * The pieces one unit (set) of a line consists of — generated from the
 * composition, editable here: quantity per set, a piece of another model
 * (a VERA set with a DAMLA armchair), another fabric, and the piece price
 * when per-piece pricing is on. The composition text follows the pieces.
 */
export function LinePieces({ line, lineNumber, options, piecePricing, editable, canWritePrices, errors, onChange }: Props) {
  const t = useTranslations("orders.pieces");
  const locale = useLocale();
  const lineModel = options.models.find((model) => model.id === line.modelId);
  const codeOf = new Map(options.pieceTypes.map((type) => [type.id, type.code]));

  function commit(pieces: EditorPiece[]) {
    const composition = formatComposition(
      pieces.map((piece) => ({ pieceType: codeOf.get(piece.pieceTypeId) ?? "", qty: piece.qtyPerUnit })),
    );
    onChange(pieces, composition || line.composition);
  }
  const update = (id: string, patch: Partial<EditorPiece>) =>
    commit(line.pieces.map((piece) => (piece.id === id ? { ...piece, ...patch } : piece)));

  const unused = options.pieceTypes.filter((type) => !line.pieces.some((piece) => piece.pieceTypeId === type.id));

  return (
    <div className="flex flex-col gap-2 py-2">
      <p className="text-sm font-medium">{t("title", { line: lineNumber })}</p>
      {line.pieces.length === 0 ? <p className="text-sm text-muted-foreground">{t("none")}</p> : null}
      {line.pieces.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 pe-2 text-start font-medium">{t("pieceType")}</th>
                <th className="w-24 py-1 pe-2 text-start font-medium">{t("qtyPerUnit")}</th>
                <th className="py-1 pe-2 text-start font-medium">{t("modelOverride")}</th>
                <th className="py-1 pe-2 text-start font-medium">{t("fabricOverride")}</th>
                {piecePricing ? <th className="w-32 py-1 pe-2 text-start font-medium">{t("unitPrice")}</th> : null}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {line.pieces.map((piece, index) => {
                const type = options.pieceTypes.find((entry) => entry.id === piece.pieceTypeId);
                const name = type?.name ?? piece.pieceTypeId;
                const errorOf = (field: string) => errors[`pieces.${index}.${field}`];
                return (
                  <tr key={piece.id} className="align-top">
                    <td className="py-1 pe-2">
                      <select
                        aria-label={t("pieceTypeOf", { line: lineNumber, piece: index + 1 })}
                        value={piece.pieceTypeId}
                        disabled={!editable}
                        onChange={(event) => update(piece.id, { pieceTypeId: event.target.value })}
                        className={controlClass}
                      >
                        {options.pieceTypes
                          .filter((entry) => entry.id === piece.pieceTypeId || !line.pieces.some((other) => other.pieceTypeId === entry.id))
                          .map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="py-1 pe-2">
                      <input
                        type="number"
                        min={1}
                        max={999}
                        dir="ltr"
                        aria-label={t("qtyOf", { piece: name })}
                        aria-invalid={errorOf("qtyPerUnit") ? true : undefined}
                        value={piece.qtyPerUnit}
                        disabled={!editable}
                        onChange={(event) => {
                          const qty = Number(event.target.value);
                          if (Number.isInteger(qty) && qty > 0) update(piece.id, { qtyPerUnit: qty });
                        }}
                        className={cn(controlClass, "text-end tabular-nums")}
                      />
                    </td>
                    <td className="py-1 pe-2">
                      <select
                        aria-label={t("modelOverrideOf", { piece: name })}
                        value={piece.modelOverrideId ?? ""}
                        disabled={!editable}
                        onChange={(event) => update(piece.id, { modelOverrideId: event.target.value || null })}
                        className={cn(controlClass, piece.modelOverrideId && "border-primary font-medium")}
                      >
                        <option value="">{t("sameModel", { model: lineModel?.code ?? "—" })}</option>
                        {options.models
                          .filter((model) => model.id !== line.modelId)
                          .map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.code}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="py-1 pe-2">
                      <select
                        aria-label={t("fabricOverrideOf", { piece: name })}
                        value={piece.fabricOverrideId ?? ""}
                        disabled={!editable}
                        onChange={(event) => update(piece.id, { fabricOverrideId: event.target.value || null })}
                        className={cn(controlClass, piece.fabricOverrideId && "border-primary font-medium")}
                      >
                        <option value="">{t("lineFabrics")}</option>
                        {options.fabrics.map((fabric) => (
                          <option key={fabric.id} value={fabric.id}>
                            {fabric.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    {piecePricing ? (
                      <td className="py-1 pe-2">
                        <PiecePriceInput
                          key={`${piece.id}:${piece.unitPrice}`}
                          label={t("priceOf", { piece: name })}
                          value={piece.unitPrice}
                          locale={locale}
                          disabled={!editable || !canWritePrices}
                          invalid={Boolean(errorOf("unitPrice"))}
                          onCommit={(unitPrice) => update(piece.id, { unitPrice })}
                        />
                      </td>
                    ) : null}
                    <td className="py-1">
                      {editable ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("remove", { piece: name })}
                          disabled={line.pieces.length === 1}
                          onClick={() => commit(line.pieces.filter((other) => other.id !== piece.id))}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {editable && unused.length > 0 ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              commit([
                ...line.pieces,
                {
                  id: newId(),
                  pieceTypeId: unused[0].id,
                  qtyPerUnit: 1,
                  modelOverrideId: null,
                  fabricOverrideId: null,
                  unitPrice: "",
                },
              ])
            }
          >
            <Plus />
            {t("add")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PiecePriceInput({
  label,
  value,
  locale,
  disabled,
  invalid,
  onCommit,
}: {
  label: string;
  value: string;
  locale: string;
  disabled: boolean;
  invalid: boolean;
  onCommit: (value: string) => void;
}) {
  const format = (raw: string) => formatDecimal(raw, locale, { minimumFractionDigits: 2 });
  return (
    <input
      inputMode="decimal"
      dir="ltr"
      aria-label={label}
      aria-invalid={invalid || undefined}
      defaultValue={format(value)}
      disabled={disabled}
      onBlur={(event) => {
        const text = event.target.value.trim();
        const parsed = text === "" ? "" : parseLocaleDecimal(text, locale);
        if (parsed !== null && parsed !== value) onCommit(parsed);
        else event.target.value = format(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={cn(controlClass, "text-end tabular-nums")}
    />
  );
}
