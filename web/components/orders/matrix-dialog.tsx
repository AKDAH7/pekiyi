"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { parseComposition } from "@/lib/domain/composition";
import { matrixLines, type FabricMatch } from "@/lib/domain/order-lines";
import { foldLetters } from "@/lib/domain/text-fold";
import { COMMON_COMPOSITIONS } from "@/lib/orders/constants";
import { emptyLine, piecesFor, type EditorLine, type EditorOptions } from "@/lib/orders/editor";
import { cn } from "@/lib/utils";
import { FormField } from "@/components/form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Choice = { value: string; label: string; keywords?: string | null; create?: boolean };

const fold = (value: string) => foldLetters(value).trim();

/** Chips multi-select; `creatable` adds "Add …" for text that isn't an option. */
function ChipsPicker({
  id,
  choices,
  value,
  onChange,
  creatable,
  placeholder,
  emptyText,
  createLabel,
}: {
  id: string;
  choices: Choice[];
  value: Choice[];
  onChange: (value: Choice[]) => void;
  creatable?: boolean;
  placeholder: string;
  emptyText: string;
  createLabel?: (text: string) => string;
}) {
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const list = [...choices, ...value.filter((choice) => choice.create)];
    const typed = query.trim();
    if (creatable && typed && !list.some((choice) => fold(choice.label) === fold(typed))) {
      list.push({ value: `free:${typed}`, label: typed, create: true });
    }
    return list;
  }, [choices, value, query, creatable]);

  return (
    <Combobox<Choice, true>
      multiple
      items={items}
      value={value}
      inputValue={query}
      autoHighlight
      onInputValueChange={setQuery}
      itemToStringLabel={(choice) => choice.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      filter={(choice, search) => {
        const needle = fold(search);
        return !needle || (choice.create === true && fold(choice.label) === needle) || fold(`${choice.label} ${choice.keywords ?? ""}`).includes(needle);
      }}
      onValueChange={(next) => {
        onChange(next);
        setQuery("");
      }}
    >
      <ComboboxChips ref={anchor} className="w-full">
        <ComboboxValue>
          {(selected: Choice[]) =>
            selected.map((choice) => (
              <ComboboxChip key={choice.value} className={cn(choice.create && "bg-destructive/10 text-destructive")}>
                {choice.label}
              </ComboboxChip>
            ))
          }
        </ComboboxValue>
        <ComboboxChipsInput id={id} placeholder={value.length === 0 ? placeholder : undefined} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(choice: Choice) => (
            <ComboboxItem key={choice.value} value={choice}>
              {choice.create && createLabel ? createLabel(choice.label) : choice.label}
              {choice.keywords ? <span className="text-muted-foreground">{choice.keywords}</span> : null}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * "Matrix" bulk add: N models × M fabrics with one composition and quantity
 * → N×M lines (the real VİRONA order was 4 models × 6 colours).
 */
export function MatrixDialog({
  options,
  onAdd,
  trigger,
}: {
  options: EditorOptions;
  onAdd: (lines: EditorLine[]) => void;
  trigger: React.ReactNode;
}) {
  const t = useTranslations("orders.matrix");
  const grid = useTranslations("orders.grid");
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<Choice[]>([]);
  const [fabrics, setFabrics] = useState<Choice[]>([]);
  const [composition, setComposition] = useState("3+3+1+1");
  const [quantity, setQuantity] = useState("1");
  const [touched, setTouched] = useState(false);

  const modelChoices = useMemo(
    () => options.models.filter((model) => model.active).map((model) => ({ value: model.id, label: model.code, keywords: model.name })),
    [options.models],
  );
  const fabricChoices = useMemo(
    () => options.fabrics.filter((fabric) => fabric.active).map((fabric) => ({ value: fabric.id, label: fabric.label, keywords: fabric.colorKey })),
    [options.fabrics],
  );

  const compositionOk = parseComposition(composition).ok;
  const qty = /^\d+$/.test(quantity.trim()) ? Number(quantity) : 0;
  const count = models.length * fabrics.length;
  const errors = {
    models: models.length === 0 ? t("needModels") : undefined,
    fabrics: fabrics.length === 0 ? t("needFabrics") : undefined,
    composition: compositionOk ? undefined : t("badComposition"),
    quantity: qty > 0 ? undefined : t("badQuantity"),
  };
  const valid = !Object.values(errors).some(Boolean);

  function add() {
    setTouched(true);
    if (!valid) return;
    const colours: FabricMatch[] = fabrics.map((choice) => ({
      fabricId: choice.create ? null : choice.value,
      text: choice.label,
    }));
    const created = matrixLines({ modelIds: models.map((model) => model.value), fabrics: colours, composition, quantity: qty });
    onAdd(
      created.map((line) =>
        emptyLine({
          modelId: line.modelId,
          modelText: options.models.find((model) => model.id === line.modelId)?.code ?? "",
          composition: line.composition,
          quantity: line.quantity,
          unit: line.unit,
          fabrics: [line.fabric],
          pieces: piecesFor(line.pieces, options.pieceTypes),
        }),
      ),
    );
    setOpen(false);
    setModels([]);
    setFabrics([]);
    setTouched(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField id="matrix-models" label={t("models")} error={touched ? errors.models : undefined}>
            <ChipsPicker
              id="matrix-models"
              choices={modelChoices}
              value={models}
              onChange={setModels}
              placeholder={t("modelsPlaceholder")}
              emptyText={grid("noMatch")}
            />
          </FormField>
          <FormField id="matrix-fabrics" label={t("fabrics")} error={touched ? errors.fabrics : undefined} hint={t("fabricsHint")}>
            <ChipsPicker
              id="matrix-fabrics"
              choices={fabricChoices}
              value={fabrics}
              onChange={setFabrics}
              creatable
              placeholder={grid("fabricsPlaceholder")}
              emptyText={grid("noMatch")}
              createLabel={(text) => grid("addFreeText", { text })}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="matrix-composition" label={t("composition")} error={touched ? errors.composition : undefined}>
              <Input
                id="matrix-composition"
                list="matrix-compositions"
                dir="ltr"
                value={composition}
                onChange={(event) => setComposition(event.target.value)}
              />
              <datalist id="matrix-compositions">
                {COMMON_COMPOSITIONS.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </FormField>
            <FormField id="matrix-quantity" label={t("quantity")} error={touched ? errors.quantity : undefined}>
              <Input
                id="matrix-quantity"
                inputMode="numeric"
                dir="ltr"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </FormField>
          </div>
          <p role="status" className="text-sm font-medium">
            {t("preview", { models: models.length, fabrics: fabrics.length, lines: count })}
          </p>
        </div>
        <DialogFooter>
          <DialogClose className={buttonVariants({ variant: "outline" })}>{t("cancel")}</DialogClose>
          <Button type="button" onClick={add} disabled={touched && !valid}>
            {t("add", { lines: count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
