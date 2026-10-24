"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: string;
  disabled?: boolean;
};

/** A checkbox submitted as `name=on` when ticked (see `checkbox` in lib/validation/common.ts). */
export function CheckboxField({ id, name, label, defaultChecked, hint, disabled }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="font-normal">
        <Checkbox id={id} name={name} defaultChecked={defaultChecked} disabled={disabled} />
        {label}
      </Label>
      {hint ? <p className="ps-6 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
