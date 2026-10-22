import { setComplete, setVolume, timeText, type AnySet, type Track } from "@/src/components/gym/tracking";

// An exercise's progress, worked out from the sessions it was done in —
// each the sets that were done — by how it's logged (its track: see
// tracking.ts): what's charted session by session, and its bests.

export type DoneSet = AnySet;
export interface ExerciseSession {
  date: string; // YYYY-MM-DD
  sets: DoneSet[];
}

export type Metric = "heaviest" | "oneRepMax" | "bestSetVolume" | "sessionVolume" | "mostReps" | "sessionReps" | "leastHelp" | "longest" | "sessionTime" | "distance";

export interface MetricInfo {
  id: Metric;
  label: string;
  unit: string;
}
const M: Record<Metric, MetricInfo> = {
  heaviest: { id: "heaviest", label: "Heaviest Weight", unit: "lbs" },
  oneRepMax: { id: "oneRepMax", label: "One Rep Max", unit: "lbs" },
  bestSetVolume: { id: "bestSetVolume", label: "Best Set Volume", unit: "lbs" },
  sessionVolume: { id: "sessionVolume", label: "Session Volume", unit: "lbs" },
  mostReps: { id: "mostReps", label: "Most Reps", unit: "reps" },
  sessionReps: { id: "sessionReps", label: "Session Reps", unit: "reps" },
  leastHelp: { id: "leastHelp", label: "Least Help", unit: "lbs" },
  longest: { id: "longest", label: "Longest", unit: "min" },
  sessionTime: { id: "sessionTime", label: "Total Time", unit: "min" },
  distance: { id: "distance", label: "Distance", unit: "mi" },
};
// What can be charted, by track (the first shown first).
export const METRICS_FOR: Record<Track, MetricInfo[]> = {
  weight: [M.heaviest, M.oneRepMax, M.bestSetVolume, M.sessionVolume],
  bodyweight: [M.mostReps, M.sessionReps, M.heaviest],
  assisted: [M.leastHelp, M.mostReps, M.sessionReps],
  duration: [M.longest, M.sessionTime],
  cardio: [M.distance, M.sessionTime],
};

// A set's estimated one-rep max (Epley: weight × (1 + reps / 30); a single
// is itself).
export function oneRepMax(set: DoneSet) {
  if (!set.weight || !set.reps) return 0;
  return set.reps === 1 ? set.weight : set.weight * (1 + set.reps / 30);
}

// The sets that count: done (by the track's needs), and not warm-ups.
const counted = (sets: DoneSet[], track: Track) => sets.filter((s) => s.type !== "warmup" && setComplete(s, track));
const most = (values: number[]) => (values.length ? Math.max(...values) : 0);

// A session's value for a metric. (Times charted in minutes.)
export function sessionValue(session: ExerciseSession, metric: Metric, track: Track) {
  const sets = counted(session.sets, track);
  if (!sets.length) return 0;
  const weighed = sets.filter((s) => (s.weight ?? 0) > 0);
  switch (metric) {
    case "heaviest":
      return most(weighed.map((s) => s.weight ?? 0));
    case "oneRepMax":
      return most(weighed.map(oneRepMax));
    case "bestSetVolume":
      return most(sets.map((s) => setVolume(s, track)));
    case "sessionVolume":
      return sets.reduce((sum, s) => sum + setVolume(s, track), 0);
    case "mostReps":
      return most(sets.map((s) => s.reps ?? 0));
    case "sessionReps":
      return sets.reduce((sum, s) => sum + (s.reps ?? 0), 0);
    case "leastHelp": {
      const helped = sets.filter((s) => s.weight != null);
      return helped.length ? Math.min(...helped.map((s) => s.weight!)) : 0;
    }
    case "longest":
      return most(sets.map((s) => s.seconds ?? 0)) / 60;
    case "sessionTime":
      return sets.reduce((sum, s) => sum + (s.seconds ?? 0), 0) / 60;
    case "distance":
      return sets.reduce((sum, s) => sum + (s.distance ?? 0), 0);
  }
}

// "63.38", "1,950" — at most two places, no trailing zeros.
export const lbs = (n: number) => (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });

// The bests over every session, by track, as rows to show: a label, the
// value in words (none yet: null), and a hint. (Warm-ups don't count.)
export function personalRecords(sessions: ExerciseSession[], track: Track): { label: string; value: string | null; hint?: string }[] {
  const sets = counted(
    sessions.flatMap((s) => s.sets),
    track,
  );
  const weighed = sets.filter((s) => (s.weight ?? 0) > 0);
  const best = (metric: Metric) => Math.max(0, ...sessions.map((s) => sessionValue(s, metric, track)));
  const or = (v: number, text: (v: number) => string) => (v > 0 ? text(v) : null);
  switch (track) {
    case "weight": {
      const bestSet = weighed.reduce<DoneSet | null>((b, s) => (!b || setVolume(s, track) > setVolume(b, track) ? s : b), null);
      return [
        { label: "Heaviest weight", value: or(most(weighed.map((s) => s.weight ?? 0)), (v) => `${lbs(v)} lbs`) },
        { label: "Best 1RM", value: or(most(weighed.map(oneRepMax)), (v) => `${lbs(v)} lbs`), hint: "Estimated, from your sets" },
        { label: "Best set volume", value: bestSet ? `${lbs(bestSet.weight ?? 0)} lbs × ${bestSet.reps}` : null },
        { label: "Best session volume", value: or(best("sessionVolume"), (v) => `${lbs(v)} lbs`) },
      ];
    }
    case "bodyweight":
      return [
        { label: "Most reps in a set", value: or(most(sets.map((s) => s.reps ?? 0)), (v) => `${v} reps`) },
        { label: "Most reps in a session", value: or(best("sessionReps"), (v) => `${v} reps`) },
        { label: "Heaviest added", value: or(most(weighed.map((s) => s.weight ?? 0)), (v) => `+${lbs(v)} lbs`) },
      ];
    case "assisted": {
      const helped = sets.filter((s) => s.weight != null);
      return [
        { label: "Least help", value: helped.length ? `${lbs(Math.min(...helped.map((s) => s.weight!)))} lbs` : null, hint: "Less help is stronger" },
        { label: "Most reps in a set", value: or(most(sets.map((s) => s.reps ?? 0)), (v) => `${v} reps`) },
      ];
    }
    case "duration":
      return [
        { label: "Longest", value: or(most(sets.map((s) => s.seconds ?? 0)), timeText) },
        { label: "Most in a session", value: or(best("sessionTime") * 60, timeText) },
      ];
    case "cardio":
      return [
        { label: "Farthest", value: or(best("distance"), (v) => `${lbs(v)} mi`) },
        { label: "Longest", value: or(best("sessionTime") * 60, timeText) },
      ];
  }
}
