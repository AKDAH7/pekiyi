"use client";

import { useTranslations } from "next-intl";

import { routing } from "@/i18n/routing";
import { ROLES } from "@/lib/auth/permissions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { value: string; label: string };

type Props = {
  id: string;
  name: string;
  defaultValue: string;
  options: Option[];
  disabled?: boolean;
  invalid?: boolean;
};

/** A form-friendly Select: submits `name=value` like a native <select>. */
export function OptionSelect({ id, name, defaultValue, options, disabled, invalid }: Props) {
  return (
    <>
      <Select name={name} defaultValue={defaultValue} items={options} disabled={disabled}>
        <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Disabled controls aren't submitted; keep the value in the form. */}
      {disabled ? <input type="hidden" name={name} value={defaultValue} /> : null}
    </>
  );
}

export function RoleSelect(props: Omit<Props, "options">) {
  const t = useTranslations("roles");
  return <OptionSelect {...props} options={ROLES.map((role) => ({ value: role, label: t(role) }))} />;
}

export function LocaleSelect(props: Omit<Props, "options">) {
  const t = useTranslations("languages");
  return (
    <OptionSelect
      {...props}
      options={routing.locales.map((locale) => ({ value: locale, label: t(locale) }))}
    />
  );
}
