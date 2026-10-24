"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
  type ExpandedState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Layers, Plus, Wand2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { CustomColumn } from "@/db/schema/orders";
import { normalizeComposition, parseComposition } from "@/lib/domain/composition";
import { autoUnit, parsePastedLines } from "@/lib/domain/order-lines";
import { formatDecimal, numberLocale, parseLocaleDecimal } from "@/lib/format/number";
import { pickLocalized } from "@/lib/i18n/localized";
import { COMMON_COMPOSITIONS, ORDER_UNIT_LIST } from "@/lib/orders/constants";
import {
  copyLine,
  emptyLine,
  piecesFor,
  piecesForText,
  type EditorFabric,
  type EditorLine,
  type EditorOptions,
  type EditorPiece,
} from "@/lib/orders/editor";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import {
  FabricsCellEditor,
  ModelCellEditor,
  TextCellEditor,
  UnitCellEditor,
  type Move,
} from "./grid-editors";
import { NotesCell, PhotoCell, RowActions } from "./line-cells";
import { LinePieces } from "./line-pieces";
import { MatrixDialog } from "./matrix-dialog";

/** Figures of one line, computed by the editor with the domain functions. */
export type LineFigures = {
  /** Catalog suggestion in the order currency, or null with the reason. */
  suggested: string | null;
  suggestedReason: string | null;
  /** Σ piece prices, when per-piece pricing is on and every piece has one. */
  piecePriceSum: string | null;
  lineTotal: string | null;
  /** Effective unit CBM (override or catalog) and the catalog value alone. */
  unitCbm: string | null;
  catalogCbm: string | null;
  lineCbm: string | null;
};

const COLUMNS = [
  "index",
  "photo",
  "model",
  "composition",
  "fabrics",
  "quantity",
  "unit",
  "suggested",
  "unitPrice",
  "discount",
  "lineTotal",
  "unitCbm",
  "lineCbm",
  "notes",
  "actions",
] as const;
type BuiltinColumn = (typeof COLUMNS)[number];
/** Built-in columns, and the order's custom columns as "custom:<key>". */
type ColumnKey = BuiltinColumn | `custom:${string}`;

const CUSTOM_PREFIX = "custom:";
const customKeyOf = (col: ColumnKey): string | null => (col.startsWith(CUSTOM_PREFIX) ? col.slice(CUSTOM_PREFIX.length) : null);

/** Cells that open an editor in place. */
const TEXT_LIKE = new Set<ColumnKey>(["model", "composition", "fabrics", "quantity", "unitPrice", "discount", "unitCbm"]);
const PRICE_COLUMNS: ColumnKey[] = ["suggested", "unitPrice", "discount", "lineTotal"];
/** Cells whose only content is a button (popover / menu): Enter presses it. */
const BUTTON_CELLS = new Set<ColumnKey>(["photo", "notes", "actions"]);

const END_ALIGNED = new Set<ColumnKey>(["quantity", "suggested", "unitPrice", "discount", "lineTotal", "unitCbm", "lineCbm"]);

/** Custom number columns show what was typed: no padding, up to the 6 decimals they keep. */
const CUSTOM_NUMBER = { minimumFractionDigits: 0, maximumFractionDigits: 6 };

const isTextLike = (col: ColumnKey) => TEXT_LIKE.has(col) || customKeyOf(col) !== null;

type Cell = { row: string; col: ColumnKey };
type Editing = Cell & { typed: string | null };

type Props = {
  lines: EditorLine[];
  onLinesChange: (update: (lines: EditorLine[]) => EditorLine[]) => void;
  figures: ReadonlyMap<string, LineFigures>;
  options: EditorOptions;
  currency: string;
  piecePricing: boolean;
  editable: boolean;
  canWritePrices: boolean;
  canSeePrices: boolean;
  /** The order's custom columns, shown before the notes column. */
  customColumns: readonly CustomColumn[];
  /** Line id → field ("modelId", "pieces.0.qtyPerUnit") → message. */
  errors: Record<string, Record<string, string>>;
};

const columnHelper = createColumnHelper<EditorLine>();

export function ItemsGrid({
  lines,
  onLinesChange,
  figures,
  options,
  currency,
  piecePricing,
  editable,
  canWritePrices,
  canSeePrices,
  customColumns,
  errors,
}: Props) {
  const t = useTranslations("orders.grid");
  const locale = useLocale();
  const rtl = locale === "ar";
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Cell | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [status, setStatus] = useState<string | null>(null);
  const focusPending = useRef(false);

  const columnVisibility = useMemo<VisibilityState>(
    () => Object.fromEntries(PRICE_COLUMNS.map((key) => [key, canSeePrices])),
    [canSeePrices],
  );
  const columnKeys = useMemo<ColumnKey[]>(() => {
    const notes = COLUMNS.indexOf("notes");
    return [
      ...COLUMNS.slice(0, notes),
      ...customColumns.map((column): ColumnKey => `${CUSTOM_PREFIX}${column.key}`),
      ...COLUMNS.slice(notes),
    ];
  }, [customColumns]);
  const customByKey = useMemo(() => new Map(customColumns.map((column) => [column.key, column])), [customColumns]);
  const columns = useMemo(
    () => columnKeys.map((key) => columnHelper.display({ id: key, header: () => null, cell: () => null })),
    [columnKeys],
  );
  // TanStack Table can't be memoized by the React Compiler; the grid re-renders with its data anyway.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: lines,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getRowCanExpand: () => true,
    state: { expanded, columnVisibility },
    onExpandedChange: setExpanded,
  });
  const visibleColumns = table.getVisibleLeafColumns().map((column) => column.id as ColumnKey);
  const rows = table.getRowModel().rows;

  const intFormat = useMemo(() => new Intl.NumberFormat(numberLocale(locale)), [locale]);
  const money = (value: string | null) => (value === null || value === "" ? "" : formatDecimal(value, locale));
  const volume = (value: string | null) =>
    value === null || value === "" ? "" : formatDecimal(value, locale, { minimumFractionDigits: 3 });
  const modelOf = (line: EditorLine) => options.models.find((model) => model.id === line.modelId);
  const customOf = (col: ColumnKey) => {
    const key = customKeyOf(col);
    return key === null ? undefined : customByKey.get(key);
  };
  const columnTitle = (col: ColumnKey) => {
    const custom = customOf(col);
    return custom ? pickLocalized(custom.label, locale) || custom.key : t(`columns.${col}`);
  };
  const alignEnd = (col: ColumnKey) => END_ALIGNED.has(col) || customOf(col)?.type === "number";

  const isEditable = (col: ColumnKey) => {
    if (!editable) return false;
    if (col === "unitPrice") return canWritePrices && !piecePricing;
    if (col === "discount") return canWritePrices;
    return isTextLike(col) || col === "unit";
  };

  // Keep the keyboard focus on the active cell after moving or editing.
  useEffect(() => {
    if (editing || !active || !focusPending.current) return;
    focusPending.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-row="${active.row}"][data-col="${active.col}"]`)?.focus();
  }, [active, editing]);

  function updateLine(id: string, patch: Partial<EditorLine> | ((line: EditorLine) => Partial<EditorLine>)) {
    onLinesChange((current) =>
      current.map((line) => (line.id === id ? { ...line, ...(typeof patch === "function" ? patch(line) : patch) } : line)),
    );
  }

  function moveFrom(cell: Cell, move: Move): Cell {
    const rowIndex = rows.findIndex((row) => row.id === cell.row);
    const colIndex = visibleColumns.indexOf(cell.col);
    if (move === "down") {
      const next = rows[Math.min(rows.length - 1, rowIndex + 1)];
      return next ? { row: next.id, col: cell.col } : cell;
    }
    if (move === "next" || move === "prev") {
      const step = move === "next" ? 1 : -1;
      let col = colIndex + step;
      let row = rowIndex;
      if (col >= visibleColumns.length) {
        col = 0;
        row = Math.min(rows.length - 1, row + 1);
      } else if (col < 0) {
        col = visibleColumns.length - 1;
        row = Math.max(0, row - 1);
      }
      return { row: rows[row]?.id ?? cell.row, col: visibleColumns[col] };
    }
    return cell;
  }

  function finishEditing(cell: Cell, move: Move) {
    setEditing(null);
    setActive(moveFrom(cell, move));
    focusPending.current = true;
  }

  function commit(line: EditorLine, col: ColumnKey, value: string, move: Move) {
    const text = value.trim();
    const decimal = (raw: string) => (raw === "" ? "" : parseLocaleDecimal(raw, locale));
    const custom = customOf(col);
    if (custom) {
      // A number column keeps what can't be read as a number unchanged (no silent loss).
      const parsed = custom.type === "number" ? decimal(text) : text;
      if (parsed !== null) {
        updateLine(line.id, (current) => ({ customValues: { ...current.customValues, [custom.key]: parsed } }));
      }
      finishEditing({ row: line.id, col }, move);
      return;
    }
    switch (col) {
      case "composition": {
        const composition = parseComposition(text).ok ? (normalizeComposition(text) ?? text) : text;
        updateLine(line.id, {
          composition,
          unit: autoUnit(composition) ?? line.unit,
          pieces: piecesForText(composition, options.pieceTypes, line.pieces),
        });
        break;
      }
      case "quantity": {
        const parsed = parseLocaleDecimal(text, locale);
        updateLine(line.id, { quantity: parsed && /^\d+$/.test(parsed) && Number(parsed) > 0 ? Number(parsed) : null });
        break;
      }
      case "unitPrice":
      case "discount":
      case "unitCbm": {
        const parsed = decimal(text);
        if (parsed === null || parsed.startsWith("-")) break;
        const field = col === "discount" ? "discountPercent" : col;
        updateLine(line.id, { [field]: parsed });
        break;
      }
      case "unit":
        updateLine(line.id, { unit: value === "PCS" ? "PCS" : "SET" });
        break;
    }
    finishEditing({ row: line.id, col }, move);
  }

  function startEditing(cell: Cell, typed: string | null) {
    const line = lines.find((entry) => entry.id === cell.row);
    if (!line) return;
    if (BUTTON_CELLS.has(cell.col)) {
      gridRef.current?.querySelector<HTMLElement>(`[data-row="${cell.row}"][data-col="${cell.col}"] button`)?.click();
      return;
    }
    if (!isEditable(cell.col)) return;
    setActive(cell);
    setEditing({ ...cell, typed });
  }

  function addLines(added: EditorLine[], after?: string) {
    onLinesChange((current) => {
      const index = after ? current.findIndex((line) => line.id === after) : -1;
      if (index < 0) return [...current, ...added];
      return [...current.slice(0, index + 1), ...added, ...current.slice(index + 1)];
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (editing || !active) return;
    // Keys inside popovers / menus opened from a cell belong to them.
    if (!(event.target instanceof HTMLElement) || !event.target.closest("[data-col]")) return;
    const rowIndex = rows.findIndex((row) => row.id === active.row);
    const colIndex = visibleColumns.indexOf(active.col);
    const go = (row: number, col: number) => {
      event.preventDefault();
      const target = rows[Math.max(0, Math.min(rows.length - 1, row))];
      if (!target) return;
      setActive({ row: target.id, col: visibleColumns[Math.max(0, Math.min(visibleColumns.length - 1, col))] });
      focusPending.current = true;
    };
    // Arrow keys follow what the user sees: in RTL the next column is on the left.
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";

    switch (event.key) {
      case "ArrowDown":
        return go(rowIndex + 1, colIndex);
      case "ArrowUp":
        return go(rowIndex - 1, colIndex);
      case forward:
        return go(rowIndex, colIndex + 1);
      case back:
        return go(rowIndex, colIndex - 1);
      case "Home":
        return go(event.ctrlKey ? 0 : rowIndex, 0);
      case "End":
        return go(event.ctrlKey ? rows.length - 1 : rowIndex, visibleColumns.length - 1);
      case "Tab": {
        const lastCell = rowIndex === rows.length - 1 && colIndex === visibleColumns.length - 1;
        const firstCell = rowIndex === 0 && colIndex === 0;
        if ((event.shiftKey && firstCell) || (!event.shiftKey && lastCell)) return; // leave the grid
        event.preventDefault();
        setActive(moveFrom(active, event.shiftKey ? "prev" : "next"));
        focusPending.current = true;
        return;
      }
      case "Enter":
      case "F2":
        event.preventDefault();
        return startEditing(active, null);
      case "Delete":
      case "Backspace": {
        if (!isEditable(active.col)) return;
        const field = { unitPrice: "unitPrice", discount: "discountPercent", unitCbm: "unitCbm" }[active.col as string];
        const custom = customOf(active.col);
        if (custom) {
          event.preventDefault();
          updateLine(active.row, (current) => ({ customValues: { ...current.customValues, [custom.key]: "" } }));
        } else if (field) {
          event.preventDefault();
          updateLine(active.row, { [field]: "" });
        } else if (active.col === "fabrics") {
          event.preventDefault();
          updateLine(active.row, { fabrics: [] });
        }
        return;
      }
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && isTextLike(active.col)) {
          if (!isEditable(active.col)) return;
          event.preventDefault();
          startEditing(active, active.col === "fabrics" ? null : event.key);
        }
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (editing || !editable) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text.trim()) return;
    event.preventDefault();

    // One value into the active cell, like a spreadsheet.
    if (!/[\t\n]/.test(text.trim()) && active && isEditable(active.col) && active.col !== "fabrics" && active.col !== "model") {
      const line = lines.find((entry) => entry.id === active.row);
      if (line) commit(line, active.col, text, "none");
      return;
    }

    const { lines: pasted } = parsePastedLines(text, options, locale);
    const labelOf = (fabricId: string) => options.fabrics.find((fabric) => fabric.id === fabricId)?.label;
    const added = pasted.map((row) =>
      emptyLine({
        modelId: row.modelId,
        modelText: row.modelText,
        composition: row.compositionValid ? (normalizeComposition(row.composition) ?? row.composition) : row.composition,
        quantity: row.quantity,
        unit: row.unit,
        unitPrice: canWritePrices && !piecePricing ? (row.unitPrice ?? "") : "",
        fabrics: row.fabrics.map((fabric): EditorFabric => ({
          fabricId: fabric.fabricId,
          text: (fabric.fabricId && labelOf(fabric.fabricId)) || fabric.text,
        })),
        pieces: piecesFor(row.pieces, options.pieceTypes),
      }),
    );
    if (added.length === 0) return;
    addLines(added, active?.row);
    const issues = pasted.filter(
      (row) =>
        !row.modelId ||
        !row.compositionValid ||
        row.quantity === null ||
        (row.unitPriceText !== "" && row.unitPrice === null) ||
        row.fabrics.some((fabric) => !fabric.fabricId),
    ).length;
    setStatus(issues > 0 ? t("pastedWithIssues", { count: added.length, issues }) : t("pasted", { count: added.length }));
  }

  function renderEditor(line: EditorLine, col: ColumnKey, lineNumber: number, typed: string | null) {
    const label = t("cellLabel", { column: columnTitle(col), line: lineNumber });
    const cell = { row: line.id, col };
    const cancel = () => finishEditing(cell, "none");
    const textProps = {
      label,
      selectAll: typed === null,
      onCommit: (value: string, move: Move) => commit(line, col, value, move),
      onCancel: cancel,
    };
    const custom = customOf(col);
    if (custom) {
      const raw = line.customValues[custom.key] ?? "";
      return custom.type === "number" ? (
        <TextCellEditor {...textProps} initial={typed ?? (raw === "" ? "" : formatDecimal(raw, locale, CUSTOM_NUMBER))} inputMode="decimal" align="end" />
      ) : (
        <TextCellEditor {...textProps} initial={typed ?? raw} />
      );
    }
    switch (col) {
      case "model":
        return (
          <ModelCellEditor
            initial={line.modelId}
            label={label}
            models={options.models}
            typed={typed ?? ""}
            onCommit={(modelId, move) => {
              const model = options.models.find((entry) => entry.id === modelId);
              updateLine(line.id, { modelId, modelText: model?.code ?? "" });
              finishEditing(cell, move);
            }}
            onCancel={cancel}
          />
        );
      case "fabrics":
        return (
          <FabricsCellEditor
            initial={line.fabrics}
            label={label}
            fabrics={options.fabrics}
            onCommit={(fabrics, move) => {
              updateLine(line.id, { fabrics });
              finishEditing(cell, move);
            }}
            onCancel={cancel}
          />
        );
      case "unit":
        return (
          <UnitCellEditor
            initial={line.unit}
            label={label}
            options={ORDER_UNIT_LIST.map((unit) => ({ value: unit, label: t(`units.${unit}`) }))}
            onCommit={(value, move) => commit(line, col, value, move)}
            onCancel={cancel}
          />
        );
      case "composition": {
        const model = modelOf(line);
        const listId = `compositions-${line.id}`;
        const suggestions = [...new Set([...(model?.presets ?? []), ...COMMON_COMPOSITIONS])];
        return (
          <>
            <TextCellEditor {...textProps} initial={typed ?? line.composition} list={listId} />
            <datalist id={listId}>
              {suggestions.map((composition) => (
                <option key={composition} value={composition} />
              ))}
            </datalist>
          </>
        );
      }
      case "quantity":
        return (
          <TextCellEditor
            {...textProps}
            initial={typed ?? (line.quantity === null ? "" : String(line.quantity))}
            inputMode="numeric"
            align="end"
          />
        );
      case "unitPrice":
      case "discount":
      case "unitCbm": {
        const raw = col === "unitPrice" ? line.unitPrice : col === "discount" ? line.discountPercent : line.unitCbm;
        const shown = col === "unitCbm" ? volume(raw) : money(raw);
        return <TextCellEditor {...textProps} initial={typed ?? shown} inputMode="decimal" align="end" />;
      }
      default:
        return null;
    }
  }

  function renderDisplay(line: EditorLine, col: ColumnKey, lineNumber: number, isExpanded: boolean) {
    const figure = figures.get(line.id);
    const fieldError = (field: string) => errors[line.id]?.[field];
    const custom = customOf(col);
    if (custom) {
      const raw = line.customValues[custom.key] ?? "";
      if (custom.type === "text" || raw === "") return <span className="whitespace-pre-wrap">{raw}</span>;
      const number = /^-?\d+(\.\d+)?$/.test(raw);
      return number ? (
        <span className="tabular-nums">{formatDecimal(raw, locale, CUSTOM_NUMBER)}</span>
      ) : (
        <span className="text-destructive">{raw}</span>
      );
    }
    switch (col) {
      case "index":
        return (
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              aria-expanded={isExpanded}
              aria-label={t(isExpanded ? "hidePieces" : "showPieces", { line: lineNumber })}
              onClick={() => setExpanded((current) => ({ ...(current as Record<string, boolean>), [line.id]: !isExpanded }))}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {isExpanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4 rtl:rotate-180" />
              )}
            </button>
            <span className="tabular-nums text-muted-foreground">{lineNumber}</span>
          </span>
        );
      case "photo":
        return (
          <PhotoCell
            line={lineNumber}
            photoPath={line.photoPath}
            modelPhotoUrl={modelOf(line)?.photoUrl ?? null}
            editable={editable}
            onChange={(photoPath) => updateLine(line.id, { photoPath })}
          />
        );
      case "model": {
        const model = modelOf(line);
        if (!model) {
          return line.modelText ? (
            <span className="font-medium text-destructive" title={t("unknownModel", { text: line.modelText })}>
              {line.modelText} <span className="sr-only">{t("unknownModel", { text: line.modelText })}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t("chooseModel")}</span>
          );
        }
        return <span className="font-medium">{model.code}</span>;
      }
      case "composition": {
        const invalid = line.composition !== "" && !parseComposition(line.composition).ok;
        return (
          <span className={cn("tabular-nums", invalid && "font-medium text-destructive")} dir="ltr">
            {line.composition}
          </span>
        );
      }
      case "fabrics":
        return (
          <span className="flex flex-wrap gap-1">
            {line.fabrics.map((fabric) => (
              <span
                key={fabric.fabricId ?? `free:${fabric.text}`}
                title={fabric.fabricId ? undefined : t("notInCatalog")}
                className={cn(
                  "rounded-sm bg-muted px-1.5 py-0.5 text-xs whitespace-nowrap",
                  !fabric.fabricId && "bg-destructive/10 text-destructive",
                )}
              >
                {fabric.text}
                {fabric.fabricId ? null : <span className="sr-only"> ({t("notInCatalog")})</span>}
              </span>
            ))}
          </span>
        );
      case "quantity":
        return line.quantity === null ? (
          <span className="text-destructive">—</span>
        ) : (
          <span className="tabular-nums">{intFormat.format(line.quantity)}</span>
        );
      case "unit":
        return <span>{t(`units.${line.unit}`)}</span>;
      case "suggested":
        return figure?.suggested ? (
          <span className="text-muted-foreground tabular-nums">{money(figure.suggested)}</span>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={<span tabIndex={-1} aria-label={figure?.suggestedReason ?? undefined} className="cursor-help text-muted-foreground" />}
            >
              —
            </TooltipTrigger>
            <TooltipContent>{figure?.suggestedReason}</TooltipContent>
          </Tooltip>
        );
      case "unitPrice": {
        const value = piecePricing && figure?.piecePriceSum ? figure.piecePriceSum : line.unitPrice;
        const suggested = figure?.suggested;
        const canUse = canWritePrices && editable && !piecePricing && suggested && suggested !== line.unitPrice;
        return (
          <span className="inline-flex w-full items-center justify-end gap-1">
            {canUse ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                tabIndex={-1}
                aria-label={t("useSuggested", { line: lineNumber })}
                title={t("useSuggested", { line: lineNumber })}
                onClick={(event) => {
                  event.stopPropagation();
                  updateLine(line.id, { unitPrice: suggested });
                }}
              >
                <Wand2 />
              </Button>
            ) : null}
            <span className={cn("tabular-nums", value === "" && fieldError("unitPrice") && "text-destructive")}>
              {money(value)}
            </span>
          </span>
        );
      }
      case "discount":
        return <span className="tabular-nums">{line.discountPercent ? `${money(line.discountPercent)} %` : ""}</span>;
      case "lineTotal":
        return <span className="font-medium tabular-nums">{money(figure?.lineTotal ?? null)}</span>;
      case "unitCbm":
        return line.unitCbm ? (
          <span className="tabular-nums">{volume(line.unitCbm)}</span>
        ) : (
          <span className="text-muted-foreground italic tabular-nums" title={t("catalogCbm")}>
            {volume(figure?.catalogCbm ?? null)}
          </span>
        );
      case "lineCbm":
        return <span className="tabular-nums">{volume(figure?.lineCbm ?? null)}</span>;
      case "notes":
        return (
          <NotesCell
            line={lineNumber}
            lineId={line.id}
            customerNote={line.customerNote}
            productionNote={line.productionNote}
            editable={editable}
            onChange={(notes) => updateLine(line.id, notes)}
          />
        );
      case "actions":
        if (!editable) return null;
        return (
          <RowActions
            line={lineNumber}
            first={lineNumber === 1}
            last={lineNumber === lines.length}
            onDuplicate={() => addLines([copyLine(line)], line.id)}
            onMove={(delta) =>
              onLinesChange((current) => {
                const index = current.findIndex((entry) => entry.id === line.id);
                const target = index + delta;
                if (index < 0 || target < 0 || target >= current.length) return current;
                const next = [...current];
                [next[index], next[target]] = [next[target], next[index]];
                return next;
              })
            }
            onDelete={() => onLinesChange((current) => current.filter((entry) => entry.id !== line.id))}
          />
        );
    }
  }

  /** Errors of a cell: the field(s) the column edits. */
  const cellError = (line: EditorLine, col: ColumnKey): string | undefined => {
    const own = errors[line.id] ?? {};
    const custom = customKeyOf(col);
    if (custom !== null) return own[`customValues.${custom}`];
    const fields: Record<string, string[]> = {
      model: ["modelId"],
      composition: ["composition", "pieces"],
      fabrics: ["fabrics"],
      quantity: ["quantity"],
      unit: ["unit"],
      unitPrice: ["unitPrice"],
      discount: ["discountPercent"],
      unitCbm: ["unitCbm"],
      photo: ["photoPath"],
      notes: ["customerNote", "productionNote"],
    };
    for (const field of fields[col] ?? []) {
      const match = Object.entries(own).find(([key]) => key === field || key.startsWith(`${field}.`));
      if (match) return match[1];
    }
    return undefined;
  };

  const firstCell: Cell | null = rows[0] ? { row: rows[0].id, col: visibleColumns[0] } : null;
  const tabStop = active ?? firstCell;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={gridRef}
        role="grid"
        aria-label={t("label")}
        aria-rowcount={lines.length + 1}
        tabIndex={lines.length === 0 ? 0 : -1}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        data-testid="order-grid"
        // `relative`: absolutely positioned bits inside cells (sr-only labels) belong to this scroll box;
        // otherwise they escape its clipping and widen the whole page in RTL / at tablet width.
        className="relative overflow-x-auto rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <table className="w-full min-w-max border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr role="row">
              {visibleColumns.map((col) => (
                <th
                  key={col}
                  role="columnheader"
                  scope="col"
                  className={cn(
                    "h-9 px-2 text-start text-xs font-medium whitespace-nowrap text-muted-foreground",
                    alignEnd(col) && "text-end",
                    col === "index" && "sticky start-0 z-10 bg-muted",
                  )}
                >
                  {col === "index" || col === "actions" ? (
                    <span className="sr-only">{t(`columns.${col}`)}</span>
                  ) : PRICE_COLUMNS.includes(col) && col !== "discount" ? (
                    `${t(`columns.${col}`)} (${currency})`
                  ) : (
                    columnTitle(col)
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-muted-foreground">
                  {t("empty")}
                </td>
              </tr>
            ) : null}
            {rows.map((row, rowIndex) => {
              const line = row.original;
              const lineNumber = rowIndex + 1;
              const isExpanded = row.getIsExpanded();
              const hasErrors = Object.keys(errors[line.id] ?? {}).length > 0;
              return (
                <Fragment key={row.id}>
                  <tr role="row" data-line={lineNumber} className={cn("border-t", hasErrors && "bg-destructive/5")}>
                    {visibleColumns.map((col) => {
                      const isActive = active?.row === line.id && active.col === col;
                      const isEditing = editing?.row === line.id && editing.col === col;
                      const error = cellError(line, col);
                      const readOnly = !isEditable(col) && !BUTTON_CELLS.has(col);
                      return (
                        <td
                          key={col}
                          role="gridcell"
                          data-row={line.id}
                          data-col={col}
                          aria-selected={isActive || undefined}
                          aria-readonly={readOnly || undefined}
                          aria-invalid={error ? true : undefined}
                          title={error}
                          tabIndex={tabStop?.row === line.id && tabStop.col === col ? 0 : -1}
                          onFocus={() => {
                            if (!isActive) setActive({ row: line.id, col });
                          }}
                          onClick={() => setActive({ row: line.id, col })}
                          onDoubleClick={() => startEditing({ row: line.id, col }, null)}
                          className={cn(
                            "h-11 px-2 align-middle outline-none",
                            alignEnd(col) && "text-end",
                            customOf(col) && "min-w-28",
                            col === "index" && "sticky start-0 z-10 bg-card",
                            col === "fabrics" && "min-w-48",
                            col === "model" && "min-w-32",
                            readOnly && col !== "index" && "bg-muted/30",
                            isActive && !isEditing && "ring-2 ring-primary ring-inset",
                            error && "ring-2 ring-destructive ring-inset",
                          )}
                        >
                          {isEditing
                            ? renderEditor(line, col, lineNumber, editing.typed)
                            : renderDisplay(line, col, lineNumber, isExpanded)}
                        </td>
                      );
                    })}
                  </tr>
                  {isExpanded ? (
                    <tr className="bg-muted/20">
                      <td colSpan={visibleColumns.length} className="px-4">
                        <LinePieces
                          line={line}
                          lineNumber={lineNumber}
                          options={options}
                          piecePricing={piecePricing}
                          editable={editable}
                          canWritePrices={canWritePrices}
                          errors={errors[line.id] ?? {}}
                          onChange={(pieces: EditorPiece[], composition: string) => updateLine(line.id, { pieces, composition })}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground empty:hidden">
        {status}
      </p>

      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const line = emptyLine();
              addLines([line]);
              setActive({ row: line.id, col: "model" });
              setEditing({ row: line.id, col: "model", typed: null });
            }}
          >
            <Plus />
            {t("addLine")}
          </Button>
          <MatrixDialog
            options={options}
            onAdd={(added) => {
              addLines(added);
              setStatus(t("added", { count: added.length }));
            }}
            trigger={
              <>
                <Layers />
                {t("bulkAdd")}
              </>
            }
          />
          <span className="text-xs text-muted-foreground">{t("pasteHint")}</span>
        </div>
      ) : null}
    </div>
  );
}
