"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import { addRatesAction, updateRatesAction } from "@/actions/settings";
import { useFormAction } from "@/hooks/use-form-action";
import { useVersionedForm } from "@/hooks/use-versioned-form";
import { FormField, fieldAria } from "@/components/form-field";
import { FormStatus } from "@/components/form-status";
import { DecimalInput } from "@/components/decimal-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Rates are typed with up to 6 decimals (numeric(14,6)). */
const RATE_DIGITS = { minimumFractionDigits: 2, maximumFractionDigits: 6 };

function RateInputs({
  idPrefix,
  errors,
  defaults,
}: {
  idPrefix: string;
  errors: Record<string, string>;
  defaults?: { usdTry: string; eurTry: string };
}) {
  const t = useTranslations("rates");
  return (
    <>
      <FormField id={`${idPrefix}-usd`} label={t("usdTry")} error={errors.usdTry}>
        <DecimalInput
          {...fieldAria(`${idPrefix}-usd`, errors.usdTry)}
          name="usdTry"
          defaultValue={defaults?.usdTry}
          {...RATE_DIGITS}
        />
      </FormField>
      <FormField id={`${idPrefix}-eur`} label={t("eurTry")} error={errors.eurTry}>
        <DecimalInput
          {...fieldAria(`${idPrefix}-eur`, errors.eurTry)}
          name="eurTry"
          defaultValue={defaults?.eurTry}
          {...RATE_DIGITS}
        />
      </FormField>
    </>
  );
}

export function AddRatesForm({ today }: { today: string }) {
  const t = useTranslations("rates");
  const common = useTranslations("common");
  // Remount the inputs after each successful add so they come back empty.
  const [formKey, setFormKey] = useState(0);
  const { state, pending, onSubmit } = useFormAction(addRatesAction, () => setFormKey((key) => key + 1));
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div key={formKey} className="grid gap-4 sm:grid-cols-3">
        <FormField id="rates-date" label={t("date")} error={errors.date}>
          <Input
            {...fieldAria("rates-date", errors.date)}
            name="date"
            type="date"
            dir="ltr"
            defaultValue={today}
            max={today}
            className="text-start"
          />
        </FormField>
        <RateInputs idPrefix="rates-new" errors={errors} />
      </div>
      <FormStatus state={state} successMessage={t("added")} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? common("saving") : t("addSubmit")}
        </Button>
      </div>
    </form>
  );
}

export type RateDayItem = {
  date: string;
  /** Already formatted for display. */
  dateLabel: string;
  usd: { id: string; version: number; rate: string };
  eur: { id: string; version: number; rate: string };
};

function EditRatesForm({ day, onDone }: { day: RateDayItem; onDone: () => void }) {
  const common = useTranslations("common");
  // Both rows must still be as loaded; their versions together identify the form state.
  const version = `${day.usd.version}:${day.eur.version}`;
  const { state, pending, onSubmit, conflict } = useVersionedForm(updateRatesAction, version, onDone);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="date" value={day.date} />
      <input type="hidden" name="usdId" value={day.usd.id} />
      <input type="hidden" name="usdVersion" value={day.usd.version} />
      <input type="hidden" name="eurId" value={day.eur.id} />
      <input type="hidden" name="eurVersion" value={day.eur.version} />
      <div key={version} className="flex flex-col gap-4">
        <RateInputs
          idPrefix={`rates-${day.date}`}
          errors={state.fieldErrors ?? {}}
          defaults={{ usdTry: day.usd.rate, eurTry: day.eur.rate }}
        />
      </div>
      <FormStatus state={state} conflict={conflict} />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{common("cancel")}</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? common("saving") : common("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditRatesButton({ day }: { day: RateDayItem }) {
  const t = useTranslations("rates");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("editFor", { date: day.dateLabel })}
        onClick={() => setOpen(true)}
      >
        <Pencil />
      </Button>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
          <DialogDescription>{day.dateLabel}</DialogDescription>
        </DialogHeader>
        <EditRatesForm day={day} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
