import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import FoodSettings from "../models/FoodSettings.js";
import GroceryItem from "../models/GroceryItem.js";
import Ingredient from "../models/Ingredient.js";
import IngredientCategory from "../models/IngredientCategory.js";
import Meal from "../models/Meal.js";
import MealPlanEntry from "../models/MealPlanEntry.js";
import PantryItem from "../models/PantryItem.js";
import Recipe from "../models/Recipe.js";
import UsualMeal from "../models/UsualMeal.js";

// The food library: USDA FoodData Central's generic foods (SR Legacy and
// Foundation, public domain — see data/usda-foods/README.md), renamed and
// portioned for Orbit, as shared ingredients. Run each time the server
// connects to a database: it adds the foods that aren't there yet (by their
// USDA id), in their categories, and nothing else — a library food that's
// there already is never changed, since someone's ingredient matched to it
// keeps its own name and numbers.

const LIBRARY = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "usda-foods", "foods.json");

export async function ensureFoodLibrary() {
  const foods = JSON.parse(fs.readFileSync(LIBRARY, "utf8"));
  const have = new Set(await Ingredient.distinct("fdcId", { fdcId: { $type: "number" } }).setOptions({ anyOwner: true }));
  const missing = foods.filter((food) => !have.has(food.fdcId) && !(food.alsoFdcIds ?? []).some((id) => have.has(id)));
  if (!missing.length) return { added: 0, total: foods.length };

  // Their categories, shared, made where one doesn't exist yet.
  const categories = new Map();
  for (const name of new Set(missing.map((food) => food.category))) {
    const normalizedName = name.toLowerCase();
    const category =
      (await IngredientCategory.findOne({ owner: null, normalizedName }).setOptions({ anyOwner: true })) ??
      (await IngredientCategory.create({ name, normalizedName, owner: null }));
    categories.set(name, category._id);
  }

  await Ingredient.insertMany(
    missing.map((food) => ({
      name: food.name,
      category: categories.get(food.category),
      isGeneric: true,
      source: "usda",
      fdcId: food.fdcId,
      alsoFdcIds: food.alsoFdcIds,
      sourceName: food.sourceName,
      aliases: food.aliases,
      pieceLabel: food.pieceLabel,
      defaultPortionAmount: food.defaultPortionAmount,
      defaultPortionUnit: food.defaultPortionUnit,
      unitConversions: food.unitConversions,
      nutrition: food.nutrition,
      owner: null,
    })),
    // (Every food or none: a food that doesn't fit the model is an error in
    // the data file, not something to skip quietly.)
    { ordered: false, throwOnValidationError: true },
  );
  return { added: missing.length, total: foods.length };
}

// Everything that points at an ingredient (the app finds each one in the
// person's ingredient list — a recipe's lines, a meal's courses, a pantry
// item, a planned or logged meal, the grocery list).
const USES = [
  [Recipe, ["ingredientList.ingredient"]],
  [PantryItem, ["ingredient", "madeFrom.ingredient"]],
  [MealPlanEntry, ["ingredient", "manualPieceEntries.ingredient", "pieceSizes.ingredient"]],
  [Meal, ["courses.ingredient", "sections.ingredient"]],
  [GroceryItem, ["ingredient"]],
  [UsualMeal, ["ingredient"]],
];

// The library foods in the signed-in person's list: the ones they've saved,
// and the ones anything they can see uses (a shared recipe's line, say, or
// a scanned product's generic) — so the app finds every ingredient it's
// pointed at, saved or not. (The library isn't listed in full: it's
// searched, GET /api/ingredients/library.)
export async function libraryFoodsListed() {
  const lists = await Promise.all([
    FoodSettings.distinct("item", { kind: "ingredient", saved: true }),
    Ingredient.distinct("genericParent", { source: { $ne: "usda" }, genericParent: { $ne: null } }),
    ...USES.flatMap(([Model, paths]) => paths.map((path) => Model.distinct(path))),
  ]);
  const ids = [...new Set(lists.flat().filter(Boolean).map(String))];
  if (!ids.length) return [];
  return Ingredient.distinct("_id", { _id: { $in: ids }, source: "usda" });
}
