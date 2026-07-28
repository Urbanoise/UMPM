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
