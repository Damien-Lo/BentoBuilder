import { TODO_LIST_COLORS } from "@/src/components/todo/theme";
import type { EventCalendar, EventOccurrence, EventRepeat } from "@/src/services/calendarApi";
import { parseLocalDate, toDateStr } from "@/src/utils/mealPlan";

// Calendar colours reuse the to-do list palette (Tailwind 600 shades).
export const CALENDAR_COLORS = TODO_LIST_COLORS;

export function calendarColor(calendar: Pick<EventCalendar, "color"> | null | undefined): string {
  return (CALENDAR_COLORS[calendar?.color ?? "blue"] ?? CALENDAR_COLORS.blue).value;
}

export const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function addDays(date: string, days: number): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / 86400000);
}

// Same day-of-month in the month `delta` away (clamped to its length).
export function shiftMonth(date: string, delta: number): string {
  const d = parseLocalDate(date);
  const last = new Date(d.getFullYear(), d.getMonth() + delta + 1, 0).getDate();
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + delta, Math.min(d.getDate(), last)));
}

// The `weekStartDay`-starting week containing `date`.
export function weekOf(date: string, weekStartDay: number): string[] {
  const d = parseLocalDate(date);
  const back = (d.getDay() - weekStartDay + 7) % 7;
  const start = addDays(date, -back);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// Whole weeks covering `date`'s month (5 or 6 rows of 7).
export function monthGrid(date: string, weekStartDay: number): string[][] {
  const d = parseLocalDate(date);
  const first = toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
  const last = toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const weeks: string[][] = [];
  let week = weekOf(first, weekStartDay);
  while (week[0] <= last) {
    weeks.push(week);
    week = week.map((day) => addDays(day, 7));
  }
  return weeks;
}

export function minutesLabel(minutes: number): string {
  const m = Math.max(0, Math.min(1440, Math.round(minutes)));
  const h = Math.floor(m / 60) % 24;
  return `${String(m === 1440 ? 24 : h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function durationLabel(minutes: number): string {
  if (minutes <= 0) return "0 minutes";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  return parts.join(" ");
}

// "Thursday, 8 October 2026"
export function longDateLabel(date: string): string {
  const d = parseLocalDate(date);
  return `${WEEKDAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

// "Thu, 8 Oct"
export function shortDateLabel(date: string): string {
  const d = parseLocalDate(date);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export const REPEAT_OPTIONS: { value: EventRepeat["frequency"] | null; label: string }[] = [
  { value: null, label: "Never" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
];

// "Repeats weekly until 31 Jan 2027"
export function repeatLabel(repeat: EventRepeat | null, date: string): string | null {
  if (!repeat) return null;
  const d = parseLocalDate(date);
  const every = repeat.interval > 1;
  const base = {
    daily: every ? `every ${repeat.interval} days` : "daily",
    weekdays: "every weekday",
    weekly: `${every ? `every ${repeat.interval} weeks` : "weekly"} on ${weeklyDaysLabel(repeat, date)}`,
    monthly: every ? `every ${repeat.interval} months on day ${d.getDate()}` : `monthly on day ${d.getDate()}`,
    yearly: `yearly on ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`,
  }[repeat.frequency];
  if (!repeat.until) return `Repeats ${base}`;
  const u = parseLocalDate(repeat.until);
  return `Repeats ${base} until ${u.getDate()} ${MONTHS_SHORT[u.getMonth()]} ${u.getFullYear()}`;
}

// The days a weekly repeat falls on: the chosen ones, else the start date's.
export function weeklyDays(repeat: Pick<EventRepeat, "weekdays"> | null | undefined, date: string): number[] {
  const days = repeat?.weekdays?.length ? repeat.weekdays : [parseLocalDate(date).getDay()];
  return [...new Set(days)].sort((a, b) => a - b);
}

// "Friday", or "Mon, Wed, Fri", or "weekdays".
function weeklyDaysLabel(repeat: EventRepeat, date: string): string {
  const days = weeklyDays(repeat, date);
  if (days.length === 1) return WEEKDAYS_FULL[days[0]];
  if (days.join() === "1,2,3,4,5") return "weekdays";
  if (days.length === 7) return "every day";
  return days.map((d) => WEEKDAYS_SHORT[d]).join(", ");
}

export const REMIND_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "None" },
  { value: 0, label: "At time of event" },
  { value: 5, label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
];

export function remindLabel(value: number | null): string {
  return REMIND_OPTIONS.find((o) => o.value === value)?.label ?? `${value} minutes before`;
}

// The part of a timed occurrence that falls on `day` (an event running past
// midnight shows on both days), in minutes, or null if it doesn't.
export function segmentOnDay(event: EventOccurrence, day: string): { start: number; end: number } | null {
  if (event.allDay || day < event.occurrenceDate || day > event.occurrenceEndDate) return null;
  const start = day === event.occurrenceDate ? event.startMinutes : 0;
  const end = day === event.occurrenceEndDate ? event.endMinutes : 1440;
  return end > start ? { start, end } : day === event.occurrenceDate ? { start, end: start + 15 } : null;
}

export interface LaidOutEvent {
  event: EventOccurrence;
  start: number;
  end: number;
  column: number;
  columns: number;
}

// Side-by-side columns for overlapping events, like every calendar app:
// events that overlap (directly or through a chain) share the width.
export function layoutDay(events: EventOccurrence[], day: string): LaidOutEvent[] {
  const segments = events
    .map((event) => ({ event, seg: segmentOnDay(event, day) }))
    .filter((s): s is { event: EventOccurrence; seg: { start: number; end: number } } => s.seg != null)
    .sort((a, b) => a.seg.start - b.seg.start || b.seg.end - a.seg.end);

  const out: LaidOutEvent[] = [];
  let cluster: LaidOutEvent[] = [];
  let clusterEnd = -1;
  const columnEnds: number[] = [];

  const flush = () => {
    const columns = Math.max(1, ...cluster.map((c) => c.column + 1));
    for (const c of cluster) out.push({ ...c, columns });
    cluster = [];
    columnEnds.length = 0;
  };

  for (const { event, seg } of segments) {
    // Overlap uses the real times, so back-to-back events (07:00–07:15 then
    // 07:15–08:15) each keep the full width.
    const end = Math.max(seg.end, seg.start + 1);
    if (seg.start >= clusterEnd && cluster.length) flush();
    let column = columnEnds.findIndex((e) => e <= seg.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }
    cluster.push({ event, start: seg.start, end: seg.end, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) flush();
  return out;
}
