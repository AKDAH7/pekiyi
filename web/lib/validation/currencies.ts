/** Currencies we price, invoice and keep bank accounts in. Client-safe. */
export const CURRENCIES = ["TRY", "USD", "EUR"] as const;
export type AppCurrency = (typeof CURRENCIES)[number];
