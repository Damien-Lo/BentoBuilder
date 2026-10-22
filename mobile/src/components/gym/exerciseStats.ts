// An exercise's progress, worked out from the sessions it was done in —
// each the sets that were done (weight in pounds, reps). Logging sessions
// comes next; this is ready for them.

export interface DoneSet {
  weight: number | null;
  reps: number | null;
}
export interface ExerciseSession {
  date: string; // YYYY-MM-DD
  sets: DoneSet[];
}

export type Metric = "heaviest" | "oneRepMax" | "bestSetVolume" | "sessionVolume";

export const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: "heaviest", label: "Heaviest Weight", unit: "lbs" },
  { id: "oneRepMax", label: "One Rep Max", unit: "lbs" },
  { id: "bestSetVolume", label: "Best Set Volume", unit: "lbs" },
  { id: "sessionVolume", label: "Session Volume", unit: "lbs" },
];

// A set's estimated one-rep max (Epley: weight × (1 + reps / 30); a single
// is itself).
export function oneRepMax(set: DoneSet) {
  if (!set.weight || !set.reps) return 0;
  return set.reps === 1 ? set.weight : set.weight * (1 + set.reps / 30);
}
const volume = (set: DoneSet) => (set.weight ?? 0) * (set.reps ?? 0);

// A session's value for a metric.
export function sessionValue(session: ExerciseSession, metric: Metric) {
  const sets = session.sets.filter((s) => (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0);
  if (!sets.length) return 0;
  switch (metric) {
    case "heaviest":
      return Math.max(...sets.map((s) => s.weight ?? 0));
    case "oneRepMax":
      return Math.max(...sets.map(oneRepMax));
    case "bestSetVolume":
      return Math.max(...sets.map(volume));
    case "sessionVolume":
      return sets.reduce((sum, s) => sum + volume(s), 0);
  }
}

// The bests over every session: the heaviest weight, the best estimated
// one-rep max, the best single set (weight × reps), the most moved in one
// session.
export function personalRecords(sessions: ExerciseSession[]) {
  const sets = sessions.flatMap((s) => s.sets).filter((s) => (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0);
  const bestSet = sets.reduce<DoneSet | null>((best, s) => (!best || volume(s) > volume(best) ? s : best), null);
  return {
    heaviest: sets.length ? Math.max(...sets.map((s) => s.weight ?? 0)) : null,
    oneRepMax: sets.length ? Math.max(...sets.map(oneRepMax)) : null,
    bestSet,
    sessionVolume: sessions.length ? Math.max(...sessions.map((s) => sessionValue(s, "sessionVolume"))) : null,
  };
}

// "63.38", "1,950" — at most two places, no trailing zeros.
export const lbs = (n: number) => (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
