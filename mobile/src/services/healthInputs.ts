import { getHealthMetrics, type HealthMetric } from "@/src/services/healthSync";
import { getMealPlanRange } from "@/src/services/mealPlanApi";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import { getWeightEntries, type WeightEntry } from "@/src/services/weightEntryApi";
import { computeDayNutrition, type DayNutrition } from "@/src/utils/mealPlan";

// What Health's numbers are worked out from — Targets and Your burn both:
// you (settings), your weigh-ins, Apple Health's readings and the marks
// you've made ("logged everything"), and each day's food as eaten
// (confirmed in Kitchen) — the last 12 weeks, enough for the burn's eight
// weeks of four-week windows.

const READINGS = ["steps", "exerciseMinutes", "activeEnergy", "restingEnergy", "sleep", "leanMass", "water", "foodComplete", "workout"];
const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export interface HealthInputs {
  today: string;
  settings: AppSettings;
  weights: WeightEntry[];
  metrics: HealthMetric[];
  intake: { date: string; calories: number }[]; // each day with food, today too
  eaten: Map<string, DayNutrition>;
}

export async function loadHealthInputs(days = 90): Promise<HealthInputs> {
  const today = dayOf(new Date());
  const from = dayOf(new Date(Date.now() - days * 86_400_000));
  const [settings, weights, metrics, meals] = await Promise.all([
    loadSettings(),
    getWeightEntries().catch(() => []),
    getHealthMetrics(READINGS, from).catch(() => [] as HealthMetric[]),
    getMealPlanRange(from, today).catch(() => []),
  ]);
  const byDay = new Map<string, typeof meals>();
  for (const e of meals) if (e.status === "confirmed") byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const eaten = new Map([...byDay].map(([date, entries]) => [date, computeDayNutrition(entries, settings.unitConversions)]));
  const intake = [...eaten].map(([date, n]) => ({ date, calories: n.calories ?? 0 }));
  return { today, settings, weights, metrics, intake, eaten };
}
