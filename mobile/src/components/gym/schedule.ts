import type { GymSessionRecord, GymWorkout } from "@/src/services/gymApi";

// Your training week, from your workouts and the sessions you've done: the
// day each workout is for (from its name — "Upper A (Wednesday)", "Legs
// Mon"), what's up next, how this week's going, how many weeks in a row
// you've trained, and the records a session set.

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_WORDS = DAY_NAMES.map((day, i) => [i, new RegExp(`\\b(${day}|${day.slice(0, 3)})\\b`, "i")] as const);

// The weekday a workout is for (0 Sunday … 6 Saturday), if its name says.
export function workoutDay(name: string): number | null {
  return DAY_WORDS.find(([, word]) => word.test(name))?.[0] ?? null;
}
// Monday first.
const weekIndex = (day: number) => (day + 6) % 7;

export function startOfWeek(date = new Date()) {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - weekIndex(monday.getDay()));
  return monday;
}
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Workouts in the order of the week (Monday's first), then the ones for no
// day in particular, as they were.
export function sortWorkouts(workouts: GymWorkout[]) {
  const day = (w: GymWorkout) => {
    const d = workoutDay(w.name);
    return d === null ? 7 : weekIndex(d);
  };
  return [...workouts].sort((a, b) => day(a) - day(b));
}

export interface UpNext {
  workout: GymWorkout;
  when: string; // "Today", "Tomorrow", "Monday"
}

// What to do next: today's workout if it isn't done yet, else the next
// one in the week. Without days in the names, the one done longest ago
// (or never).
export function upNext(workouts: GymWorkout[], sessions: GymSessionRecord[], now = new Date()): UpNext | null {
  const ready = workouts.filter((w) => w.exercises.some((e) => e.exercise));
  if (!ready.length) return null;
  const scheduled = ready.filter((w) => workoutDay(w.name) !== null);
  if (scheduled.length) {
    for (let ahead = 0; ahead < 7; ahead++) {
      const date = new Date(now);
      date.setDate(date.getDate() + ahead);
      const workout = scheduled.find((w) => workoutDay(w.name) === date.getDay());
      if (!workout) continue;
      // (Today's, once done today, is done.)
      if (ahead === 0 && sessions.some((s) => s.workout === workout._id && sameDay(new Date(s.finishedAt), now))) continue;
      return { workout, when: ahead === 0 ? "Today" : ahead === 1 ? "Tomorrow" : DAY_NAMES[date.getDay()] };
    }
  }
  const lastDone = (w: GymWorkout) => Math.max(0, ...sessions.filter((s) => s.workout === w._id).map((s) => new Date(s.finishedAt).getTime()));
  const workout = [...ready].sort((a, b) => lastDone(a) - lastDone(b))[0];
  return { workout, when: "Next" };
}

export interface WeekDay {
  date: Date;
  label: string; // "M"
  done: boolean;
  planned: boolean;
  today: boolean;
  past: boolean;
}

// This week, Monday to Sunday: the sessions done, the days you trained and
// the days you meant to, and the target (one for each workout with a day).
export function thisWeek(workouts: GymWorkout[], sessions: GymSessionRecord[], now = new Date()) {
  const monday = startOfWeek(now);
  const done = sessions.filter((s) => new Date(s.finishedAt) >= monday);
  const plannedDays = new Set(workouts.map((w) => workoutDay(w.name)).filter((d): d is number => d !== null));
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const today = sameDay(date, now);
    return {
      date,
      label: DAY_NAMES[date.getDay()][0],
      done: done.some((s) => sameDay(new Date(s.finishedAt), date)),
      planned: plannedDays.has(date.getDay()),
      today,
      past: !today && date < now,
    };
  });
  return { sessions: done, days, target: plannedDays.size || null };
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

export interface SessionRecord {
  name: string;
  weight: number;
}

// The records a session set: each exercise lifted heavier than in any
// session before it. (A first time isn't a record.)
export function sessionRecords(session: GymSessionRecord, sessions: GymSessionRecord[]): SessionRecord[] {
  const before = sessions.filter((s) => new Date(s.finishedAt) < new Date(session.finishedAt));
  const records: SessionRecord[] = [];
  for (const item of session.exercises) {
    if (!item.exercise) continue;
    const id = item.exercise._id;
    const heaviest = Math.max(0, ...item.sets.map((s) => s.weight ?? 0));
    const earlier = before.flatMap((s) => s.exercises.filter((e) => e.exercise?._id === id).flatMap((e) => e.sets));
    if (!heaviest || !earlier.length) continue;
    if (heaviest > Math.max(0, ...earlier.map((s) => s.weight ?? 0))) records.push({ name: item.exercise.name, weight: heaviest });
  }
  return records;
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
