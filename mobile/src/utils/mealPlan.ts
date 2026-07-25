import { Ionicons } from "@expo/vector-icons";

import type { Meal, MealRecipeRef } from "@/src/services/mealApi";
import type { MealSlot } from "@/src/services/mealPlanApi";

// ── Date helpers ──────────────────────────────────────────────────────────────

const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
