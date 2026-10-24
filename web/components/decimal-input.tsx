"use client";

import { useState } from "react";
import { useLocale } from "next-intl";

import { formatDecimal, parseLocaleDecimal } from "@/lib/format/number";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<"input">, "defaultValue" | "value" | "onChange" | "name"> & {
  name: string;
  /** Canonical decimal string from the DB ("1250.00"), or null. */
  defaultValue?: string | null;
  /** Decimals shown after formatting: money 2, CBM 3, rates up to 6. */
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** Called with the canonical value (null when empty or not a number). */
  onValueChange?: (value: string | null) => void;
};

/**
 * Number input that shows the user's locale format (tr: 1.250,00 /
 * en: 1,250.00) and submits the canonical decimal string ("1250.00") in a
 * hidden input under `name`. Nothing is converted to a JS float. Text that
 * is not a number is submitted as typed, so the server's zod check reports it.
 */
export function DecimalInput({
  name,
  defaultValue,
  minimumFractionDigits = 2,
  maximumFractionDigits = minimumFractionDigits,
  onValueChange,
  className,
  onBlur,
  ...props
}: Props) {
  const locale = useLocale();
  const format = (value: string | null | undefined) =>
    formatDecimal(value, locale, { minimumFractionDigits, maximumFractionDigits });
  const [text, setText] = useState(() => format(defaultValue));
  const parsed = parseLocaleDecimal(text, locale);

  return (
    <>
      <Input
        {...props}
        inputMode="decimal"
        autoComplete="off"
        dir="ltr"
        className={cn("text-end tabular-nums", className)}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onValueChange?.(parseLocaleDecimal(event.target.value, locale));
        }}
        onBlur={(event) => {
          if (parsed !== null) setText(format(parsed));
          onBlur?.(event);
        }}
      />
      <input type="hidden" name={name} value={text.trim() === "" ? "" : (parsed ?? text)} />
    </>
  );
}
