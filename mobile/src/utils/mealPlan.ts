import { Ionicons } from "@expo/vector-icons";

import type { Meal, MealRecipeRef } from "@/src/services/mealApi";
import type { MealSlot } from "@/src/services/mealPlanApi";
import type { Recipe } from "@/src/services/recipeApi";
import type { Ingredient } from "@/src/services/ingredientApi";

// ── Date helpers ──────────────────────────────────────────────────────────────

const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function friendlyDayLabel(dateStr: string): string {
  const today = todayStr();
  const d = parseLocalDate(dateStr);
  const offset = (parseLocalDate(dateStr).getTime() - parseLocalDate(today).getTime()) / 86400000;
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return `${DAY_FULL[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

// Returns the 7 date strings ("YYYY-MM-DD") for the week containing `dateStr`,
// starting on `weekStartDay` (0 = Sunday … 6 = Saturday, matching Date#getDay()).
export function getWeekDates(dateStr: string, weekStartDay: number): string[] {
  const d = parseLocalDate(dateStr);
  const diff = (d.getDay() - weekStartDay + 7) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - diff);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    dates.push(toDateStr(day));
  }
  return dates;
}

export function weekRangeLabel(weekDates: string[]): string {
  const start = parseLocalDate(weekDates[0]);
  const end = parseLocalDate(weekDates[weekDates.length - 1]);
  const startLabel = `${MONTH_SHORT[start.getMonth()]} ${start.getDate()}`;
  const endLabel = start.getMonth() === end.getMonth()
    ? `${end.getDate()}`
    : `${MONTH_SHORT[end.getMonth()]} ${end.getDate()}`;
  return `${startLabel} – ${endLabel}`;
}

// ── Slots config ──────────────────────────────────────────────────────────────

export const SLOTS: {
  id: MealSlot;
  label: string;
  time: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  chipBg: string;
  chipText: string;
}[] = [
  { id: "breakfast", label: "Breakfast", time: "Morning", icon: "sunny-outline",        iconColor: "#F59E0B", chipBg: "bg-amber-100",   chipText: "text-amber-700"   },
  { id: "lunch",     label: "Lunch",     time: "Midday",  icon: "partly-sunny-outline", iconColor: "#10B981", chipBg: "bg-emerald-100", chipText: "text-emerald-700" },
  { id: "dinner",    label: "Dinner",    time: "Evening", icon: "moon-outline",         iconColor: "#6366F1", chipBg: "bg-indigo-100",  chipText: "text-indigo-700"  },
  { id: "snack",     label: "Snack",     time: "Anytime", icon: "cafe-outline",         iconColor: "#EC4899", chipBg: "bg-pink-100",    chipText: "text-pink-700"    },
];

export const SLOT_MAP = Object.fromEntries(SLOTS.map(s => [s.id, s])) as Record<MealSlot, typeof SLOTS[0]>;

// ── Nutrition helper ──────────────────────────────────────────────────────────

export function getMealKcal(meal: Meal): number | null {
  if (!meal.courses?.length) return null;
  let total = 0;
  let hasAny = false;
  for (const course of meal.courses) {
    const recipe = course.recipe;
    if (!recipe || typeof recipe === "string") continue;
    const cal = (recipe as MealRecipeRef).nutrition?.calories;
    if (cal != null) {
      total += cal * course.servings;
      hasAny = true;
    }
  }
  return hasAny ? Math.round(total) : null;
}

// ── Recipe nutrition scaling (per-serving nutrition × servings eaten) ──────────

export interface ScaledNutrition {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  fiber: number | null;
  sodium: number | null;
}

export function scaleRecipeNutrition(recipe: Recipe, servings: number): ScaledNutrition {
  const n = recipe.nutrition ?? {};
  const scale = (v?: number | null) => (v == null ? null : v * servings);
  return {
    calories: scale(n.calories),
    protein:  scale(n.protein),
    carbs:    scale(n.carbs),
    fats:     scale(n.fats),
    fiber:    scale(n.fiber),
    sodium:   scale(n.sodium),
  };
}

export function getRecipeKcal(recipe: Recipe, servings: number): number | null {
  const cal = scaleRecipeNutrition(recipe, servings).calories;
  return cal == null ? null : Math.round(cal);
}

// ── Ingredient nutrition scaling ────────────────────────────────────────────────
// Ingredient nutrition is stored per `defaultPortionAmount` of `defaultPortionUnit`
// (e.g. "per 100g" is just defaultPortionAmount=100, defaultPortionUnit="g").
// Scaling to an actually-planned quantity is quantity / defaultPortionAmount —
// the same formula the server already uses in RecipeRoutes.js's calcNutrition().

export function scaleIngredientNutrition(ingredient: Ingredient, quantity: number): ScaledNutrition {
  const n = ingredient.nutrition ?? {};
  const multiplier = quantity / (ingredient.defaultPortionAmount || 1);
  const scale = (v?: number | null) => (v == null ? null : v * multiplier);
  return {
    calories: scale(n.calories),
    protein:  scale(n.protein),
    carbs:    scale(n.carbs),
    fats:     scale(n.fats),
    fiber:    scale(n.fiber),
    sodium:   scale(n.sodium),
  };
}

export function getIngredientKcal(ingredient: Ingredient, quantity: number): number | null {
  const cal = scaleIngredientNutrition(ingredient, quantity).calories;
  return cal == null ? null : Math.round(cal);
}
