import type { Ingredient } from "@/src/services/ingredientApi";
import type { MealPlanEntry } from "@/src/services/mealPlanApi";
import type { Recipe } from "@/src/services/recipeApi";
import type { PantryItem } from "@/src/types/pantry";

import { pieceWeightInRange } from "./ingredientStock";
import { scaleIngredientNutrition, scaleRecipeNutrition } from "./mealPlan";
import { recipeLineToRow } from "./pantryDeduction";
import { convertUnits, getIngredientConversions, type CustomUnitConversion } from "./unitConversion";

// A recipe that takes a whole piece — one fillet, one steak — is written for
// a piece in the middle of its range. What it really comes to depends on the
// piece that goes into it: the one in the pantry, or the bag already made
// ahead from one, which keeps that piece's figures (PantryItem.nutrition).
//
// This works out the difference for a recipe from what's in stock, and which
// entries it would use — each piece going to one meal only.

const MACROS = ["calories", "protein", "carbs", "fats"] as const;
export type MacroShift = Record<(typeof MACROS)[number], number>;

export interface PieceSize {
  // What to add to the recipe's figures as written.
  shift: MacroShift;
  // The pantry entries it would use.
  claims: string[];
  // The piece, in a few words ("260 g chilean sea bass").
  piece?: string;
}

// Which piece a meal gets, of those that would do: the one that brings the
// dish nearest the calories wanted of it, and the one that goes off sooner —
// each to its weight here (hand-set, to be learned like the suggestions'
// own). Over counts for more than under; a date counts for more the nearer
// it is, inside `soonDays`. Nothing is forced: something about to go that
// doesn't fit the day is left, to be used otherwise or thrown out.
export const PIECE_CHOICE = { fit: 1, over: 1.5, expiry: 0.5, soonDays: 14 };
// How a day's calories are shared between its meals, and how much of a
// meal's share its main dish is taken to be.
const SLOT_SHARE: Record<string, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.35, snack: 0.05 };
const MAIN_SHARE = 0.75;

// What's wanted of a dish, for choosing its piece: the calories to come
// near (`base` being the dish as written), and the day it's for.
export interface PieceWant {
  calories?: number;
  base?: number;
  date?: string;
  // The entries already taken out for it: those, whatever else there is.
  pinned?: string[];
}

const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to.slice(0, 10)}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

const idOf = (value: unknown): string => (typeof value === "string" ? value : typeof value === "object" && value !== null && "_id" in value ? String((value as { _id?: unknown })._id ?? "") : "");
const round = (n: number) => Math.round(n * 100) / 100;

export function pieceSizer(recipes: Recipe[], ingredients: Ingredient[], conversions: CustomUnitConversion[]) {
  const ingredientById = new Map(ingredients.map((i) => [i._id, i]));
  const recipeById = new Map(recipes.map((r) => [r._id, r]));
  const conversionsOf = (ingredient: Ingredient) => getIngredientConversions(ingredient, conversions, ingredients);

  // The whole pieces some servings of a recipe take — its own, and those of
  // anything it uses that's made ahead from one (a marinated fillet in a
  // bag) and hasn't been made yet.
  type PieceLine = { ingredient: Ingredient; count: number; min: number; max: number; unit: string; factor: number };
  const pieceLines = (recipe: Recipe, ratio: number, from: PantryItem[], nested = false): PieceLine[] =>
    recipe.ingredientList.flatMap((line) => {
      const ingredient = ingredientById.get(idOf(line.ingredient));
      if (!ingredient) return [];
      if (line.matchMode === "wholePiece") {
        const count = recipeLineToRow(line, ratio).quantity;
        return count > 0 ? [{ ingredient, count, min: line.pieceMinWeight ?? 0, max: line.pieceMaxWeight ?? Infinity, unit: line.pieceWeightUnit ?? "g", factor: line.nutritionFactor ?? 1 }] : [];
      }
      const made = recipeById.get(idOf(ingredient.productionRecipe));
      if (nested || !made?.madeAhead || from.some((p) => idOf(p.ingredient) === ingredient._id)) return [];
      return pieceLines(made, (line.quantity * ratio) / (made.servings || 1), from, true);
    });

  // `servings` of a recipe at the size of the pieces it would get from `from`.
  return (recipe: Recipe, from: PantryItem[], servings = 1, want: PieceWant = {}): PieceSize => {
    const used: PantryItem[] = [];
    const shift: MacroShift = { calories: 0, protein: 0, carbs: 0, fats: 0 };
    // Of the entries that would do (soonest to expire first), the one to
    // take — `adds` being what it would add to the dish's calories.
    const choose = (candidates: PantryItem[], adds: (item: PantryItem) => number): PantryItem | undefined => {
      const taken = candidates.find((item) => want.pinned?.includes(item._id));
      if (taken) return taken;
      if (candidates.length < 2 || !want.calories || want.base == null) return candidates[0];
      const cost = (item: PantryItem) => {
        const left = item.expiryDate && want.date ? daysUntil(want.date, item.expiryDate) : 365;
        const off = (want.base! + shift.calories + adds(item) - want.calories!) / want.calories!;
        return PIECE_CHOICE.fit * (off > 0 ? off * PIECE_CHOICE.over : -off) + PIECE_CHOICE.expiry * Math.max(0, Math.min(1, left / PIECE_CHOICE.soonDays));
      };
      return candidates.map((item) => ({ item, cost: cost(item) })).sort((a, b) => a.cost - b.cost)[0].item;
    };
    let piece: string | undefined;
    const ratio = servings / (recipe.servings || 1);
    for (const line of pieceLines(recipe, ratio, from)) {
      const family = new Set([line.ingredient._id, ...ingredients.filter((i) => idOf(i.genericParent) === line.ingredient._id).map((i) => i._id)]);
      for (let n = 0; n < line.count; n++) {
        // The recipe as written assumes a piece in the middle of its range.
        const assumed = scaleIngredientNutrition(line.ingredient, (line.min + line.max) / 2, line.unit, conversionsOf(line.ingredient));
        const realOf = (p: PantryItem) => {
          const its = ingredientById.get(idOf(p.ingredient)) ?? line.ingredient;
          return scaleIngredientNutrition(its, p.quantityAvailable ?? 0, p.quantityUnit, conversionsOf(its));
        };
        const item = choose(
          from.filter((p) => !used.includes(p) && family.has(idOf(p.ingredient)) && pieceWeightInRange(p.quantityAvailable ?? 0, p.quantityUnit, line.min, line.max, line.unit, conversionsOf(line.ingredient))),
          (p) => ((realOf(p).calories ?? 0) - (assumed.calories ?? 0)) * line.factor,
        );
        if (!item) continue;
        used.push(item);
        const own = ingredientById.get(idOf(item.ingredient)) ?? line.ingredient;
        const real = realOf(item);
        for (const m of MACROS) shift[m] += ((real[m] ?? 0) - (assumed[m] ?? 0)) * line.factor;
        piece = `${round(item.quantityAvailable ?? 0)} ${item.quantityUnit} ${own.name.toLowerCase()}`;
      }
    }
    // Something already made ahead from one particular piece (a bag from one
    // steak) carries its own figures: the dish counts at those.
    for (const line of recipe.ingredientList) {
      const ingredient = ingredientById.get(idOf(line.ingredient));
      if (!ingredient || line.matchMode === "wholePiece") continue;
      const { quantity, unit } = recipeLineToRow(line, ratio);
      let left = quantity;
      while (left > 1e-6) {
        const item = choose(
          from.filter((p) => !used.includes(p) && p.nutrition && idOf(p.ingredient) === ingredient._id),
          (p) => (((p.nutrition?.calories ?? 0) - (ingredient.nutrition?.calories ?? 0)) * left * (line.nutritionFactor ?? 1)) / (ingredient.defaultPortionAmount || 1),
        );
        if (!item) break;
        used.push(item);
        const has = convertUnits(item.quantityAvailable ?? 0, item.quantityUnit, unit, conversionsOf(ingredient));
        const take = has == null ? left : Math.min(left, has);
        const real = scaleIngredientNutrition({ ...ingredient, nutrition: item.nutrition } as Ingredient, take, unit, conversionsOf(ingredient));
        const usual = scaleIngredientNutrition(ingredient, take, unit, conversionsOf(ingredient));
        for (const m of MACROS) if (real[m] != null && usual[m] != null) shift[m] += (real[m]! - usual[m]!) * (line.nutritionFactor ?? 1);
        const source = item.madeFrom?.[0];
        if (source) piece = `${round(source.amount)} ${source.unit} ${(ingredientById.get(source.ingredient)?.name ?? ingredient.name).toLowerCase()}`;
        left -= take;
        if (take <= 0) break;
      }
    }
    return { shift, claims: used.map((p) => p._id), ...(piece ? { piece } : {}) };
  };
}

// The plan with each meal still to be eaten counted at the piece it would
// get, soonest first (see MealPlanEntry.sizedTo) — and what's left in stock
// once those have taken theirs. A planned meal doesn't say which piece
// it'll be until it's eaten: it's what's been taken out of the freezer for
// it (MealPlanEntry.pieces), else the one chosen as above, for what its
// meal has room for out of `dayGoal`.
export function sizePlanned(entries: MealPlanEntry[], recipes: Recipe[], ingredients: Ingredient[], pantryItems: PantryItem[], conversions: CustomUnitConversion[], today: string, dayGoal?: number | null): { entries: MealPlanEntry[]; stock: PantryItem[] } {
  const size = pieceSizer(recipes, ingredients, conversions);
  // What's in stock and not yet spoken for, soonest to expire first.
  let stock = pantryItems.filter((p) => (p.quantityAvailable ?? 0) > 0).sort((a, b) => (a.expiryDate ?? "9").localeCompare(b.expiryDate ?? "9"));
  const sizes = new Map<MealPlanEntry, PieceSize>();
  // (What's been taken out for a meal is that meal's, however far off it is.)
  const held = (e: MealPlanEntry) => (e.pieces?.length ? 0 : 1);
  for (const entry of entries.filter((e) => e.status !== "confirmed" && e.date >= today && e.recipe).sort((a, b) => held(a) - held(b) || a.date.localeCompare(b.date))) {
    const base = scaleRecipeNutrition(entry.recipe!, entry.recipeServings ?? 1).calories ?? 0;
    const beside = entries.filter((e) => e !== entry && e.date === entry.date && e.slot === entry.slot && e.recipe).reduce((sum, e) => sum + (scaleRecipeNutrition(e.recipe!, e.recipeServings ?? 1).calories ?? 0), 0);
    const room = dayGoal ? dayGoal * (SLOT_SHARE[entry.slot] ?? 0.3) : 0;
    const sized = size(entry.recipe!, stock, entry.recipeServings ?? 1, { calories: room ? Math.max(150, beside ? room - beside : room * MAIN_SHARE) : undefined, base, date: entry.date, pinned: entry.pieces });
    if (!sized.claims.length) continue;
    sizes.set(entry, sized);
    stock = stock.filter((p) => !sized.claims.includes(p._id));
  }
  return { entries: entries.map((e) => (sizes.has(e) ? { ...e, sizedTo: sizes.get(e) } : e.sizedTo ? { ...e, sizedTo: undefined } : e)), stock };
}
