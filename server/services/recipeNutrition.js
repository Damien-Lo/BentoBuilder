import UserProfile from "../models/UserProfile.js";
import Ingredient from "../models/Ingredient.js";
import {
  ALL_NUTRITION_FIELD_NAMES,
  CORE_NUTRITION_FIELD_NAMES,
  EXTENDED_NUTRITION_FIELD_NAMES,
} from "../models/nutritionSchema.js";
import { convertUnits, getIngredientConversions } from "./unitConversion.js";

// Shared by RecipeRoutes.js (create/update/self-heal-on-read) and the
// one-off nutrition-backfill script — one implementation so the "how a
// recipe's nutrition is computed" logic never drifts between call sites.
//
// Expects recipe.ingredientList.ingredient to already be populated (with
// nutrition, defaultPortionAmount/Unit, unitConversions, genericParent).
export async function calcNutrition(recipe) {
  const profile = await UserProfile.findOne().select("unitConversions").lean();
  const globalConversions = profile?.unitConversions ?? [];

  const servings = Math.max(1, recipe.servings || 1);
  const totals = Object.fromEntries(ALL_NUTRITION_FIELD_NAMES.map((field) => [field, 0]));
  // Extended fields only get a number if at least one contributing
  // ingredient actually has a value for them — otherwise a recipe built
  // entirely from ingredients with no extended data on file (the whole
  // catalog, today) would report "0 cholesterol" as if that were known,
  // rather than unknown. Core fields keep their existing missing-as-0
  // behavior unchanged, so existing recipe snapshots don't shift.
  const extendedFieldsSeen = new Set();
  let hasData = false;

  for (const entry of recipe.ingredientList) {
    const ing = entry.ingredient;
    if (!ing || typeof ing !== "object" || !ing.nutrition) continue;

    // A "wholePiece" line has no single real amount in entry.unit to
    // convert (it's just a display label like "fillet") - the snapshot
    // estimate uses entry.quantity (how many pieces) x the midpoint of its
    // acceptable weight range as a stand-in for "how big a piece probably
    // is." The real, exact nutrition once actually cooked comes from
    // whichever real pantry piece got deducted (mobile's
    // computeConfirmedRecipeNutrition), not this cached snapshot.
    const quantityInNativeUnit = entry.matchMode === "wholePiece"
      ? convertUnits(
          entry.quantity * ((entry.pieceMinWeight + entry.pieceMaxWeight) / 2),
          entry.pieceWeightUnit,
          ing.defaultPortionUnit,
          getIngredientConversions(ing, globalConversions),
        )
      : convertUnits(
          entry.quantity,
          entry.unit,
          ing.defaultPortionUnit,
          getIngredientConversions(ing, globalConversions),
        );
    if (quantityInNativeUnit == null) continue;

    const multiplier =
      (quantityInNativeUnit / (ing.defaultPortionAmount || 1)) *
      (entry.nutritionFactor ?? 1);
    for (const field of CORE_NUTRITION_FIELD_NAMES) {
      totals[field] += (ing.nutrition[field] || 0) * multiplier;
    }
    for (const field of EXTENDED_NUTRITION_FIELD_NAMES) {
      const value = ing.nutrition[field];
      if (value == null) continue;
      totals[field] += value * multiplier;
      extendedFieldsSeen.add(field);
    }
    hasData = true;
  }

  if (!hasData) return null;
  const r = (n) => Math.round(n / servings * 10) / 10;
  const result = {};
  for (const field of CORE_NUTRITION_FIELD_NAMES) {
    result[field] = r(totals[field]);
  }
  for (const field of EXTENDED_NUTRITION_FIELD_NAMES) {
    result[field] = extendedFieldsSeen.has(field) ? r(totals[field]) : null;
  }
  return result;
}

// A produced ingredient's nutrition is a derived value, not something
// manually edited once linked — keep it permanently in sync with whatever
// this recipe's own (already-automatic) nutrition computes to, every time
// the recipe is saved (or self-healed on read).
export async function syncProducedIngredientNutrition(recipe, nutrition) {
  if (!nutrition) return;

  const producedIngredient = await Ingredient.findOne({ productionRecipe: recipe._id });
  if (!producedIngredient) return;

  producedIngredient.nutrition = nutrition;
  await producedIngredient.save();
}

// True if any tracked field differs — used to skip a write when a recompute
// lands on the same values (e.g. self-heal on a GET that was already up to
// date). A stored document from before extended fields existed reads them
// as undefined, which `?? null` treats the same as a computed null, so
// adding the new fields doesn't make every existing recipe look "changed."
export function nutritionChanged(current, computed) {
  if (!computed) return false;
  if (!current) return true;
  return ALL_NUTRITION_FIELD_NAMES.some((f) => (current[f] ?? null) !== (computed[f] ?? null));
}
