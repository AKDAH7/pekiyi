"use client";

import { foldLetters } from "@/lib/domain/text-fold";
import { Flag } from "@/components/customers/country";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export type SearchableOption = {
  /** Submitted value; "" is the "nothing chosen" entry of optional selects. */
  value: string;
  label: string;
  /** Extra text that should also match a search (e.g. the ISO code "NL"). */
  keywords?: string;
  /** ISO country code whose flag is shown before the label. */
  flag?: string;
};

type Props = {
  id: string;
  name: string;
  options: SearchableOption[];
  defaultValue?: string | null;
  placeholder?: string;
  emptyText: string;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
  onValueChange?: (value: string) => void;
};

/** Search folds Turkish letters both ways, so "turkiye" finds "Türkiye" and "IZMIR" finds "İzmir". */
function matches(option: SearchableOption, query: string): boolean {
  const needle = foldLetters(query.trim());
  if (!needle) return true;
  return foldLetters(`${option.label} ${option.keywords ?? ""}`).includes(needle);
}

/** A type-to-search select that submits `name=value` like a native <select>. */
export function SearchableSelect({
  id,
  name,
  options,
  defaultValue,
  placeholder,
  emptyText,
  invalid,
  disabled,
  describedBy,
  onValueChange,
}: Props) {
  const initial = options.find((option) => option.value === (defaultValue ?? "")) ?? null;

  return (
    <Combobox<SearchableOption>
      items={options}
      name={name}
      defaultValue={initial}
      disabled={disabled}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      isItemEqualToValue={(a, b) => a.value === b.value}
      filter={matches}
      onValueChange={(option) => onValueChange?.(option?.value ?? "")}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        className="w-full"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(option: SearchableOption) => (
            <ComboboxItem key={option.value || "-"} value={option}>
              {option.flag ? <Flag code={option.flag} /> : null}
              <span className="truncate">{option.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
