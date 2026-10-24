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
import { currentScope } from "./ownership.js";

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
  [Meal, ["courses.ingredient", "bentoLayout.sections.ingredient"]],
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

// What a new account starts with saved (data/usda-foods/starter.json): about
// 260 everyday foods, so their list isn't empty on day one — library foods
// by USDA id (an ingredient matched to one counts), and a few of the shared
// catalog's own generics by name, for staples USDA doesn't have (udon,
// mirin, gochujang…). One that isn't there is skipped.
const STARTER = path.join(path.dirname(LIBRARY), "starter.json");

export async function giveStarterSet(userId) {
  const starter = JSON.parse(fs.readFileSync(STARTER, "utf8"));
  const fdcIds = starter.filter((s) => s.fdcId).map((s) => s.fdcId);
  const names = starter.filter((s) => s.catalog).map((s) => s.catalog);
  const found = await Ingredient.find(
    { owner: null, isArchived: false, $or: [{ fdcId: { $in: fdcIds } }, { alsoFdcIds: { $in: fdcIds } }, { isGeneric: true, name: { $in: names } }] },
    "_id",
  )
    .setOptions({ anyOwner: true })
    .lean();
  if (!found.length) return { saved: 0, of: starter.length };
  const now = new Date();
  await FoodSettings.collection.bulkWrite(
    found.map(({ _id }) => ({
      updateOne: {
        filter: { owner: userId, kind: "ingredient", item: _id },
        update: { $set: { saved: true, updatedAt: now }, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return { saved: found.length, of: starter.length };
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isAdmin = () => !!currentScope()?.legacy;

// Everything one can add, by name and aliases — the food library, the rest of
// the shared catalog and one's own — each word matching the start of a word
// ("gre oni" finds green onion). Best first: names starting with what was
// typed (as a whole word first), then plain foods before branded ones, then
// shorter names. Each with `saved`: in one's own list (one's own always are;
// for the admin, the shared catalog too).
export async function searchFoods(query, { limit = 40 } = {}) {
  const q = String(query ?? "").trim().toLowerCase();
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  // (Plural or not: "bananas" finds Banana, "tomatoes" Tomato, "berries" Berry.)
  const stems = words.map((word) => (word.length < 4 || word.endsWith("ss") ? word : word.endsWith("ies") ? word.slice(0, -3) : word.endsWith("oes") ? word.slice(0, -2) : word.endsWith("s") ? word.slice(0, -1) : word));
  const each = stems.map((stem) => {
    const start = new RegExp(`(^|[^a-z])${escapeRegex(stem)}`, "i");
    return { $or: [{ name: start }, { aliases: start }] };
  });
  const found = await Ingredient.find({ isArchived: false, isMealPrep: { $ne: true }, $and: each })
    .populate("category")
    .populate("brand")
    .limit(500)
    .lean();

  const shared = found.filter((ingredient) => ingredient.owner == null).map((ingredient) => ingredient._id);
  const saved = new Set((await FoodSettings.find({ kind: "ingredient", item: { $in: shared }, saved: true }, "item").lean()).map((s) => String(s.item)));
  // ("egg": "Egg, raw" before "Eggnog".)
  const typed = stems.join(" ");
  const whole = new RegExp(`^${escapeRegex(typed)}(e?s)?($|[^a-z])`, "i");
  const rank = (ingredient) => {
    const name = ingredient.name.toLowerCase();
    return [whole.test(name) ? 0 : name.startsWith(typed) ? 1 : name.startsWith(stems[0]) ? 2 : 3, ingredient.brand ? 1 : 0, name.length];
  };
  const order = (a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.name.localeCompare(b.name);
  };
  return found
    .sort(order)
    .slice(0, limit)
    .map((ingredient) => ({ ...ingredient, saved: ingredient.owner != null || saved.has(String(ingredient._id)) || (isAdmin() && ingredient.source !== "usda") }));
}

// One's own ingredient list, as ids to match against: one's own, the shared
// ones one's saved, and for the admin the shared catalog (theirs).
export async function savedIngredientFilter() {
  const saved = await FoodSettings.distinct("item", { kind: "ingredient", saved: true });
  return { $or: [{ owner: { $ne: null } }, { _id: { $in: saved } }, ...(isAdmin() ? [{ owner: null, source: { $ne: "usda" } }] : [])] };
}

// A receipt's lines the reader didn't match to one's own ingredients, tried
// against the food library (and the rest of the shared catalog) by the name
// the reader proposed: a food whose name is that name (plural or not — a
// grocery's raw form first: "Chicken Breast" → "Chicken breast, raw") is the
// line's match (`matchedFrom: "library"`; saved when the line is confirmed);
// otherwise the closest few come with it (`librarySuggestions`). A branded
// line isn't matched to a generic food. Left as it is when nothing's near.
const plain = (name) => name.toLowerCase().split(",")[0].trim().replace(/\b(\w+?)(es|s)\b/g, (w, stem) => (stem.length > 2 ? stem : w));
export async function matchReceiptToLibrary(parse) {
  for (const line of parse.lineItems ?? []) {
    const proposed = line.proposedIngredient;
    if (line.matchedIngredientId || !proposed) continue;
    // (Ground meat as it's sold, "85/15", is the library's "85% lean".)
    const wanted = ((proposed.isGeneric ? proposed.name : proposed.genericName) ?? proposed.name)?.replace(/\b(\d{2})\s*\/\s*\d{1,2}\b/, "$1% lean");
    if (!wanted) continue;
    let found = (await searchFoods(wanted, { limit: 12 })).filter((food) => !food.saved && !food.brand);
    let partly = false;
    // (Nothing by the whole name — "Broccoli Crowns", "Large Brown Eggs":
    // fewer of its words, the last one — the food — kept longest; only ever
    // suggested, since "Spicy Marinated Radish" isn't a raw radish.)
    const words = wanted.split(/\s+/).filter((word) => /[a-z]/i.test(word));
    const fewest = words.join(" ") === wanted.trim() ? words.length - 1 : words.length;
    for (let size = fewest; !found.length && size >= 1; size--) {
      for (let start = words.length - size; start >= 0 && !found.length; start--) {
        found = (await searchFoods(words.slice(start, start + size).join(" "), { limit: 12 })).filter((food) => !food.saved && !food.brand);
        partly = found.length > 0;
      }
    }
    if (!found.length) continue;
    // (Only that food, or it raw: "Ground Beef" is any of several — suggested, not matched.)
    const named = (food) => [food.name, ...(food.aliases ?? [])].some((name) => plain(name) === plain(wanted));
    const best = found.find((food) => named(food) && !food.name.includes(",")) ?? found.find((food) => named(food) && food.name.toLowerCase() === `${food.name.split(",")[0].toLowerCase()}, raw`);
    if (best && proposed.isGeneric && !partly) {
      line.matchedIngredientId = String(best._id);
      line.matchedFrom = "library";
    } else {
      // (Groceries: a food raw before it cooked.)
      const raw = (food) => (/\braw\b/i.test(food.name) ? 0 : /\b(cooked|boiled|roasted|fried|grilled|broiled|braised|baked|stewed|steamed)\b/i.test(food.name) ? 2 : 1);
      line.librarySuggestions = [...found].sort((a, b) => raw(a) - raw(b)).slice(0, 3).map((food) => ({ _id: String(food._id), name: food.name, sourceName: food.sourceName ?? null }));
    }
  }
  return parse;
}
