/**
 * Choices offered on the customer form. Client-safe (only type imports from
 * the schema), so client components can use them too.
 */
import type { DocLanguage } from "@/db/schema/common";
import type { Incoterm, LabelBranding } from "@/db/schema/customers";

export const CUSTOMER_DOC_LANGUAGES = ["tr", "en", "ar"] as const satisfies readonly DocLanguage[];

/** The terms we sell on; the column accepts more for the future. */
export const CUSTOMER_INCOTERMS = ["EXW", "FOB"] as const satisfies readonly Incoterm[];

export const CUSTOMER_LABEL_BRANDINGS = [
  "pekiyi",
  "none",
  "customer_logo",
] as const satisfies readonly LabelBranding[];

export const CUSTOMERS_PAGE_SIZE = 25;
