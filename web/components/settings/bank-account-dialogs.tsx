"use client";

import { useState } from "react";
import { CircleCheck, CircleX, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  createBankAccountAction,
  setBankAccountActiveAction,
  updateBankAccountAction,
} from "@/actions/settings";
import { useFormAction } from "@/hooks/use-form-action";
import { useVersionedForm } from "@/hooks/use-versioned-form";
import { formatIban } from "@/lib/domain/iban";
import { CURRENCIES } from "@/lib/validation/currencies";
import { FormField, fieldAria } from "@/components/form-field";
import { FormStatus } from "@/components/form-status";
import { OptionSelect } from "@/components/option-select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export type BankAccountItem = {
  id: string;
  version: number;
  bankName: string;
  swift: string | null;
  branch: string | null;
  beneficiary: string;
  currency: string;
  iban: string;
  active: boolean;
};

function Footer({ pending, submitLabel }: { pending: boolean; submitLabel: string }) {
  const common = useTranslations("common");
  return (
    <DialogFooter>
      <DialogClose render={<Button type="button" variant="outline" />}>{common("cancel")}</DialogClose>
      <Button type="submit" disabled={pending}>
        {pending ? common("saving") : submitLabel}
      </Button>
    </DialogFooter>
  );
}

function AccountFields({ account, errors }: { account?: BankAccountItem; errors: Record<string, string> }) {
  const t = useTranslations("bankAccounts.fields");
  const prefix = account ? `bank-${account.id}` : "bank-new";
  const text = (name: "bankName" | "swift" | "branch" | "beneficiary", ltr = false) => (
    <FormField id={`${prefix}-${name}`} label={t(name)} error={errors[name]}>
      <Input
        {...fieldAria(`${prefix}-${name}`, errors[name])}
        name={name}
        dir={ltr ? "ltr" : undefined}
        className={ltr ? "text-start uppercase" : undefined}
        defaultValue={account?.[name] ?? ""}
      />
    </FormField>
  );

  return (
    <>
      {text("bankName")}
      <div className="grid gap-4 sm:grid-cols-2">
        {text("swift", true)}
        {text("branch")}
      </div>
      {text("beneficiary")}
      <FormField id={`${prefix}-currency`} label={t("currency")} error={errors.currency}>
        <OptionSelect
          id={`${prefix}-currency`}
          name="currency"
          defaultValue={account?.currency ?? "USD"}
          options={CURRENCIES.map((code) => ({ value: code, label: code }))}
          invalid={!!errors.currency}
        />
      </FormField>
      <FormField id={`${prefix}-iban`} label={t("iban")} error={errors.iban}>
        <Input
          {...fieldAria(`${prefix}-iban`, errors.iban)}
          name="iban"
          dir="ltr"
          spellCheck={false}
          autoComplete="off"
          className="text-start font-mono uppercase"
          defaultValue={account ? formatIban(account.iban) : ""}
          onBlur={(event) => {
            event.currentTarget.value = formatIban(event.currentTarget.value);
          }}
        />
      </FormField>
    </>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("bankAccounts");
  const { state, pending, onSubmit } = useFormAction(createBankAccountAction, onDone);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <AccountFields errors={state.fieldErrors ?? {}} />
      <FormStatus state={state} />
      <Footer pending={pending} submitLabel={t("create")} />
    </form>
  );
}

export function CreateBankAccountButton() {
  const t = useTranslations("bankAccounts");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t("new")}
      </Button>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <CreateForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ account, onDone }: { account: BankAccountItem; onDone: () => void }) {
  const common = useTranslations("common");
  const { state, pending, onSubmit, conflict } = useVersionedForm(
    updateBankAccountAction,
    account.version,
    onDone,
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={account.id} />
      <input type="hidden" name="version" value={account.version} />
      <div key={account.version} className="flex flex-col gap-4">
        <AccountFields account={account} errors={state.fieldErrors ?? {}} />
      </div>
      <FormStatus state={state} conflict={conflict} />
      <Footer pending={pending} submitLabel={common("save")} />
    </form>
  );
}

function SetActiveForm({ account, onDone }: { account: BankAccountItem; onDone: () => void }) {
  const t = useTranslations("bankAccounts");
  const common = useTranslations("common");
  const { state, pending, onSubmit, conflict } = useVersionedForm(
    setBankAccountActiveAction,
    account.version,
    onDone,
  );
  const activating = !account.active;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={account.id} />
      <input type="hidden" name="version" value={account.version} />
      <input type="hidden" name="active" value={String(activating)} />
      <FormStatus state={state} conflict={conflict} />
      <AlertDialogFooter>
        <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
        <Button type="submit" variant={activating ? "default" : "destructive"} disabled={pending}>
          {pending ? common("saving") : t(activating ? "reactivate" : "deactivate")}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

export function BankAccountActions({ account }: { account: BankAccountItem }) {
  const t = useTranslations("bankAccounts");
  const common = useTranslations("common");
  const [open, setOpen] = useState<"edit" | "active" | null>(null);
  const close = () => setOpen(null);
  const onOpenChange = (next: boolean) => {
    if (!next) close();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label={common("actionsFor", { name: account.currency })}>
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen("edit")}>
            <Pencil />
            {common("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant={account.active ? "destructive" : "default"}
            onClick={() => setOpen("active")}
          >
            {account.active ? <CircleX /> : <CircleCheck />}
            {t(account.active ? "deactivate" : "reactivate")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "edit"} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <EditForm account={account} onDone={close} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={open === "active"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(account.active ? "deactivateTitle" : "reactivateTitle", { currency: account.currency })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(account.active ? "deactivateDescription" : "reactivateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <SetActiveForm account={account} onDone={close} />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
