import Ingredient from "../models/Ingredient.js";
import PantryItem from "../models/PantryItem.js";
import UserProfile from "../models/UserProfile.js";
import { convertibleTotal, getIngredientConversions } from "./unitConversion.js";

async function getGlobalUnitConversions() {
  const profile = await UserProfile.findOne().select("unitConversions").lean();
  return profile?.unitConversions ?? [];
}

/**
 * Pantry stock for one ingredient, grouped by unit.
 *
 * Generic ingredients (e.g. "Soy Sauce") are a matching umbrella — a recipe
 * calling for one can be satisfied by any specific/branded variant
 * registered under it (e.g. "Kikkoman Soy Sauce") — but they can also hold
 * pantry stock directly (e.g. buying garlic with no brand in mind). So a
 * generic's availability is its own direct stock plus every variant's.
 *
 * Stock is grouped by unit rather than summed into one number: a 750ml
 * bottle of Kikkoman and 2 tbsp of a store-brand aren't comparable without
 * unit conversion, so callers compare like-for-like units.
 */
export async function getAvailableStock(ingredientId) {
  const ingredient = await Ingredient.findById(ingredientId).populate("genericParent");
  if (!ingredient) return null;

  let ingredientIds = [ingredient._id];
  let variantCount = 0;
  let variants = [];

  if (ingredient.isGeneric) {
    variants = await Ingredient.find({
      genericParent: ingredient._id,
      isArchived: false,
    }).select("_id unitConversions");
    variantCount = variants.length;
    ingredientIds = [ingredient._id, ...variants.map((v) => v._id)];
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
  // that isn't convertible. Prefers this ingredient's own density-style
  // conversions (and its generic parent's), falling back to each variant's
  // own (pooled here since stock above is already merged across variants by
  // unit, not tracked per source ingredient) and finally the global list.
  const globalConversions = await getGlobalUnitConversions();
  const customConversions = [
    ...getIngredientConversions(ingredient, []),
    ...variants.flatMap((v) => v.unitConversions ?? []),
    ...globalConversions,
  ];
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
    variantCount,
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
export async function isRecipeIngredientAvailable({ ingredient: ingredientId, quantity, unit }) {
  const stock = await getAvailableStock(ingredientId);
  if (!stock) return false;
  if (stock.isAlwaysAvailable) return true;

  const ingredient = await Ingredient.findById(ingredientId).populate("genericParent");
  const variants = stock.isGeneric
    ? await Ingredient.find({ genericParent: ingredientId, isArchived: false }).select("unitConversions")
    : [];
  const globalConversions = await getGlobalUnitConversions();
  const customConversions = [
    ...getIngredientConversions(ingredient, []),
    ...variants.flatMap((v) => v.unitConversions ?? []),
    ...globalConversions,
  ];

  const available = convertibleTotal(stock.byUnit, unit, customConversions);
  return available >= quantity;
}
