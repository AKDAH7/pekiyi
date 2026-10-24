import type { DuplicateReason } from "@/lib/domain/duplicates";
import type { FormState } from "@/lib/form-state";

/** An existing customer the new one may duplicate, as shown in the warning. */
export type DuplicateView = {
  id: string;
  companyName: string;
  country: string;
  city: string | null;
  active: boolean;
  reasons: DuplicateReason[];
};

/**
 * The create form's result can also be "possible duplicates — confirm":
 * nothing was saved, and the form offers "Save anyway".
 */
export type CustomerFormState = FormState & { duplicates?: DuplicateView[] };
