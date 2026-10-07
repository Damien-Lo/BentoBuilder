import type { EventOccurrence } from "@/src/services/calendarApi";
import type { MealPlanEntry } from "@/src/services/mealPlanApi";
import type { NutritionTotals } from "@/src/types/nutrition";
import { computeDayNutrition } from "@/src/utils/mealPlan";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";

// What a meal event shows from the Kitchen planner: the food planned (or
// eaten) in its slot on its day. The planner has one breakfast, lunch,
// dinner and snack slot per day, so every event of that type on the day
// shows the same food.
export interface MealFood {
  // Each thing in the slot, in the order it was added.
  items: { id: string; name: string; eaten: boolean; kcal: number }[];
  // "Chicken rice, Side salad"
  summary: string;
  nutrition: NutritionTotals;
  // Everything in the slot has been confirmed as eaten.
  eaten: boolean;
}

export const mealKey = (date: string, slot: string) => `${date}|${slot}`;

export function entryName(entry: MealPlanEntry): string {
  return entry.meal?.name ?? entry.recipe?.name ?? entry.ingredient?.name ?? entry.restaurantMeal?.restaurantName ?? "Food";
}

// The planner's entries, grouped into the food of each day's slots. Uses
// the planner's own nutrition maths, so the numbers match it.
export function buildMealFood(entries: MealPlanEntry[], conversions: CustomUnitConversion[]): Map<string, MealFood> {
  const grouped = new Map<string, MealPlanEntry[]>();
  for (const entry of entries) {
    const key = mealKey(entry.date, entry.slot);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  const out = new Map<string, MealFood>();
  for (const [key, slotEntries] of grouped) {
    const items = slotEntries.map((entry) => ({
      id: entry._id,
      name: entryName(entry),
      eaten: entry.status === "confirmed",
      kcal: Math.round(computeDayNutrition([entry], conversions).calories ?? 0),
    }));
    out.set(key, {
      items,
      summary: items.map((i) => i.name).join(", "),
      nutrition: computeDayNutrition(slotEntries, conversions),
      eaten: items.every((i) => i.eaten),
    });
  }
  return out;
}

// The line under a meal event's title: "Chicken rice, Side salad · 650 kcal".
export function mealLine(event: Pick<EventOccurrence, "meal">): string {
  const food = event.meal?.food;
  if (!food) return "Nothing planned";
  const kcal = Math.round(food.nutrition.calories ?? 0);
  return kcal > 0 ? `${food.summary} · ${kcal} kcal` : food.summary;
}
