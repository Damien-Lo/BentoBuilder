import UserProfile from "../models/UserProfile.js";
import Ingredient from "../models/Ingredient.js";
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
  let calories = 0, protein = 0, carbs = 0, fats = 0, fiber = 0, sodium = 0;
  let hasData = false;

  for (const entry of recipe.ingredientList) {
    const ing = entry.ingredient;
    if (!ing || typeof ing !== "object" || !ing.nutrition) continue;

    const quantityInNativeUnit = convertUnits(
      entry.quantity,
      entry.unit,
      ing.defaultPortionUnit,
      getIngredientConversions(ing, globalConversions),
    );
    if (quantityInNativeUnit == null) continue;

    const multiplier = quantityInNativeUnit / (ing.defaultPortionAmount || 1);
    calories += (ing.nutrition.calories || 0) * multiplier;
    protein  += (ing.nutrition.protein  || 0) * multiplier;
    carbs    += (ing.nutrition.carbs    || 0) * multiplier;
    fats     += (ing.nutrition.fats     || 0) * multiplier;
    fiber    += (ing.nutrition.fiber    || 0) * multiplier;
    sodium   += (ing.nutrition.sodium   || 0) * multiplier;
    hasData = true;
  }

  if (!hasData) return null;
  const r = (n) => Math.round(n / servings * 10) / 10;
  return { calories: r(calories), protein: r(protein), carbs: r(carbs), fats: r(fats), fiber: r(fiber), sodium: r(sodium) };
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

// True if any of the 6 tracked fields differ — used to skip a write when a
// recompute lands on the same values (e.g. self-heal on a GET that was
// already up to date).
export function nutritionChanged(current, computed) {
  if (!computed) return false;
  if (!current) return true;
  const fields = ["calories", "protein", "carbs", "fats", "fiber", "sodium"];
  return fields.some((f) => (current[f] ?? null) !== (computed[f] ?? null));
}
