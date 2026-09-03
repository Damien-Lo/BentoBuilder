import { Ionicons } from "@expo/vector-icons";

import type { Meal, MealRecipeRef } from "@/src/services/mealApi";
import type { MealPlanEntry, MealSlot } from "@/src/services/mealPlanApi";
import type { Recipe } from "@/src/services/recipeApi";
import type { Ingredient } from "@/src/services/ingredientApi";
import type { RestaurantMeal } from "@/src/services/restaurantMealApi";
import type { PantryItem } from "@/src/types/pantry";
import { getIngredientStockInUnit } from "./ingredientStock";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "./unitConversion";

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

// A restaurant visit has no "servings" to scale — each dish's manual
// nutrition estimate is summed flat, as eaten.
// dishIds filters to just those dishes (e.g. what a specific meal-plan
// entry actually logged) — omitted or empty means "every dish," used when
// browsing a restaurant's full menu before picking anything.
export function getRestaurantMealKcal(restaurantMeal: RestaurantMeal, dishIds?: string[]): number | null {
  const dishes = dishIds?.length
    ? restaurantMeal.dishes?.filter(d => dishIds.includes(d._id))
    : restaurantMeal.dishes;
  if (!dishes?.length) return null;
  let total = 0;
  let hasAny = false;
  for (const dish of dishes) {
    const cal = dish.nutrition?.calories;
    if (cal != null) {
      total += cal;
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
// A quantity given in some other unit (e.g. the user typed "100 g" for an
// ingredient whose own portion is "1 package") has to be converted into the
// ingredient's native unit first — the same thing RecipeRoutes.js's
// calcNutrition() and the recipe screen's own totalNutrition already do.
// Omitting `unit` skips conversion (treats quantity as already-native),
// same as the old behavior, for callers that already guarantee that.
export function scaleIngredientNutrition(
  ingredient: Ingredient,
  quantity: number,
  unit?: string,
  conversions: CustomUnitConversion[] = [],
): ScaledNutrition {
  const n = ingredient.nutrition ?? {};

  const quantityInNativeUnit = unit
    ? convertUnits(quantity, unit, ingredient.defaultPortionUnit ?? "", conversions)
    : quantity;

  if (quantityInNativeUnit == null) {
    return { calories: null, protein: null, carbs: null, fats: null, fiber: null, sodium: null };
  }

  const multiplier = quantityInNativeUnit / (ingredient.defaultPortionAmount || 1);
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

export function getIngredientKcal(
  ingredient: Ingredient,
  quantity: number,
  unit?: string,
  conversions: CustomUnitConversion[] = [],
): number | null {
  const cal = scaleIngredientNutrition(ingredient, quantity, unit, conversions).calories;
  return cal == null ? null : Math.round(cal);
}

// ── Day-level nutrition totals (shared by the planner and Health pages) ────────

export interface DayNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  sodium: number;
}

function addScaled(totals: DayNutrition, n: ScaledNutrition) {
  if (n.calories) totals.calories += n.calories;
  if (n.protein)  totals.protein  += n.protein;
  if (n.carbs)    totals.carbs    += n.carbs;
  if (n.fats)     totals.fats     += n.fats;
  if (n.fiber)    totals.fiber    += n.fiber;
  if (n.sodium)   totals.sodium   += n.sodium;
}

// A confirmed recipe entry's nutrition, computed from exactly what was
// really deducted from pantry stock (the specific ingredient and amount of
// whichever real item(s) got used) instead of the recipe's cached
// snapshot, which only ever reflects its declared/assumed quantities —
// e.g. a "1 fillet" line always contributes the same assumed weight in the
// snapshot, even though the real fillet you actually cooked might have
// been smaller or larger. Returns null when there's nothing to compute
// from (no deductions recorded, or none came back populated), so the
// caller falls back to the snapshot exactly as before. Exported so the
// planner's per-entry display can use the same figure as the day total.
export function computeConfirmedRecipeNutrition(
  entry: MealPlanEntry,
  conversions: CustomUnitConversion[],
): DayNutrition | null {
  const deductions = entry.stockDeductions;
  if (!deductions?.length) return null;

  const totals: DayNutrition = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sodium: 0 };
  let hasAny = false;
  for (const d of deductions) {
    if (typeof d.pantryItem === "string") continue; // not populated — skip rather than guess
    const ingredient = d.pantryItem.ingredient;
    if (!ingredient) continue;
    addScaled(totals, scaleIngredientNutrition(
      ingredient,
      d.amount,
      d.pantryItem.quantityUnit,
      getIngredientConversions(ingredient, conversions),
    ));
    hasAny = true;
  }
  return hasAny ? totals : null;
}

export function computeDayNutrition(entries: MealPlanEntry[], conversions: CustomUnitConversion[] = []): DayNutrition {
  const totals: DayNutrition = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sodium: 0 };
  for (const entry of entries) {
    if (entry.recipe) {
      const confirmed = entry.status === "confirmed"
        ? computeConfirmedRecipeNutrition(entry, conversions)
        : null;
      addScaled(totals, confirmed ?? scaleRecipeNutrition(entry.recipe, entry.recipeServings ?? 1));
      continue;
    }
    if (entry.ingredient) {
      addScaled(totals, scaleIngredientNutrition(
        entry.ingredient,
        entry.ingredientQuantity ?? 0,
        entry.ingredientUnit,
        getIngredientConversions(entry.ingredient, conversions),
      ));
      continue;
    }
    if (entry.restaurantMeal) {
      const dishIds = entry.restaurantDishIds;
      const dishes = dishIds?.length
        ? entry.restaurantMeal.dishes?.filter(d => dishIds.includes(d._id))
        : entry.restaurantMeal.dishes;
      for (const dish of dishes ?? []) {
        const n = dish.nutrition;
        if (!n) continue;
        addScaled(totals, {
          calories: n.calories ?? null,
          protein: n.protein ?? null,
          carbs: n.carbs ?? null,
          fats: n.fats ?? null,
          fiber: n.fiber ?? null,
          sodium: n.sodium ?? null,
        });
      }
      continue;
    }
    for (const course of entry.meal?.courses ?? []) {
      const recipe = course.recipe;
      if (!recipe || typeof recipe === "string") continue;
      const n = (recipe as MealRecipeRef).nutrition;
      if (!n) continue;
      const s = course.servings ?? 1;
      addScaled(totals, {
        calories: n.calories != null ? n.calories * s : null,
        protein:  n.protein  != null ? n.protein  * s : null,
        carbs:    n.carbs    != null ? n.carbs    * s : null,
        fats:     n.fats     != null ? n.fats     * s : null,
        fiber:    n.fiber    != null ? n.fiber    * s : null,
        sodium:   n.sodium   != null ? n.sodium   * s : null,
      });
    }
  }
  const { calories, protein, carbs, fats, fiber, sodium } = totals;
  return {
    calories: Math.round(calories),
    protein:  Math.round(protein  * 10) / 10,
    carbs:    Math.round(carbs    * 10) / 10,
    fats:     Math.round(fats     * 10) / 10,
    fiber:    Math.round(fiber    * 10) / 10,
    sodium:   Math.round(sodium),
  };
}

// Fraction (0–1, clamped) of `limit` that `value` represents — 0 when there's
// no limit set, so an unset goal never renders a bar as "full."
export function pct(value: number, limit: number | null): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(value / limit, 1);
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Pantry availability (shared "can this be made from what's in stock"
// check — same worst-ingredient-wins logic as the recipe list's dot and the
// recipe detail page's per-ingredient bars, applied here to a meal-plan
// entry, whichever of recipe/ingredient/meal it points at) ─────────────────

export type AvailabilityState = "green" | "yellow" | "red";

function ingredientAvailabilityState(
  ingredient: Ingredient,
  quantity: number,
  unit: string,
  allIngredients: Ingredient[],
  pantryItems: PantryItem[],
  customConversions: CustomUnitConversion[],
): AvailabilityState {
  const inStock = getIngredientStockInUnit(ingredient, unit, allIngredients, pantryItems, customConversions);
  const remaining = inStock - quantity;
  const rawThreshold = ingredient.lowStockThreshold ?? 0;
  const threshold = ingredient.defaultPortionUnit
    ? (convertUnits(
        rawThreshold,
        ingredient.defaultPortionUnit,
        unit,
        getIngredientConversions(ingredient, customConversions, allIngredients),
      ) ?? rawThreshold)
    : rawThreshold;
  return remaining > threshold ? "green" : remaining >= 0 ? "yellow" : "red";
}

function worseOf(current: AvailabilityState | null, next: AvailabilityState): AvailabilityState {
  if (current === null) return next;
  if (current === "red" || next === "red") return "red";
  if (current === "yellow" || next === "yellow") return "yellow";
  return "green";
}

export function getRecipeAvailability(
  recipe: Recipe,
  ingredientMap: Map<string, Ingredient>,
  allIngredients: Ingredient[],
  pantryItems: PantryItem[],
  customConversions: CustomUnitConversion[],
): AvailabilityState | null {
  let availability: AvailabilityState | null = null;
  for (const entry of recipe.ingredientList) {
    const ingId = typeof entry.ingredient === "string" ? entry.ingredient : entry.ingredient._id;
    const ing = ingredientMap.get(ingId);
    if (!ing) continue;
    const state = ingredientAvailabilityState(ing, entry.quantity, entry.unit, allIngredients, pantryItems, customConversions);
    availability = worseOf(availability, state);
    if (availability === "red") break;
  }
  return availability;
}

// A meal-plan entry can point at a recipe, a bare ingredient, or a meal (a
// set of recipe courses) — a course's own recipe ref is a thin projection
// with no ingredientList, so it's looked up in `recipeMap` (the full recipe
// list) to get the real ingredients to check.
export function getEntryAvailability(
  entry: MealPlanEntry,
  recipeMap: Map<string, Recipe>,
  ingredientMap: Map<string, Ingredient>,
  allIngredients: Ingredient[],
  pantryItems: PantryItem[],
  customConversions: CustomUnitConversion[],
): AvailabilityState | null {
  if (entry.recipe) {
    return getRecipeAvailability(entry.recipe, ingredientMap, allIngredients, pantryItems, customConversions);
  }

  if (entry.ingredient) {
    return ingredientAvailabilityState(
      entry.ingredient,
      entry.ingredientQuantity ?? 0,
      entry.ingredientUnit ?? "",
      allIngredients,
      pantryItems,
      customConversions,
    );
  }

  if (entry.meal) {
    let availability: AvailabilityState | null = null;
    for (const course of entry.meal.courses ?? []) {
      const ref = course.recipe;
      if (!ref || typeof ref === "string") continue;
      const fullRecipe = recipeMap.get(ref._id);
      if (!fullRecipe) continue;
      const state = getRecipeAvailability(fullRecipe, ingredientMap, allIngredients, pantryItems, customConversions);
      if (state) availability = worseOf(availability, state);
    }
    return availability;
  }

  return null;
}
