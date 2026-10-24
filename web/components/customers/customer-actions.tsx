"use client";

import { useState } from "react";
import { CircleCheck, CircleX, MoreHorizontal, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { deleteCustomerAction, setCustomerActiveAction } from "@/actions/customers";
import { useFormAction } from "@/hooks/use-form-action";
import { useVersionedForm } from "@/hooks/use-versioned-form";
import { FormMessage } from "@/components/form-field";
import { FormStatus } from "@/components/form-status";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Customer = { id: string; version: number; companyName: string; active: boolean };

function SetActiveForm({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const t = useTranslations("customers");
  const common = useTranslations("common");
  const { state, pending, onSubmit, conflict } = useVersionedForm(setCustomerActiveAction, customer.version, onDone);
  const activating = !customer.active;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={customer.id} />
      <input type="hidden" name="version" value={customer.version} />
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

function DeleteForm({ customer }: { customer: Customer }) {
  const common = useTranslations("common");
  // On success the action redirects to the list.
  const { state, pending, onSubmit } = useFormAction(deleteCustomerAction);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={customer.id} />
      <input type="hidden" name="version" value={customer.version} />
      <FormMessage error={state.formError} />
      <AlertDialogFooter>
        <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? common("saving") : common("delete")}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

/** "⋯" menu on the customer page. Delete is offered to admins for customers without orders. */
export function CustomerActions({ customer, canDelete }: { customer: Customer; canDelete: boolean }) {
  const t = useTranslations("customers");
  const common = useTranslations("common");
  const [open, setOpen] = useState<"active" | "delete" | null>(null);
  const close = () => setOpen(null);
  const onOpenChange = (next: boolean) => {
    if (!next) close();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" aria-label={common("actionsFor", { name: customer.companyName })}>
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant={customer.active ? "destructive" : "default"} onClick={() => setOpen("active")}>
            {customer.active ? <CircleX /> : <CircleCheck />}
            {t(customer.active ? "deactivate" : "reactivate")}
          </DropdownMenuItem>
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setOpen("delete")}>
                <Trash2 />
                {common("delete")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={open === "active"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(customer.active ? "deactivateTitle" : "reactivateTitle", { name: customer.companyName })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(customer.active ? "deactivateDescription" : "reactivateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <SetActiveForm customer={customer} onDone={close} />
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={open === "delete"} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { name: customer.companyName })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <DeleteForm customer={customer} />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
