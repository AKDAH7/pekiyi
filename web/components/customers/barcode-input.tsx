"use client";

import { useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { useTranslations } from "next-intl";

import { ean13CheckDigit } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type Check =
  | { kind: "empty" }
  | { kind: "notDigits" }
  | { kind: "length"; count: number }
  | { kind: "valid" }
  | { kind: "checkDigit"; expected: number };

/** Same rule the server applies (isValidEan13), explained while typing. */
function check(value: string): Check {
  const digits = value.replace(/\s+/g, "");
  if (!digits) return { kind: "empty" };
  if (/\D/.test(digits)) return { kind: "notDigits" };
  if (digits.length !== 13) return { kind: "length", count: digits.length };
  const expected = ean13CheckDigit(digits.slice(0, 12));
  return expected === Number(digits[12]) ? { kind: "valid" } : { kind: "checkDigit", expected };
}

/**
 * EAN-13 input with a live check-digit verdict. The server's error is about
 * the value that was submitted, so it is shown only until the user edits it.
 */
export function BarcodeInput({
  id,
  defaultValue,
  error: serverError,
}: {
  id: string;
  defaultValue?: string;
  error?: string;
}) {
  const t = useTranslations("customers.codes");
  const [value, setValue] = useState(defaultValue ?? "");
  // Remember which value a newly arrived server error belongs to.
  const [seenError, setSeenError] = useState(serverError);
  const [errorValue, setErrorValue] = useState(serverError ? value : null);
  if (serverError !== seenError) {
    setSeenError(serverError);
    setErrorValue(serverError ? value : null);
  }
  const error = serverError && value === errorValue ? serverError : undefined;
  const result = check(value);
  const bad = result.kind === "notDigits" || result.kind === "checkDigit" || (result.kind === "length" && result.count > 13);

  const message =
    result.kind === "empty"
      ? t("barcodeHint")
      : result.kind === "notDigits"
        ? t("barcodeNotDigits")
        : result.kind === "length"
          ? t("barcodeLength", { count: result.count })
          : result.kind === "valid"
            ? t("barcodeValid")
            : t("barcodeCheckDigit", { digit: result.expected });

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        name="barcode"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        maxLength={20}
        className="text-start font-mono tabular-nums"
        aria-invalid={error || bad ? true : undefined}
        aria-describedby={`${id}-status`}
      />
      <p
        id={`${id}-status`}
        aria-live="polite"
        role={error ? "alert" : undefined}
        className={cn(
          "flex items-center gap-1 text-sm",
          error || bad ? "text-destructive" : result.kind === "valid" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
        )}
      >
        {error || bad ? <CircleX className="size-4" aria-hidden /> : null}
        {!error && result.kind === "valid" ? <CircleCheck className="size-4" aria-hidden /> : null}
        {error ?? message}
      </p>
    </div>
  );
}
