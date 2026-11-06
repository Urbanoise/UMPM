// Some browsers ship without Georgian ICU data — Intl silently falls back to
// en-US — so Georgian month/weekday names are hardcoded instead of using Intl.
const KA_MONTHS_SHORT = [
  "იან", "თებ", "მარ", "აპრ", "მაი", "ივნ",
  "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ",
];
const KA_MONTHS_LONG = [
  "იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი",
  "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი",
];
// Monday-first narrow weekday initials
const KA_WEEKDAYS_NARROW = ["ო", "ს", "ო", "ხ", "პ", "შ", "კ"];

function isKa(locale: string) {
  return locale.startsWith("ka");
}

export function parseDate(s: string): Date {
  return new Date(s + "T00:00:00");
}

export function todayStr(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function fmtDate(
  s: string | null | undefined,
  locale: string = "en-GB"
): string {
  if (!s) return "—";
  const d = parseDate(s);
  if (isKa(locale)) {
    return `${d.getDate()} ${KA_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  }
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtShortDate(s: string, locale: string = "en-GB"): string {
  const d = parseDate(s);
  if (isKa(locale)) {
    return `${d.getDate()} ${KA_MONTHS_SHORT[d.getMonth()]}`;
  }
  // Month-first ordering ("Jul 19") regardless of the English locale variant.
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function fmtMonthYear(d: Date, locale: string): string {
  if (isKa(locale)) {
    return `${KA_MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  }
  return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** "იან ’26" / "Jan ’26" — compact month label for timeline axes. */
export function fmtMonthShort(d: Date, locale: string): string {
  const yy = String(d.getFullYear()).slice(2);
  if (isKa(locale)) return `${KA_MONTHS_SHORT[d.getMonth()]} ’${yy}`;
  return `${d.toLocaleDateString("en-US", { month: "short" })} ’${yy}`;
}

/** Monday-first narrow weekday initials. */
export function weekdayInitials(locale: string): string[] {
  if (isKa(locale)) return [...KA_WEEKDAYS_NARROW];
  // 2024-01-01 was a Monday
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "narrow" })
  );
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** YYYY-MM-DD from a year, a 0-based month and a day of the month. */
export function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * The Monday-to-Sunday weeks covering a month, as YYYY-MM-DD dates. The first
 * and last weeks run into the neighbouring months, so every row has seven days.
 */
export function monthWeeks(year: number, month: number): string[][] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday
  const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7);
  return Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, column) => {
      const d = new Date(year, month, 1 - firstWeekday + week * 7 + column);
      return ymd(d.getFullYear(), d.getMonth(), d.getDate());
    })
  );
}

/** A YYYY-MM-DD date moved by whole days, in local time. */
export function shiftDate(s: string, days: number): string {
  const d = addDays(parseDate(s), days);
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000
  );
}
