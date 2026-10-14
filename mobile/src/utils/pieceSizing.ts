import type { Ingredient } from "@/src/services/ingredientApi";
import type { MealPlanEntry } from "@/src/services/mealPlanApi";
import type { Recipe } from "@/src/services/recipeApi";
import type { PantryItem } from "@/src/types/pantry";

import { pieceWeightInRange } from "./ingredientStock";
import { scaleIngredientNutrition } from "./mealPlan";
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
  return (recipe: Recipe, from: PantryItem[], servings = 1): PieceSize => {
    const used: PantryItem[] = [];
    const shift: MacroShift = { calories: 0, protein: 0, carbs: 0, fats: 0 };
    let piece: string | undefined;
    const ratio = servings / (recipe.servings || 1);
    for (const line of pieceLines(recipe, ratio, from)) {
      const family = new Set([line.ingredient._id, ...ingredients.filter((i) => idOf(i.genericParent) === line.ingredient._id).map((i) => i._id)]);
      for (let n = 0; n < line.count; n++) {
        const item = from.find((p) => !used.includes(p) && family.has(idOf(p.ingredient)) && pieceWeightInRange(p.quantityAvailable ?? 0, p.quantityUnit, line.min, line.max, line.unit, conversionsOf(line.ingredient)));
        if (!item) continue;
        used.push(item);
        // The recipe as written assumes a piece in the middle of its range.
        const own = ingredientById.get(idOf(item.ingredient)) ?? line.ingredient;
        const real = scaleIngredientNutrition(own, item.quantityAvailable ?? 0, item.quantityUnit, conversionsOf(own));
        const assumed = scaleIngredientNutrition(line.ingredient, (line.min + line.max) / 2, line.unit, conversionsOf(line.ingredient));
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
        const item = from.find((p) => !used.includes(p) && p.nutrition && idOf(p.ingredient) === ingredient._id);
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
// once those have taken theirs. The piece is the one soonest to expire: a
// planned meal doesn't say which it'll be until it's eaten.
export function sizePlanned(entries: MealPlanEntry[], recipes: Recipe[], ingredients: Ingredient[], pantryItems: PantryItem[], conversions: CustomUnitConversion[], today: string): { entries: MealPlanEntry[]; stock: PantryItem[] } {
  const size = pieceSizer(recipes, ingredients, conversions);
  // What's in stock and not yet spoken for, soonest to expire first.
  let stock = pantryItems.filter((p) => (p.quantityAvailable ?? 0) > 0).sort((a, b) => (a.expiryDate ?? "9").localeCompare(b.expiryDate ?? "9"));
  const sizes = new Map<MealPlanEntry, PieceSize>();
  for (const entry of entries.filter((e) => e.status !== "confirmed" && e.date >= today && e.recipe).sort((a, b) => a.date.localeCompare(b.date))) {
    const sized = size(entry.recipe!, stock, entry.recipeServings ?? 1);
    if (!sized.claims.length) continue;
    sizes.set(entry, sized);
    stock = stock.filter((p) => !sized.claims.includes(p._id));
  }
  return { entries: entries.map((e) => (sizes.has(e) ? { ...e, sizedTo: sizes.get(e) } : e.sizedTo ? { ...e, sizedTo: undefined } : e)), stock };
}
