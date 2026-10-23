import { WorkoutActivityType } from "@kingstinct/react-native-healthkit";

import { sessionTotals, type GymSessionRecord } from "@/src/services/gymApi";
import type { HealthMetric } from "@/src/services/healthSync";

// Your workouts — Gym's sessions and Apple Health's (the Watch's walks,
// runs, rides…) — as one list. A Gym session and the strength workout
// another app (Hevy, the Watch) saved to Apple Health for it are the same
// workout: one, Gym's, with the Watch's calories. (Health → Workouts, and
// the home screen's Health card.)

export const STRENGTH = new Set([Number(WorkoutActivityType.traditionalStrengthTraining), Number(WorkoutActivityType.functionalStrengthTraining)]);

// "traditionalStrengthTraining" → "Traditional strength training".
export function activityName(n: number) {
  const name = (WorkoutActivityType as unknown as Record<number, string>)[n] ?? "workout";
  const words = name.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return words[0].toUpperCase() + words.slice(1);
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export type WorkoutItem = { key: string; date: string; name: string; minutes: number; kcal?: number; km?: number; gym?: string; time: string };

// Since `from` (YYYY-MM-DD), newest first.
export function mergeWorkouts(metrics: HealthMetric[], sessions: GymSessionRecord[], from: string): WorkoutItem[] {
  const apple = metrics.filter((m) => m.type === "workout");
  const used = new Set<string>();
  const gymItems: WorkoutItem[] = sessions.map((s) => {
    const start = new Date(s.startedAt).getTime();
    const twin = apple.find((m) => !used.has(m._id) && STRENGTH.has(m.detail?.activity ?? -1) && m.start && Math.abs(new Date(m.start).getTime() - start) <= 45 * 60_000);
    if (twin) used.add(twin._id);
    return { key: s._id, date: dayOf(new Date(s.startedAt)), name: s.name, minutes: sessionTotals(s).seconds / 60, kcal: twin?.detail?.kcal || undefined, gym: s._id, time: s.startedAt };
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
