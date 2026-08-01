import Ingredient from "../models/Ingredient.js";
import Recipe from "../models/Recipe.js";

/**
 * Does `ingredientList` (a recipe's own current list, or a proposed new
 * one) transitively require `targetIngredientId` — by recursively
 * expanding through any ingredient in it that is itself produced by
 * another recipe?
 *
 * This is the hard gate against production cycles: a cycle can only ever
 * be introduced at two moments — linking an ingredient's productionRecipe
 * (IngredientRoutes.js PATCH), or editing a recipe's own ingredientList
 * (RecipeRoutes.js PATCH) — and both call this first. If it's correct, a
 * cycle can never exist in saved data, which matters because cascading
 * substitution (pantryDeduction.ts's expandProducedIngredientRows)
 * actually recurses through these links at runtime — an undetected cycle
 * there would be infinite recursion, not just unused/inert data.
 *
 * `visitedRecipeIds` tracks recipes already expanded in the current
 * traversal path — revisiting one is itself a cycle (distinct from, and in
 * addition to, directly finding targetIngredientId in some recipe's list).
 */
export async function wouldCreateCycle(targetIngredientId, ingredientList, visitedRecipeIds = new Set()) {
  const targetId = String(targetIngredientId);

  for (const entry of ingredientList) {
    const entryIngredientId = String(entry.ingredient);
    if (entryIngredientId === targetId) return true;

    const entryIngredient = await Ingredient.findById(entryIngredientId).select("productionRecipe");
    const subRecipeId = entryIngredient?.productionRecipe ? String(entryIngredient.productionRecipe) : null;
    if (!subRecipeId) continue;

    if (visitedRecipeIds.has(subRecipeId)) return true;

    const subRecipe = await Recipe.findById(subRecipeId).select("ingredientList.ingredient");
    if (!subRecipe) continue;

    const nextVisited = new Set(visitedRecipeIds);
    nextVisited.add(subRecipeId);

    if (await wouldCreateCycle(targetId, subRecipe.ingredientList, nextVisited)) {
      return true;
    }
  }

  return false;
}
