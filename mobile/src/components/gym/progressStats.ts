import { lbs, personalRecords, type ExerciseSession } from "@/src/components/gym/exerciseStats";
import { startOfWeek } from "@/src/components/gym/schedule";
import { beats, bestOf, gainText, setComplete, setVolume, trackOf, type Best } from "@/src/components/gym/tracking";
import type { GymSessionRecord } from "@/src/services/gymApi";

// Progress across all your training, from the sessions you've done: the
// records you've set over time, each exercise's bests, the sets each
// muscle got, and the volume week by week — each exercise by how it's
// logged (its track: see tracking.ts).

type Done = NonNullable<GymSessionRecord["exercises"][number]["exercise"]>;

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const oldestFirst = (sessions: GymSessionRecord[]) => [...sessions].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));

export interface RecordEvent {
  exercise: Done;
  best: Best; // "185 lbs", "12 reps", "−65 lbs", "1:30"
  previous: Best;
  gain: string; // "+10 lbs"
  finishedAt: string;
  sessionId: string;
}

// Every time an exercise beat its best — heavier, more reps, less help,
// longer, farther, by its track — the latest first. (The first time sets
// the mark; it isn't a record. Warm-ups don't count.)
export function recordTimeline(sessions: GymSessionRecord[]): RecordEvent[] {
  const bests = new Map<string, Best>();
  const events: RecordEvent[] = [];
  for (const session of oldestFirst(sessions)) {
    for (const item of session.exercises) {
      if (!item.exercise) continue;
      const id = item.exercise._id;
      const best = bestOf(item.sets, trackOf(item.exercise));
      if (!best) continue;
      const before = bests.get(id);
      if (!before) bests.set(id, best);
      else if (beats(best, before)) {
        events.push({ exercise: item.exercise, best, previous: before, gain: gainText(best, before), finishedAt: session.finishedAt, sessionId: session._id });
        bests.set(id, best);
      }
    }
  }
  return events.reverse();
}

// The records one session set.
export const sessionRecords = (session: GymSessionRecord, sessions: GymSessionRecord[]) => recordTimeline(sessions).filter((r) => r.sessionId === session._id);

export interface Achievement {
  exercise: Done;
  kind: "best" | "total";
  text: string; // "185 lbs", "6,480 lbs in all"
  gain: string; // "+10 lbs"
}

// What one session achieved: each exercise's best beaten (its records), and
// each exercise's total weight in it beating every session's before. (A
// first time sets the mark; warm-ups don't count.)
export function sessionAchievements(session: GymSessionRecord, sessions: GymSessionRecord[]): Achievement[] {
  const achieved: Achievement[] = sessionRecords(session, sessions).map((r) => ({ exercise: r.exercise, kind: "best", text: r.best.text, gain: r.gain }));
  const before = sessions.filter((s) => s.finishedAt < session.finishedAt);
  const total = (sets: GymSessionRecord["exercises"][number]["sets"], track: ReturnType<typeof trackOf>) => sets.filter((s) => s.type !== "warmup").reduce((sum, s) => sum + setVolume(s, track), 0);
  for (const item of session.exercises) {
    if (!item.exercise) continue;
    const track = trackOf(item.exercise);
    const now = total(item.sets, track);
    if (!now) continue;
    const id = item.exercise._id;
    const most = Math.max(0, ...before.map((s) => s.exercises.filter((e) => e.exercise?._id === id).reduce((sum, e) => sum + total(e.sets, track), 0)));
    if (most && now > most) achieved.push({ exercise: item.exercise, kind: "total", text: `${lbs(Math.round(now))} lbs in all`, gain: `+${lbs(Math.round(now - most))} lbs` });
  }
  return achieved;
}

export interface ExerciseBests {
  exercise: Done;
  lastDone: string;
  times: number;
  best: Best | null;
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
    .map(({ exercise, lastDone, sessions: done }) => ({
      exercise,
      lastDone,
      times: done.length,
      best: bestOf(
        done.flatMap((d) => d.sets),
        trackOf(exercise),
      ),
      records: personalRecords(done, trackOf(exercise)),
    }))
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
      const count = item.sets.filter((s) => s.type !== "warmup" && setComplete(s, trackOf(item.exercise))).length;
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
// workouts, sets and the weight moved (no help, holds or cardio in it).
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
      const track = trackOf(item.exercise);
      for (const s of item.sets) {
        if (!setComplete(s, track)) continue;
        week.sets++;
        week.volume += setVolume(s, track);
      }
    }
  }
  return weeks;
}
