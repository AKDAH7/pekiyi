"use client";

import { useRouter } from "next/navigation";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FormState } from "@/lib/form-state";
import { FormMessage } from "@/components/form-field";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  state: FormState;
  /** From useVersionedForm: the conflict is still unresolved. */
  conflict?: boolean;
  successMessage?: string;
};

/**
 * The form-level outcome: the optimistic-locking conflict (with a reload
 * button that refetches the page; the user's input stays until then), any
 * other form error, or a success note.
 */
export function FormStatus({ state, conflict, successMessage }: Props) {
  const t = useTranslations("common");
  const router = useRouter();

  if (state.conflict) {
    if (!conflict) return null;
    return (
      <Alert variant="destructive" className="pe-28">
        <TriangleAlert />
        <AlertDescription className="text-destructive">{state.formError}</AlertDescription>
        <AlertAction>
          <Button type="button" size="sm" variant="outline" onClick={() => router.refresh()}>
            <RefreshCw />
            {t("reload")}
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  return (
    <FormMessage
      error={state.formError}
      success={state.status === "success" ? successMessage : undefined}
    />
  );
}
