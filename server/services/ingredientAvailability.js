import Ingredient from "../models/Ingredient.js";
import PantryItem from "../models/PantryItem.js";
import UserProfile from "../models/UserProfile.js";
import { convertibleTotal } from "./unitConversion.js";

async function getCustomUnitConversions() {
  const profile = await UserProfile.findOne().select("unitConversions").lean();
  return profile?.unitConversions ?? [];
}

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

  // Convert whatever's convertible into the ingredient's own unit — a 750ml
  // bottle and 0.75L both count toward the same total — and skip anything
  // that isn't convertible.
  const customConversions = await getCustomUnitConversions();
  const totalInOwnUnit = convertibleTotal(byUnit, ingredient.defaultPortionUnit, customConversions);

  const isOutOfStock = !ingredient.isAlwaysAvailable && totalInOwnUnit <= 0;
  const isLowStock =
    !ingredient.isAlwaysAvailable &&
    !isOutOfStock &&
    ingredient.lowStockThreshold != null &&
    totalInOwnUnit <= ingredient.lowStockThreshold;

  return {
    ingredientId: ingredient._id,
    isGeneric: ingredient.isGeneric,
    isAlwaysAvailable: ingredient.isAlwaysAvailable,
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
 * pantry stock, including generic variant aggregation. The recipe line's
 * unit doesn't have to match how the stock is recorded (e.g. a recipe
 * calling for "2 cups" soy sauce checked against pantry stock in mL) —
 * whatever's convertible into the recipe's unit counts toward the total.
 */
export async function isRecipeIngredientAvailable({ ingredient, quantity, unit }) {
  const stock = await getAvailableStock(ingredient);
  if (!stock) return false;
  if (stock.isAlwaysAvailable) return true;

  const customConversions = await getCustomUnitConversions();
  const available = convertibleTotal(stock.byUnit, unit, customConversions);
  return available >= quantity;
}
