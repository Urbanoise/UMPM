import { parseDate, shiftDate } from "./dates";

// Fixed non-working days in Georgia, as MM-DD. Orthodox Easter moves, so it is
// computed below. Days the government declares off for one year are not listed;
// the only cost is a reminder arriving a day later than it should.
const FIXED_HOLIDAYS = new Set([
  "01-01", "01-02", "01-07", "01-19",
  "03-03", "03-08",
  "04-09",
  "05-09", "05-12", "05-26",
  "08-28",
  "10-14",
  "11-23",
]);

/** Orthodox Easter Sunday as YYYY-MM-DD: the Julian date, moved to the Gregorian calendar. */
export function orthodoxEaster(year: number): string {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const n = d + e + 114;
  const julian = new Date(Date.UTC(year, Math.floor(n / 31) - 1, (n % 31) + 1));
  // The calendars are 13 days apart until 2100.
  return new Date(julian.getTime() + 13 * 86_400_000).toISOString().slice(0, 10);
}

export function isWorkingDay(date: string): boolean {
  const weekday = parseDate(date).getDay();
  if (weekday === 0 || weekday === 6) return false;
  if (FIXED_HOLIDAYS.has(date.slice(5))) return false;
  const easter = orthodoxEaster(Number(date.slice(0, 4)));
  // Good Friday to Easter Monday.
  return ![-2, -1, 0, 1].some((days) => shiftDate(easter, days) === date);
}

/**
 * Working days after `from`, up to and including `to`; negative once `to` has
 * passed. A deadline three working days away counts 3, one due today counts 0.
 */
export function workingDaysUntil(from: string, to: string): number {
  if (to < from) return -1;
  let count = 0;
  for (let d = shiftDate(from, 1); d <= to; d = shiftDate(d, 1)) {
    if (isWorkingDay(d)) count++;
  }
  return count;
}

/** Today in Georgia, whatever timezone the server runs in. */
export function tbilisiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" }).format(
    new Date()
  );
}
