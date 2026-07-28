// Date-only values (purchase/expiry dates) are stored as "YYYY-MM-DD" or as
// an ISO datetime string with a midnight-UTC time component. Constructing a
// plain `new Date(dateOnlyString)` parses that as UTC midnight, and then
// `.toLocaleDateString()` renders it in the device's local timezone — in any
// negative UTC-offset zone that silently rolls the displayed day back by
// one. Every date-only value in this app should go through these helpers
// instead of `new Date(...)` directly, so the calendar day never shifts.

export type DurationUnit = "day" | "week" | "month" | "year";

/** Extracts the YYYY-MM-DD calendar day from a date-only or ISO string. */
export function toDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

/**
 * Parses a "YYYY-MM-DD" calendar day into a local-midnight Date, so it
 * compares/formats consistently with `new Date()` (also local).
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  const dateOnly = toDateOnly(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a date-only value for display, in the local calendar day. */
export function formatDateDisplay(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
  locale = "en-US",
): string | null {
  const date = parseDateOnly(value);
  if (!date) return null;
  return date.toLocaleDateString(locale, options);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today's calendar day as "YYYY-MM-DD", in local time (not UTC). */
export function todayDateInputString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Converts any Date to "YYYY-MM-DD" using its local calendar day. */
export function dateToInputString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Whole calendar days between today and a date-only value (negative = past). */
export function daysUntil(value: string | null | undefined): number | null {
  const date = parseDateOnly(value);
  if (!date) return null;

  const startOfToday = parseDateOnly(todayDateInputString())!;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((date.getTime() - startOfToday.getTime()) / msPerDay);
}

/** Whole calendar days from date-only `from` to date-only `to` (negative if `to` is earlier). */
export function daysBetweenDateOnly(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);
  if (!fromDate || !toDate) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toDate.getTime() - fromDate.getTime()) / msPerDay);
}

/** Converts an average day-count into the "nicest" whole duration unit. */
export function daysToNiceDuration(avgDays: number): {
  amount: number;
  unit: DurationUnit;
} {
  if (avgDays < 10) {
    return { amount: Math.max(1, Math.round(avgDays)), unit: "day" };
  }
  if (avgDays < 60) {
    return { amount: Math.max(1, Math.round(avgDays / 7)), unit: "week" };
  }
  if (avgDays < 400) {
    return { amount: Math.max(1, Math.round(avgDays / 30)), unit: "month" };
  }
  return { amount: Math.max(1, Math.round(avgDays / 365)), unit: "year" };
}

/** Adds a numeric duration (in the given unit) to a date-only value. */
export function addDurationToDate(
  value: string | null | undefined,
  amount: number,
  unit: DurationUnit,
): string {
  const base = parseDateOnly(value) ?? parseDateOnly(todayDateInputString())!;
  const result = new Date(base);

  switch (unit) {
    case "day":
      result.setDate(result.getDate() + amount);
      break;
    case "week":
      result.setDate(result.getDate() + amount * 7);
      break;
    case "month":
      result.setMonth(result.getMonth() + amount);
      break;
    case "year":
      result.setFullYear(result.getFullYear() + amount);
      break;
  }

  return dateToInputString(result);
}
