"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import type { LocalizedText } from "@/db/schema/common";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const LANGUAGES = ["tr", "en", "ar"] as const;
type Language = (typeof LANGUAGES)[number];

type Props = {
  id: string;
  /** Submitted as `${name}.tr`, `${name}.en`, `${name}.ar` (see lib/form-data.ts). */
  name: string;
  label: string;
  defaultValue?: LocalizedText | null;
  /** The form's field errors; picks `${name}` and `${name}.<lang>`. */
  errors?: Record<string, string>;
  hint?: string;
  /** Only the label's text for screen readers (table cells). */
  hideLabel?: boolean;
  disabled?: boolean;
  maxLength?: number;
  multiline?: boolean;
  className?: string;
  /** Called with all three languages on every change (for editors that keep their own state). */
  onValueChange?: (value: LocalizedText) => void;
};

function TranslatedField({
  id,
  name,
  label,
  defaultValue,
  errors = {},
  hint,
  hideLabel,
  disabled,
  maxLength,
  multiline,
  className,
  onValueChange,
}: Props) {
  const t = useTranslations("translated");
  const languages = useTranslations("languages");
  const [values, setValues] = useState<Record<Language, string>>({
    tr: defaultValue?.tr ?? "",
    en: defaultValue?.en ?? "",
    ar: defaultValue?.ar ?? "",
  });

  const errorOf = (lang: Language) => errors[`${name}.${lang}`];
  const firstErrorLang = LANGUAGES.find((lang) => errorOf(lang));
  const [active, setActive] = useState<Language>(firstErrorLang ?? "tr");
  const error = errors[name] ?? (firstErrorLang ? errorOf(firstErrorLang) : undefined);
  const errorId = `${id}-error`;

  const Control = multiline ? Textarea : Input;

  function update(next: Record<Language, string>) {
    setValues(next);
    onValueChange?.(next);
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={`${id}-${active}`} className={hideLabel ? "sr-only" : undefined}>
          {label}
        </Label>
        <div role="tablist" aria-label={label} className="inline-flex rounded-md bg-muted p-0.5">
          {LANGUAGES.map((lang) => {
            const empty = values[lang].trim() === "";
            return (
              <button
                key={lang}
                type="button"
                role="tab"
                id={`${id}-tab-${lang}`}
                aria-selected={active === lang}
                aria-controls={`${id}-${lang}`}
                title={empty ? t("emptyIn", { language: languages(lang) }) : languages(lang)}
                onClick={() => setActive(lang)}
                className={cn(
                  "relative inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                  active === lang && "bg-background text-foreground shadow-sm",
                  errorOf(lang) && "text-destructive",
                )}
              >
                {lang.toUpperCase()}
                {empty ? (
                  <span
                    aria-label={t("emptyIn", { language: languages(lang) })}
                    className="size-1.5 rounded-full bg-amber-500"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {LANGUAGES.map((lang) => (
        <Control
          key={lang}
          id={`${id}-${lang}`}
          name={`${name}.${lang}`}
          aria-label={`${label} (${languages(lang)})`}
          lang={lang}
          dir={lang === "ar" ? "rtl" : "ltr"}
          value={values[lang]}
          onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            update({ ...values, [lang]: event.target.value })
          }
          disabled={disabled}
          maxLength={maxLength}
          aria-invalid={errorOf(lang) || (lang === "tr" && errors[name]) ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          // Inactive languages stay in the form (and are submitted), just hidden.
          className={cn("text-start", active !== lang && "hidden")}
        />
      ))}

      {active !== "tr" && !disabled ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={values.tr.trim() === ""}
            onClick={() => update({ ...values, [active]: values.tr })}
          >
            <Copy />
            {t("copyFromTr")}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** One text in TR / EN / AR tabs; the value submitted is the {tr,en,ar} object. */
export function TranslatedInput(props: Omit<Props, "multiline">) {
  return <TranslatedField {...props} />;
}

export function TranslatedTextarea(props: Omit<Props, "multiline">) {
  return <TranslatedField {...props} multiline />;
}
