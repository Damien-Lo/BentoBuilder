import { personalRecords, type ExerciseSession } from "@/src/components/gym/exerciseStats";
import { startOfWeek } from "@/src/components/gym/schedule";
import type { GymSessionRecord } from "@/src/services/gymApi";

// Progress across all your training, from the sessions you've done: the
// records you've set over time, each exercise's bests, the sets each
// muscle got, and the volume week by week.

type Done = NonNullable<GymSessionRecord["exercises"][number]["exercise"]>;

// (Assisted exercises — more weight is more help — aren't weighed like the
// rest: they're left out of records for now.)
export const isAssisted = (name: string) => /assisted/i.test(name);

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const oldestFirst = (sessions: GymSessionRecord[]) => [...sessions].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));

export interface RecordEvent {
  exercise: Done;
  weight: number;
  previous: number;
  finishedAt: string;
  sessionId: string;
}

// Every time an exercise was lifted heavier than ever before, the latest
// first. (The first weighed time sets the mark; it isn't a record. Warm-ups
// don't count.)
export function recordTimeline(sessions: GymSessionRecord[]): RecordEvent[] {
  const best = new Map<string, number>();
  const events: RecordEvent[] = [];
  for (const session of oldestFirst(sessions)) {
    for (const item of session.exercises) {
      if (!item.exercise || isAssisted(item.exercise.name)) continue;
      const id = item.exercise._id;
      const heaviest = Math.max(0, ...item.sets.filter((s) => (s.reps ?? 0) > 0 && s.type !== "warmup").map((s) => s.weight ?? 0));
      if (!heaviest) continue;
      const before = best.get(id) ?? 0;
      if (before && heaviest > before) events.push({ exercise: item.exercise, weight: heaviest, previous: before, finishedAt: session.finishedAt, sessionId: session._id });
      if (heaviest > before) best.set(id, heaviest);
    }
  }
  return events.reverse();
}

// The records one session set.
export const sessionRecords = (session: GymSessionRecord, sessions: GymSessionRecord[]) => recordTimeline(sessions).filter((r) => r.sessionId === session._id);

export interface ExerciseBests {
  exercise: Done;
  lastDone: string;
  times: number;
  records: ReturnType<typeof personalRecords>;
}

// Each exercise you've done, with its bests — the most recently done first.
export function exerciseBests(sessions: GymSessionRecord[]): ExerciseBests[] {
  const byExercise = new Map<string, { exercise: Done; lastDone: string; sessions: ExerciseSession[] }>();
  for (const session of oldestFirst(sessions)) {
    for (const item of session.exercises) {
      if (!item.exercise) continue;
      const entry = byExercise.get(item.exercise._id) ?? { exercise: item.exercise, lastDone: session.finishedAt, sessions: [] };
      entry.lastDone = session.finishedAt;
      entry.sessions.push({ date: localDay(session.finishedAt), sets: item.sets });
      byExercise.set(item.exercise._id, entry);
    }
  }
  return [...byExercise.values()]
    .map(({ exercise, lastDone, sessions: done }) => ({ exercise, lastDone, times: done.length, records: personalRecords(done) }))
    .sort((a, b) => b.lastDone.localeCompare(a.lastDone));
}

// The library's muscles, as they're listed.
export const MUSCLES = ["chest", "shoulders", "biceps", "triceps", "forearms", "lats", "middle back", "lower back", "traps", "abdominals", "glutes", "abductors", "adductors", "quadriceps", "hamstrings", "calves", "neck"];
export const muscleLabel = (muscle: string) => muscle[0].toUpperCase() + muscle.slice(1);

// The sets each muscle got since a time: a whole set for each muscle an
// exercise mainly works, half a set for those it also works. (Warm-ups
// don't count.)
export function muscleSets(sessions: GymSessionRecord[], since: Date) {
  const sets: Record<string, number> = {};
  for (const session of sessions) {
    if (new Date(session.finishedAt) < since) continue;
    for (const item of session.exercises) {
      if (!item.exercise) continue;
      const count = item.sets.filter((s) => (s.reps ?? 0) > 0 && s.type !== "warmup").length;
      for (const m of item.exercise.primaryMuscles) sets[m] = (sets[m] ?? 0) + count;
      for (const m of item.exercise.secondaryMuscles) sets[m] = (sets[m] ?? 0) + count / 2;
    }
  }
  return sets;
}

export interface WeekTotals {
  start: Date;
  workouts: number;
  sets: number;
  volume: number;
}

// The last `count` weeks (Monday to Sunday), oldest first, each with its
// workouts, sets and the weight moved.
export function weeklyTotals(sessions: GymSessionRecord[], count: number, now = new Date()): WeekTotals[] {
  const thisWeek = startOfWeek(now);
  const weeks: WeekTotals[] = Array.from({ length: count }, (_, i) => {
    const start = new Date(thisWeek);
    start.setDate(thisWeek.getDate() - 7 * (count - 1 - i));
    return { start, workouts: 0, sets: 0, volume: 0 };
  });
  const index = new Map(weeks.map((w, i) => [w.start.getTime(), i]));
  for (const session of sessions) {
    const i = index.get(startOfWeek(new Date(session.finishedAt)).getTime());
    if (i === undefined) continue;
    const week = weeks[i];
    week.workouts++;
    for (const item of session.exercises) {
      for (const s of item.sets) {
        if (!(s.reps ?? 0)) continue;
        week.sets++;
        if (!item.exercise || !isAssisted(item.exercise.name)) week.volume += (s.weight ?? 0) * (s.reps ?? 0);
      }
    }
  }
  return weeks;
}
