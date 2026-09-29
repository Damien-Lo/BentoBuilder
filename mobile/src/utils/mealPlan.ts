import { Ionicons } from "@expo/vector-icons";

import type { CourseEntry, Meal, MealIngredientRef, MealRecipeRef } from "@/src/services/mealApi";
import type { MealPlanEntry, MealSlot, RestaurantDishSelection } from "@/src/services/mealPlanApi";
import type { Recipe } from "@/src/services/recipeApi";
import type { Ingredient } from "@/src/services/ingredientApi";
import type { RestaurantMeal } from "@/src/services/restaurantMealApi";
import type { PantryItem } from "@/src/types/pantry";
import type { NullableNutrition, NutritionTotals } from "@/src/types/nutrition";
import { countQualifyingPantryPieces, getIngredientStockInUnit } from "./ingredientStock";
import {
  addNutrition,
  emptyNutritionTotals,
  roundNutritionTotals,
  scaleNutrition,
  unknownNutrition,
} from "./nutrition";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "./unitConversion";
import type { DeductionInstruction, IngredientRequirement, ManualPieceInput, RawRow } from "./pantryDeduction";

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

// Returns `days` date strings ending at (and including) `dateStr`, oldest
// first — a rolling window, not aligned to any calendar week boundary. Used
// for the planner's "last 7 days" nutrition card, which should track
// backwards from whatever date is selected, not jump around with the
// weekStartDay setting the way the calendar-week card does.
export function getRollingDates(dateStr: string, days: number): string[] {
  const end = parseLocalDate(dateStr);
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end);
    day.setDate(end.getDate() - i);
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

// A meal course's populated recipe or ingredient (null when unpopulated or
// unset).
export function courseRecipe(course: CourseEntry): MealRecipeRef | null {
  return course.recipe && typeof course.recipe !== "string" ? course.recipe : null;
}

export function courseIngredient(course: CourseEntry): MealIngredientRef | null {
  return course.ingredient && typeof course.ingredient !== "string" ? course.ingredient : null;
}

// What one course contributes: a recipe's per-serving nutrition x servings,
// or an ingredient's nutrition scaled to the course's quantity/unit. Null
// when there's nothing populated to read.
export function courseNutrition(
  course: CourseEntry,
  conversions: CustomUnitConversion[] = [],
): NullableNutrition | null {
  const recipe = courseRecipe(course);
  if (recipe) return scaleNutrition(recipe.nutrition, course.servings ?? 1);
  const ingredient = courseIngredient(course);
  if (ingredient) {
    return scaleIngredientNutrition(
      ingredient as unknown as Ingredient,
      course.quantity ?? 0,
      course.unit || ingredient.defaultPortionUnit || "",
      [...(ingredient.unitConversions ?? []), ...conversions],
    );
  }
  return null;
}

// "Chicken Curry" / "Greek Yogurt", and "2 servings" / "150 g".
export function courseName(course: CourseEntry): string {
  return courseRecipe(course)?.name ?? courseIngredient(course)?.name ?? "Nothing selected";
}

export function courseAmountLabel(course: CourseEntry): string {
  if (courseIngredient(course)) return `${course.quantity ?? 0} ${course.unit ?? ""}`.trim();
  return `${course.servings} ${course.servings === 1 ? "serving" : "servings"}`;
}

export function getMealKcal(meal: Meal, conversions: CustomUnitConversion[] = []): number | null {
  if (!meal.courses?.length) return null;
  let total = 0;
  let hasAny = false;
  for (const course of meal.courses) {
    const cal = courseNutrition(course, conversions)?.calories;
    if (cal != null) {
      total += cal;
      hasAny = true;
    }
  }
  return hasAny ? Math.round(total) : null;
}

// A restaurant visit has no "servings" to scale — each dish's manual
// nutrition estimate is multiplied by how many of that dish were had (1 if
// unspecified) and summed. `selections` filters to just those dishes (e.g.
// what a specific meal-plan entry actually logged) — *omitting the
// argument entirely* means "every dish, one each," for browsing a
// restaurant's full menu before picking anything. An explicit empty array
// is a different thing entirely — a real entry (or a live pick-in-progress)
// that has selected nothing yet — and must total to null/0, not silently
// fall back to the whole menu (that used to conflate the two: a fresh visit
// with no dishes picked showed the previous, unrelated full-menu total).
export function getRestaurantMealKcal(restaurantMeal: RestaurantMeal, selections?: RestaurantDishSelection[]): number | null {
  const quantityByDish = selections
    ? new Map(selections.map(s => [s.dish, s.quantity]))
    : null;
  const dishes = quantityByDish
    ? restaurantMeal.dishes?.filter(d => quantityByDish.has(d._id))
    : restaurantMeal.dishes;
  if (!dishes?.length) return null;
  let total = 0;
  let hasAny = false;
  for (const dish of dishes) {
    const cal = dish.nutrition?.calories;
    if (cal != null) {
      total += cal * (quantityByDish?.get(dish._id) ?? 1);
      hasAny = true;
    }
  }
  return hasAny ? Math.round(total) : null;
}

// ── Recipe nutrition scaling (per-serving nutrition × servings eaten) ──────────

export function scaleRecipeNutrition(recipe: Recipe, servings: number): NullableNutrition {
  return scaleNutrition(recipe.nutrition, servings);
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
): NullableNutrition {
  const quantityInNativeUnit = unit
    ? convertUnits(quantity, unit, ingredient.defaultPortionUnit ?? "", conversions)
    : quantity;

  if (quantityInNativeUnit == null) return unknownNutrition();

  const multiplier = quantityInNativeUnit / (ingredient.defaultPortionAmount || 1);
  return scaleNutrition(ingredient.nutrition, multiplier);
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

export type DayNutrition = NutritionTotals;

// A confirmed recipe entry's real nutrition — reads the snapshot computed
// once, with full context, right when the entry was confirmed (see
// computeConfirmNutrition below) rather than trying to re-derive it here,
// which would need the whole recipe/pantry catalog this function alone
// doesn't have. Falls back to a narrower reconstruction from stockDeductions
// / manualPieceEntries alone for entries confirmed before confirmedNutrition
// existed — real, but only covers ingredients that happened to get a real
// deduction or a manual entry; anything else (e.g. a quantity-mode line
// with no pantry stock at all) silently contributes nothing in that legacy
// path, unlike the real snapshot which always covers every ingredient.
// Returns null when there's nothing to compute from at all, so the caller
// falls back to the recipe's cached snapshot exactly as before.
export function computeConfirmedRecipeNutrition(
  entry: MealPlanEntry,
  conversions: CustomUnitConversion[],
): DayNutrition | null {
  if (entry.confirmedNutrition) return entry.confirmedNutrition;

  const deductions = entry.stockDeductions ?? [];
  const manualEntries = entry.manualPieceEntries ?? [];
  if (!deductions.length && !manualEntries.length) return null;

  const totals = emptyNutritionTotals();
  let hasAny = false;
  for (const d of deductions) {
    if (typeof d.pantryItem === "string") continue; // not populated — skip rather than guess
    const ingredient = d.pantryItem.ingredient;
    if (!ingredient) continue;
    addNutrition(totals, scaleIngredientNutrition(
      ingredient,
      d.amount,
      d.pantryItem.quantityUnit,
      getIngredientConversions(ingredient, conversions),
    ));
    hasAny = true;
  }
  // A wholePiece ingredient confirmed with a typed weight instead of a real
  // pantry item (see ManualPieceEntry) — same nutrition math, just sourced
  // from the ingredient directly rather than through a pantry item.
  for (const m of manualEntries) {
    if (!m.ingredient) continue;
    addNutrition(totals, scaleIngredientNutrition(
      m.ingredient,
      m.weight,
      m.weightUnit,
      getIngredientConversions(m.ingredient, conversions),
    ));
    hasAny = true;
  }
  return hasAny ? totals : null;
}

// The real, final nutrition for a set of resolved ingredient requirements —
// computed once, right at confirm time, with every piece of context this
// needs (real deducted weights, any typed-in manual weights, and the
// recipe's own assumed amount for whatever's left uncovered) so the result
// can be stored on the entry (MealPlanEntry.confirmedNutrition) and read
// back trivially everywhere else afterward. A quantity-mode line always
// uses its recipe-derived neededQuantity, regardless of pantry coverage —
// real vs. assumed produces identical nutrition per unit for a continuous
// amount, so there's nothing to blend; only wholePiece varies by which
// actual piece (real weight) was used, which is what the real-deduction /
// manual-entry / range-midpoint-fallback branches below account for.
export function computeConfirmNutrition(
  requirements: IngredientRequirement[],
  rows: RawRow[],
  instructions: DeductionInstruction[],
  manualPieceEntries: ManualPieceInput[],
  ingredientMap: Map<string, Ingredient>,
  pantryItems: PantryItem[],
  conversions: CustomUnitConversion[],
): DayNutrition {
  const totals = emptyNutritionTotals();
  const pantryItemById = new Map(pantryItems.map((p) => [p._id, p]));

  // Quantity-mode nutrition comes from the full expanded row list, not
  // `requirements` — buildIngredientRequirements deliberately drops
  // isAlwaysAvailable ingredients (salt, pepper, ...) since deduction and
  // the resolve-sources overlay never need to consider untracked
  // seasoning-type stock, but their real nutrition contribution (e.g.
  // salt's sodium) still needs counting.
  for (const row of rows) {
    if (row.matchMode === "wholePiece") continue;
    const ingredient = ingredientMap.get(row.ingredientId);
    if (!ingredient) continue;
    addNutrition(
      totals,
      scaleIngredientNutrition(ingredient, row.quantity, row.unit, getIngredientConversions(ingredient, conversions)),
    );
  }

  const instructionsByIngredient = new Map<string, DeductionInstruction[]>();
  for (const instr of instructions) {
    const ingredientId = pantryItemById.get(instr.pantryItemId)?.ingredient._id;
    if (!ingredientId) continue;
    const list = instructionsByIngredient.get(ingredientId) ?? [];
    list.push(instr);
    instructionsByIngredient.set(ingredientId, list);
  }

  const manualByIngredient = new Map<string, ManualPieceInput[]>();
  for (const m of manualPieceEntries) {
    const list = manualByIngredient.get(m.ingredientId) ?? [];
    list.push(m);
    manualByIngredient.set(m.ingredientId, list);
  }

  // wholePiece nutrition still comes from `requirements` — matching a real
  // deducted/manual weight per piece needs the per-ingredient aggregation
  // already built there. A wholePiece ingredient being isAlwaysAvailable
  // isn't a realistic combination (that flag is for continuous
  // seasoning-type stock, not discrete physical pieces), so this doesn't
  // reintroduce the drop the quantity-mode branch above just fixed.
  for (const req of requirements) {
    if (req.matchMode !== "wholePiece") continue;
    const ingredient = ingredientMap.get(req.ingredientId);
    if (!ingredient) continue;
    const ingredientConversions = getIngredientConversions(ingredient, conversions);

    let covered = 0;
    for (const instr of instructionsByIngredient.get(req.ingredientId) ?? []) {
      const item = pantryItemById.get(instr.pantryItemId);
      if (!item) continue;
      addNutrition(totals, scaleIngredientNutrition(ingredient, instr.amount, item.quantityUnit, ingredientConversions));
      covered += 1;
    }
    for (const manual of manualByIngredient.get(req.ingredientId) ?? []) {
      addNutrition(totals, scaleIngredientNutrition(ingredient, manual.weight, manual.unit, ingredientConversions));
      covered += 1;
    }
    // Defensive only — the resolve-sources flow should always ask for
    // whatever real stock can't cover, but fall back to the recipe's own
    // assumed range midpoint for any piece that still isn't accounted for
    // (e.g. an entry confirmed via the fully-automatic path before this
    // fallback existed) rather than silently under-counting it.
    const uncovered = Math.max(0, req.neededQuantity - covered);
    if (uncovered > 0) {
      const midpoint = ((req.pieceMinWeight ?? 0) + (req.pieceMaxWeight ?? 0)) / 2;
      addNutrition(
        totals,
        scaleIngredientNutrition(ingredient, midpoint * uncovered, req.pieceWeightUnit || "g", ingredientConversions),
      );
    }
  }

  return totals;
}

export function computeDayNutrition(entries: MealPlanEntry[], conversions: CustomUnitConversion[] = []): DayNutrition {
  const totals = emptyNutritionTotals();
  for (const entry of entries) {
    if (entry.recipe) {
      const confirmed = entry.status === "confirmed"
        ? computeConfirmedRecipeNutrition(entry, conversions)
        : null;
      addNutrition(totals, confirmed ?? scaleRecipeNutrition(entry.recipe, entry.recipeServings ?? 1));
      continue;
    }
    if (entry.ingredient) {
      addNutrition(totals, scaleIngredientNutrition(
        entry.ingredient,
        entry.ingredientQuantity ?? 0,
        entry.ingredientUnit,
        getIngredientConversions(entry.ingredient, conversions),
      ));
      continue;
    }
    if (entry.restaurantMeal) {
      // A day total is always entry-specific — unlike getRestaurantMealKcal,
      // there's no legitimate "show the whole menu" case here, so an
      // entry with no selections recorded contributes nothing rather than
      // ever falling back to every dish on the restaurant's record.
      const selections = entry.restaurantDishSelections ?? [];
      const quantityByDish = new Map(selections.map(s => [s.dish, s.quantity]));
      const dishes = entry.restaurantMeal.dishes?.filter(d => quantityByDish.has(d._id));
      for (const dish of dishes ?? []) {
        addNutrition(totals, scaleNutrition(dish.nutrition, quantityByDish.get(dish._id) ?? 1));
      }
      continue;
    }
    for (const course of entry.meal?.courses ?? []) {
      const nutrition = courseNutrition(course, conversions);
      if (nutrition) addNutrition(totals, nutrition);
    }
  }
  return roundNutritionTotals(totals);
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

// The "wholePiece" counterpart to ingredientAvailabilityState above — counts
// real qualifying pantry pieces instead of pooling a total weight, so an
// undersized or oversized piece doesn't silently count toward the need.
// lowStockThreshold isn't piece-aware (it's expressed in the ingredient's
// native weight unit, not a piece count), so there's no soft buffer here:
// green when more qualifying pieces exist than needed, yellow when exactly
// enough, red on a genuine shortfall — same 3-state shape as the
// zero-threshold case above.
function wholePieceAvailabilityState(
  ingredient: Ingredient,
  neededPieces: number,
  pieceMinWeight: number,
  pieceMaxWeight: number,
  pieceWeightUnit: string,
  allIngredients: Ingredient[],
  pantryItems: PantryItem[],
  customConversions: CustomUnitConversion[],
): AvailabilityState {
  const qualifying = countQualifyingPantryPieces(
    ingredient,
    pieceMinWeight,
    pieceMaxWeight,
    pieceWeightUnit,
    allIngredients,
    pantryItems,
    customConversions,
  );
  const remaining = qualifying - neededPieces;
  return remaining > 0 ? "green" : remaining >= 0 ? "yellow" : "red";
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
    const state = entry.matchMode === "wholePiece"
      ? wholePieceAvailabilityState(
          ing,
          entry.quantity,
          entry.pieceMinWeight ?? 0,
          entry.pieceMaxWeight ?? 0,
          entry.pieceWeightUnit || "g",
          allIngredients,
          pantryItems,
          customConversions,
        )
      : ingredientAvailabilityState(ing, entry.quantity, entry.unit, allIngredients, pantryItems, customConversions);
    availability = worseOf(availability, state);
    if (availability === "red") break;
  }
  return availability;
}

// A meal-plan entry can point at a recipe, a bare ingredient, or a meal (a
// set of recipe / ingredient courses) — a course's own recipe ref is a thin projection
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
      const ingredientRef = courseIngredient(course);
      if (ingredientRef) {
        const ingredient = ingredientMap.get(ingredientRef._id);
        if (!ingredient) continue;
        const state = ingredientAvailabilityState(
          ingredient,
          course.quantity ?? 0,
          course.unit || ingredient.defaultPortionUnit || "",
          allIngredients,
          pantryItems,
          customConversions,
        );
        availability = worseOf(availability, state);
        continue;
      }
      const ref = courseRecipe(course);
      if (!ref) continue;
      const fullRecipe = recipeMap.get(ref._id);
      if (!fullRecipe) continue;
      const state = getRecipeAvailability(fullRecipe, ingredientMap, allIngredients, pantryItems, customConversions);
      if (state) availability = worseOf(availability, state);
    }
    return availability;
  }

  return null;
}
