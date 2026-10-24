/** The business runs on Kayseri time, whatever the server's or browser's timezone. */
export const BUSINESS_TIME_ZONE = "Europe/Istanbul";

/** Today's date in Turkey as YYYY-MM-DD. */
export function todayInTurkey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
