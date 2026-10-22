import type { GymSessionRecord } from "@/src/services/gymApi";

// Your training week, from the sessions you've done: how this week's going
// day by day, and how many weeks in a row you've trained. (Nothing's
// planned yet: planning — which days, linked with the calendar — comes
// later, as its own page.)

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Monday first.
const weekIndex = (day: number) => (day + 6) % 7;

export function startOfWeek(date = new Date()) {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - weekIndex(monday.getDay()));
  return monday;
}
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export interface WeekDay {
  date: Date;
  label: string; // "M"
  done: boolean;
  today: boolean;
}

// This week, Monday to Sunday: the sessions done, and the days you trained.
export function thisWeek(sessions: GymSessionRecord[], now = new Date()) {
  const monday = startOfWeek(now);
  const done = sessions.filter((s) => new Date(s.finishedAt) >= monday);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return { date, label: DAY_NAMES[date.getDay()][0], done: done.some((s) => sameDay(new Date(s.finishedAt), date)), today: sameDay(date, now) };
  });
  return { sessions: done, days };
}

// Weeks in a row with a workout in them — counting this week once there's
// one in it.
export function weekStreak(sessions: GymSessionRecord[], now = new Date()) {
  const weeks = new Set(sessions.map((s) => startOfWeek(new Date(s.finishedAt)).getTime()));
  const week = startOfWeek(now);
  if (!weeks.has(week.getTime())) week.setDate(week.getDate() - 7);
  let streak = 0;
  while (weeks.has(week.getTime())) {
    streak++;
    week.setDate(week.getDate() - 7);
  }
  return streak;
}

// "Today", "Yesterday", "Tue, Oct 21".
export function dayLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (sameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// "1h 6m", "48m".
export function durationLabel(seconds: number) {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
