"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { changeOrderStatusAction } from "@/actions/orders";
import type { OrderStatus } from "@/db/schema/orders";
import type { StatusTransition } from "@/lib/domain/order-status";
import { FormField, FormMessage } from "@/components/form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

import { useOrderEditorStatus } from "./editor-context";
import { StatusBadge } from "./status-badge";

type Props = {
  orderId: string;
  status: OrderStatus;
  /** Allowed next statuses for this user (lib/domain/order-status.ts). */
  transitions: StatusTransition[];
};

/** The order's status with a "Change status" menu; each change asks for an optional note (a reason when going back). */
export function OrderStatusMenu({ orderId, status, transitions }: Props) {
  const t = useTranslations("orders.status");
  const statuses = useTranslations("orders.statuses");
  const router = useRouter();
  const { version, dirty, saving } = useOrderEditorStatus();
  const [chosen, setChosen] = useState<StatusTransition | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ reason?: string; form?: string }>({});
  const [pending, startTransition] = useTransition();

  const blocked = dirty || saving;

  function choose(transition: StatusTransition) {
    setChosen(transition);
    setNote("");
    setReason("");
    setErrors({});
  }

  function confirm() {
    if (!chosen) return;
    startTransition(async () => {
      const result = await changeOrderStatusAction({ id: orderId, version, to: chosen.to, note, reason });
      if (result.status === "success") {
        setChosen(null);
        router.refresh();
      } else {
        setErrors({ reason: result.fieldErrors?.reason, form: result.formError });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status={status} label={statuses(status)} />
      {transitions.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={buttonVariants({ variant: "outline", size: "sm" })}
            disabled={blocked}
            title={blocked ? t("saveFirst") : undefined}
          >
            {t("change")}
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {transitions.map((transition) => (
              <DropdownMenuItem
                key={transition.to}
                onClick={() => choose(transition)}
                className={transition.move === "cancel" ? "text-destructive" : undefined}
              >
                {t(`moves.${transition.move}`, { status: statuses(transition.to) })}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <Dialog open={chosen !== null} onOpenChange={(open) => (open ? null : setChosen(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {chosen ? t("dialogTitle", { from: statuses(status), to: statuses(chosen.to) }) : null}
            </DialogTitle>
            <DialogDescription>{chosen?.move === "back" ? t("backHint") : t("noteHint")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {chosen?.move === "back" ? (
              <FormField id="status-reason" label={t("reason")} error={errors.reason}>
                <Textarea
                  id="status-reason"
                  value={reason}
                  maxLength={500}
                  aria-invalid={errors.reason ? true : undefined}
                  onChange={(event) => setReason(event.target.value)}
                />
              </FormField>
            ) : null}
            <FormField id="status-note" label={t("note")}>
              <Textarea id="status-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
            </FormField>
            <FormMessage error={errors.form} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setChosen(null)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant={chosen?.move === "cancel" ? "destructive" : "default"}
              disabled={pending}
              onClick={confirm}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
