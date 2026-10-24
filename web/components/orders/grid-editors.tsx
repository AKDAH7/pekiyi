"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { foldLetters } from "@/lib/domain/text-fold";
import type { EditorFabric, EditorOptions } from "@/lib/orders/editor";
import { cn } from "@/lib/utils";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";

/** Where the active cell goes after an edit is committed. */
export type Move = "down" | "next" | "prev" | "none";

type EditorProps<T> = {
  initial: T;
  /** Accessible name, e.g. "Model, line 3". */
  label: string;
  onCommit: (value: T, move: Move) => void;
  onCancel: () => void;
};

const fold = (value: string) => foldLetters(value).trim();

export const cellInputClass =
  "h-8 w-full min-w-0 rounded-md border border-ring bg-background px-2 text-sm outline-none ring-3 ring-ring/30";

/**
 * Plain text editor of a cell: Enter commits and moves down, Tab / Shift+Tab
 * commit and move sideways, Esc cancels, leaving the cell commits.
 */
export function TextCellEditor({
  initial,
  label,
  onCommit,
  onCancel,
  selectAll,
  inputMode,
  list,
  align = "start",
}: EditorProps<string> & {
  /** Select the text on focus (editing started with Enter/F2/double-click, not by typing). */
  selectAll: boolean;
  inputMode?: "text" | "numeric" | "decimal";
  /** <datalist> id with suggestions. */
  list?: string;
  align?: "start" | "end";
}) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const finish = (move: Move | null) => {
    if (done.current) return;
    done.current = true;
    if (move === null) onCancel();
    else onCommit(text, move);
  };

  return (
    <input
      autoFocus
      aria-label={label}
      value={text}
      list={list}
      inputMode={inputMode}
      autoComplete="off"
      dir={inputMode && inputMode !== "text" ? "ltr" : undefined}
      onFocus={(event) => {
        if (selectAll) event.currentTarget.select();
        else event.currentTarget.setSelectionRange(text.length, text.length);
      }}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish("down");
        } else if (event.key === "Tab") {
          event.preventDefault();
          finish(event.shiftKey ? "prev" : "next");
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(null);
        }
      }}
      onBlur={() => finish("none")}
      className={cn(cellInputClass, align === "end" && "text-end tabular-nums")}
    />
  );
}

/** SET / PCS. */
export function UnitCellEditor({
  initial,
  label,
  options,
  onCommit,
  onCancel,
}: EditorProps<string> & { options: { value: string; label: string }[] }) {
  const done = useRef(false);
  return (
    <select
      autoFocus
      aria-label={label}
      defaultValue={initial}
      onChange={(event) => {
        done.current = true;
        onCommit(event.target.value, "none");
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          done.current = true;
          onCancel();
        } else if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          done.current = true;
          onCommit(event.currentTarget.value, event.key === "Enter" ? "down" : event.shiftKey ? "prev" : "next");
        }
      }}
      onBlur={() => {
        if (!done.current) onCancel();
      }}
      className={cellInputClass}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type ModelOption = EditorOptions["models"][number];

/** Type-to-search model picker. Starts empty (or with the typed character) so every model is listed. */
export function ModelCellEditor({
  initial,
  label,
  models,
  typed,
  onCommit,
  onCancel,
}: EditorProps<string | null> & { models: EditorOptions["models"]; typed: string }) {
  const t = useTranslations("orders.grid");
  const highlighted = useRef<ModelOption | undefined>(undefined);
  const done = useRef(false);
  const finish = (value: string | null | undefined, move: Move) => {
    if (done.current) return;
    done.current = true;
    if (value === undefined) onCancel();
    else onCommit(value, move);
  };
  const current = models.find((model) => model.id === initial) ?? null;

  return (
    <Combobox<ModelOption>
      items={models}
      defaultValue={current}
      defaultInputValue={typed}
      defaultOpen
      autoHighlight
      itemToStringLabel={(model) => model.code}
      isItemEqualToValue={(a, b) => a.id === b.id}
      filter={(model, query) => {
        const needle = fold(query);
        return !needle || fold(`${model.code} ${model.name}`).includes(needle);
      }}
      onItemHighlighted={(model) => {
        highlighted.current = model;
      }}
      onValueChange={(model) => {
        if (model) finish(model.id, "next");
      }}
      onOpenChange={(open, details) => {
        if (open || details.reason === "item-press") return;
        finish(undefined, "none");
      }}
    >
      <ComboboxInput
        autoFocus
        aria-label={label}
        placeholder={current?.code}
        showTrigger={false}
        className="h-8 w-full min-w-36"
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            event.preventDefault();
            finish(highlighted.current?.id, event.shiftKey ? "prev" : "next");
          }
        }}
      />
      <ComboboxContent className="min-w-64">
        <ComboboxEmpty>{t("noMatch")}</ComboboxEmpty>
        <ComboboxList>
          {(model: ModelOption) => (
            <ComboboxItem key={model.id} value={model} className={cn(!model.active && "text-muted-foreground")}>
              <span className="font-medium">{model.code}</span>
              {model.name && model.name !== model.code ? (
                <span className="truncate text-muted-foreground">{model.name}</span>
              ) : null}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

type FabricItem = EditorFabric & { keywords?: string | null; create?: boolean };

const fabricKey = (fabric: EditorFabric) => fabric.fabricId ?? `free:${fold(fabric.text)}`;

/**
 * Several fabrics per line, from the catalog or typed freely ("Add …").
 * Enter on an empty search, Tab or leaving the cell commits; Esc cancels.
 */
export function FabricsCellEditor({
  initial,
  label,
  fabrics,
  onCommit,
  onCancel,
}: EditorProps<EditorFabric[]> & { fabrics: EditorOptions["fabrics"] }) {
  const t = useTranslations("orders.grid");
  const anchor = useComboboxAnchor();
  const [selected, setSelected] = useState<EditorFabric[]>(initial);
  const [query, setQuery] = useState("");
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  const done = useRef(false);
  const finish = (move: Move | null) => {
    if (done.current) return;
    done.current = true;
    if (move === null) onCancel();
    else onCommit(selectedRef.current, move);
  };

  const items = useMemo<FabricItem[]>(() => {
    const list: FabricItem[] = fabrics.map((fabric) => ({
      fabricId: fabric.id,
      text: fabric.label,
      keywords: fabric.colorKey,
    }));
    // Free-text fabrics already on the line stay selectable / removable.
    for (const fabric of initial) if (!fabric.fabricId) list.push({ ...fabric });
    const typed = query.trim();
    if (typed && !list.some((item) => fold(item.text) === fold(typed))) {
      list.push({ fabricId: null, text: typed, create: true });
    }
    return list;
  }, [fabrics, initial, query]);

  return (
    <Combobox<FabricItem, true>
      multiple
      items={items}
      value={selected}
      inputValue={query}
      defaultOpen
      autoHighlight
      onInputValueChange={setQuery}
      itemToStringLabel={(item) => item.text}
      isItemEqualToValue={(a, b) => fabricKey(a) === fabricKey(b)}
      filter={(item, search) => {
        const needle = fold(search);
        return !needle || item.create === true || fold(`${item.text} ${item.keywords ?? ""}`).includes(needle);
      }}
      onValueChange={(values) => {
        setSelected(values.map(({ fabricId, text }) => ({ fabricId, text })));
        setQuery("");
      }}
      onOpenChange={(open, details) => {
        if (open) return;
        if (details.reason === "escape-key") finish(null);
        else if (details.reason === "outside-press" || details.reason === "focus-out") finish("none");
      }}
    >
      <ComboboxChips ref={anchor} className="min-w-64 bg-background">
        <ComboboxValue>
          {(values: FabricItem[]) =>
            values.map((value) => (
              <ComboboxChip key={fabricKey(value)} className={cn(!value.fabricId && "bg-destructive/10 text-destructive")}>
                {value.text}
              </ComboboxChip>
            ))
          }
        </ComboboxValue>
        <ComboboxChipsInput
          autoFocus
          aria-label={label}
          placeholder={selected.length === 0 ? t("fabricsPlaceholder") : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim() === "") {
              event.preventDefault();
              finish("down");
            } else if (event.key === "Tab") {
              event.preventDefault();
              finish(event.shiftKey ? "prev" : "next");
            } else if (event.key === "Escape") {
              finish(null);
            }
          }}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor} className="min-w-64">
        <ComboboxEmpty>{t("noMatch")}</ComboboxEmpty>
        <ComboboxList>
          {(item: FabricItem) => (
            <ComboboxItem key={item.create ? "create" : fabricKey(item)} value={item}>
              {item.create ? (
                <span>{t("addFreeText", { text: item.text })}</span>
              ) : (
                <>
                  <span className={cn(!item.fabricId && "text-destructive")}>{item.text}</span>
                  {item.keywords ? <span className="text-muted-foreground">{item.keywords}</span> : null}
                </>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
