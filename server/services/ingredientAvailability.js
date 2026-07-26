import Ingredient from "../models/Ingredient.js";
import PantryItem from "../models/PantryItem.js";

/**
 * Pantry stock for one ingredient, grouped by unit.
 *
 * Generic ingredients (e.g. "Soy Sauce") are a matching umbrella, not a
 * physical product — they never hold pantry stock directly (enforced in
 * PantryRoutes). So for a generic, this aggregates stock across every
 * branded/specific variant registered under it (e.g. "Kikkoman Soy Sauce")
 * instead: availability of a generic depends on the combined stock of all
 * its options.
 *
 * Stock is grouped by unit rather than summed into one number: a 750ml
 * bottle of Kikkoman and 2 tbsp of a store-brand aren't comparable without
 * unit conversion, so callers compare like-for-like units.
 */
export async function getAvailableStock(ingredientId) {
  const ingredient = await Ingredient.findById(ingredientId);
  if (!ingredient) return null;

  let ingredientIds = [ingredient._id];

  if (ingredient.isGeneric) {
    const variants = await Ingredient.find({
      genericParent: ingredient._id,
      isArchived: false,
    }).select("_id");
    ingredientIds = variants.map((v) => v._id);
  }

  const pantryItems = await PantryItem.find({
    ingredient: { $in: ingredientIds },
    isFinished: false,
  });

  const byUnit = {};
  for (const item of pantryItems) {
    byUnit[item.quantityUnit] =
      (byUnit[item.quantityUnit] || 0) + item.quantityAvailable;
  }

  // The ingredient's own lowStockThreshold is only comparable to stock
  // recorded in its own unit — a threshold of "5 tbsp" can't be checked
  // against stock recorded in ml. For a generic, this is the total across
  // all variants that happen to share its unit.
  const totalInOwnUnit = byUnit[ingredient.defaultPortionUnit] || 0;
  const isOutOfStock = totalInOwnUnit <= 0;
  const isLowStock =
    !isOutOfStock &&
    ingredient.lowStockThreshold != null &&
    totalInOwnUnit <= ingredient.lowStockThreshold;

  return {
    ingredientId: ingredient._id,
    isGeneric: ingredient.isGeneric,
    variantCount: ingredient.isGeneric ? ingredientIds.length : 0,
    unit: ingredient.defaultPortionUnit,
    totalInOwnUnit,
    lowStockThreshold: ingredient.lowStockThreshold,
    isOutOfStock,
    isLowStock,
    byUnit,
  };
}

/**
 * Whether a recipe ingredient line (quantity + unit) is covered by current
 * pantry stock, including generic variant aggregation.
 */
export async function isRecipeIngredientAvailable({ ingredient, quantity, unit }) {
  const stock = await getAvailableStock(ingredient);
  if (!stock) return false;

  const available = stock.byUnit[unit] || 0;
  return available >= quantity;
}
