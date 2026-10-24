import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { bankAccounts, companySettings, exchangeRates } from "@/db/schema";
import { dec } from "@/lib/domain/decimal";
import type { RatesToTry } from "@/lib/domain/types";
import { todayInTurkey } from "@/lib/format/dates";

export async function getCompanySettings() {
  const [row] = await db.select().from(companySettings).where(eq(companySettings.id, 1));
  return row ?? null;
}

export type CompanySettingsRow = NonNullable<Awaited<ReturnType<typeof getCompanySettings>>>;

export async function listBankAccounts() {
  return db
    .select()
    .from(bankAccounts)
    .orderBy(desc(bankAccounts.active), asc(bankAccounts.sort), asc(bankAccounts.currency));
}

export type BankAccountRow = Awaited<ReturnType<typeof listBankAccounts>>[number];

/** The pairs we keep daily rates for: units of TRY per 1 USD / EUR. */
export const RATE_PAIRS = [
  { key: "usd", from: "USD", to: "TRY" },
  { key: "eur", from: "EUR", to: "TRY" },
] as const;

type RateCell = { id: string; version: number; rate: string };

export type RateDay = {
  date: string;
  usd: RateCell | null;
  eur: RateCell | null;
  /** EUR→TRY ÷ USD→TRY: how many USD one EUR buys that day. */
  usdPerEur: string | null;
};

/** Rates per day, newest first. */
export async function listRateDays(limit = 90): Promise<RateDay[]> {
  const dates = await db
    .selectDistinct({ date: exchangeRates.date })
    .from(exchangeRates)
    .where(eq(exchangeRates.toCurrency, "TRY"))
    .orderBy(desc(exchangeRates.date))
    .limit(limit);
  if (dates.length === 0) return [];

  const rows = await db
    .select()
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.toCurrency, "TRY"),
        inArray(exchangeRates.fromCurrency, ["USD", "EUR"]),
        inArray(
          exchangeRates.date,
          dates.map((row) => row.date),
        ),
      ),
    );

  return dates.map(({ date }) => {
    const cell = (from: string): RateCell | null => {
      const row = rows.find((entry) => entry.date === date && entry.fromCurrency === from);
      return row ? { id: row.id, version: row.version, rate: row.rate } : null;
    };
    const usd = cell("USD");
    const eur = cell("EUR");
    return {
      date,
      usd,
      eur,
      usdPerEur: usd && eur ? dec(eur.rate).dividedBy(usd.rate).toDecimalPlaces(4).toFixed(4) : null,
    };
  });
}

export type LatestRates = {
  /** Rates to TRY in the shape the domain pricing functions take. */
  rates: RatesToTry;
  /** Date each rate was entered for. */
  dates: Partial<Record<"USD" | "EUR", string>>;
  /** Whether both USD and EUR have a rate for today (Turkish time). */
  hasToday: boolean;
  today: string;
};

/** The most recent USD→TRY and EUR→TRY rates, whatever day they are from. */
export async function getLatestRates(): Promise<LatestRates> {
  const rows = await db
    .selectDistinctOn([exchangeRates.fromCurrency], {
      from: exchangeRates.fromCurrency,
      date: exchangeRates.date,
      rate: exchangeRates.rate,
    })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.toCurrency, "TRY"), inArray(exchangeRates.fromCurrency, ["USD", "EUR"])))
    .orderBy(exchangeRates.fromCurrency, desc(exchangeRates.date));

  const today = todayInTurkey();
  const rates: RatesToTry = {};
  const dates: LatestRates["dates"] = {};
  for (const row of rows) {
    if (row.from === "USD" || row.from === "EUR") {
      rates[row.from] = row.rate;
      dates[row.from] = row.date;
    }
  }
  return { rates, dates, today, hasToday: dates.USD === today && dates.EUR === today };
}
