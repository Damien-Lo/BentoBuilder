import { WorkoutActivityType } from "@kingstinct/react-native-healthkit";

import { sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import { sessionCalories, weightOn } from "@/src/components/gym/sessionEnergy";
import type { HealthMetric } from "@/src/services/healthSync";
import type { WeightEntry } from "@/src/services/weightEntryApi";

// Your workouts — Gym's sessions and Apple Health's (the Watch's walks,
// runs, rides…) — as one list. A Gym session and the strength workout
// another app (Hevy, the Watch) saved to Apple Health for it are the same
// workout: one, Gym's — with the session's own calories (measured by the
// Watch in a workout, or estimated: sessionEnergy.ts), not the other app's
// formula. (Health → Workouts, and the home screen's Health card.)

export const STRENGTH = new Set([Number(WorkoutActivityType.traditionalStrengthTraining), Number(WorkoutActivityType.functionalStrengthTraining)]);

// "traditionalStrengthTraining" → "Traditional strength training".
export function activityName(n: number) {
  const name = (WorkoutActivityType as unknown as Record<number, string>)[n] ?? "workout";
  const words = name.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return words[0].toUpperCase() + words.slice(1);
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export type WorkoutItem = { key: string; date: string; name: string; minutes: number; kcal?: number; estimated?: boolean; km?: number; gym?: string; time: string };

// Since `from` (YYYY-MM-DD), newest first.
// (`weights`: yours, and `ratio`, your Watch's correction — for each
// session's calories.)
export function mergeWorkouts(metrics: HealthMetric[], sessions: GymSessionRecord[], from: string, weights: WeightEntry[] = [], ratio: number | null = null): WorkoutItem[] {
  const apple = metrics.filter((m) => m.type === "workout");
  const used = new Set<string>();
  const gymItems: WorkoutItem[] = sessions.map((s) => {
    const start = new Date(s.startedAt).getTime();
    const twin = apple.find((m) => !used.has(m._id) && STRENGTH.has(m.detail?.activity ?? -1) && m.start && Math.abs(new Date(m.start).getTime() - start) <= 45 * 60_000);
    if (twin) used.add(twin._id);
    const cal = sessionCalories(s, sessions, weightOn(weights, s.startedAt), ratio);
    return { key: s._id, date: dayOf(new Date(s.startedAt)), name: s.name, minutes: sessionTotals(s).seconds / 60, kcal: cal?.kcal, estimated: cal ? !cal.measured : undefined, gym: s._id, time: s.startedAt };
  });
  return [
    ...apple
      .filter((m) => !used.has(m._id))
      .map((m) => ({ key: m._id, date: m.date, name: activityName(m.detail?.activity ?? 0), minutes: m.value, kcal: m.detail?.kcal || undefined, km: m.detail?.km || undefined, time: m.start ?? `${m.date}T00:00:00` })),
    ...gymItems,
  ]
    .filter((w) => w.date >= from)
    .sort((a, b) => b.time.localeCompare(a.time));
}

// "~1,240 kcal" — with a ~ when any of it's estimated.
export function kcalLabel(items: WorkoutItem[]) {
  const kcal = items.reduce((n, w) => n + (w.kcal ?? 0), 0);
  if (!kcal) return null;
  return `${items.some((w) => w.estimated) ? "~" : ""}${Math.round(kcal).toLocaleString()} kcal`;
}
