"use client";

import { Copy, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { duplicateOrderAction } from "@/actions/orders";
import { useFormAction } from "@/hooks/use-form-action";
import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";

/** "Duplicate order": a new offer for the same customer with the same header and lines (last saved version). */
export function DuplicateOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations("orders.editor");
  const { state, pending, onSubmit } = useFormAction(duplicateOrderAction);
  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input type="hidden" name="id" value={orderId} />
      <Button type="submit" variant="outline" disabled={pending} title={t("duplicateHint")} data-guard-unsaved>
        {pending ? <Loader2 className="animate-spin" /> : <Copy />}
        {t("duplicate")}
      </Button>
      <FormMessage error={state.formError} />
    </form>
  );
}
