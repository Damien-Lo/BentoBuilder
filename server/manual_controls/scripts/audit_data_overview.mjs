// One-off read-only data audit — no writes, no deletes. Connects to the
// same MongoDB the app uses, pulls every Ingredient/Recipe/Meal/
// MealPlanEntry, and prints a summary of counts plus candidate lists for
// manual review (missing data, dangling refs, likely duplicates, stale
// planner entries). Run with:
//   node manual_controls/scripts/audit_data_overview.mjs
import mongoose from "mongoose";
import dotenv from "dotenv";

import Ingredient from "../../models/Ingredient.js";
import Recipe from "../../models/Recipe.js";
import Meal from "../../models/Meal.js";
import MealPlanEntry from "../../models/MealPlanEntry.js";
import "../../models/RestaurantMeal.js"; // registers the model so .populate("restaurantMeal") below can resolve it

dotenv.config();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normName(name) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function groupDuplicates(items, getName) {
  const byName = new Map();
  for (const item of items) {
    const key = normName(getName(item));
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(item);
  }
  return [...byName.values()].filter(group => group.length > 1);
}

function hasNoNutrition(n) {
  if (!n) return true;
  return n.calories == null && n.protein == null && n.carbs == null && n.fats == null && n.fiber == null && n.sodium == null;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing from server/.env");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name}\n`);

  // ── Ingredients ──────────────────────────────────────────────────────────
  const ingredients = await Ingredient.find().populate("genericParent", "name").populate("productionRecipe", "name");
  const activeIngredients = ingredients.filter(i => !i.isArchived);
  const archivedIngredients = ingredients.filter(i => i.isArchived);

  const noNutrition = activeIngredients.filter(i => hasNoNutrition(i.nutrition));
  const noBarcode = activeIngredients.filter(i => !i.isGeneric && !i.barcode);
  const dupIngredients = groupDuplicates(activeIngredients, i => i.name);
  // populate() leaves the field null when the ref can't be resolved, but only
  // if the raw id was actually set — re-check raw ids for true dangling refs.
  const rawIngredients = await Ingredient.find({ genericParent: { $ne: null } }, "genericParent name isArchived").lean();
  const genericParentIds = new Set(activeIngredients.filter(i => i.isGeneric).map(i => String(i._id)));
  const trueDanglingGenericParent = rawIngredients.filter(i => !genericParentIds.has(String(i.genericParent)));

  console.log("═══ INGREDIENTS ═══");
  console.log(`Total: ${ingredients.length}  (active: ${activeIngredients.length}, archived: ${archivedIngredients.length})`);
  console.log(`Missing all nutrition data: ${noNutrition.length}`);
  console.log(`Specific/branded with no barcode: ${noBarcode.length}`);
  console.log(`Possible duplicate names: ${dupIngredients.length} group(s), ${dupIngredients.reduce((s, g) => s + g.length, 0)} ingredient(s) involved`);
  console.log(`Dangling genericParent reference: ${trueDanglingGenericParent.length}`);
  if (trueDanglingGenericParent.length) {
    for (const i of trueDanglingGenericParent) {
      console.log(`  - "${i.name}"  (id ${i._id}, points at missing generic ${i.genericParent})`);
    }
  }
  if (noBarcode.length) {
    console.log(`\n  No barcode:`);
    for (const i of noBarcode) console.log(`  - "${i.name}"  (id ${i._id}${i.brand ? ", branded" : ""})`);
  }
  if (dupIngredients.length) {
    console.log(`\n  Duplicate name groups:`);
    for (const group of dupIngredients) {
      console.log(`  - "${group[0].name}":`);
      for (const i of group) {
        console.log(`      id ${i._id}  isGeneric=${i.isGeneric}  brand=${i.brand ?? "none"}  archived=${i.isArchived}`);
      }
    }
  }
  console.log();

  // ── Recipes ──────────────────────────────────────────────────────────────
  const recipes = await Recipe.find().populate("ingredientList.ingredient", "name isArchived");
  const activeRecipes = recipes.filter(r => !r.isArchived);
  const archivedRecipes = recipes.filter(r => r.isArchived);

  const noRecipeNutrition = activeRecipes.filter(r => hasNoNutrition(r.nutrition));
  const emptyIngredientList = activeRecipes.filter(r => (r.ingredientList?.length ?? 0) === 0);
  const noInstructions = activeRecipes.filter(r => (r.instructions?.length ?? 0) === 0);
  const dupRecipes = groupDuplicates(activeRecipes, r => r.name);
  const danglingRecipeIngredients = activeRecipes.filter(r =>
    (r.ingredientList ?? []).some(entry => entry.ingredient == null),
  );
  const unconfirmedRecipes = activeRecipes.filter(r => !r.isConfirmed);

  console.log("═══ RECIPES ═══");
  console.log(`Total: ${recipes.length}  (active: ${activeRecipes.length}, archived: ${archivedRecipes.length})`);
  console.log(`Missing all nutrition data: ${noRecipeNutrition.length}`);
  console.log(`Empty ingredient list: ${emptyIngredientList.length}`);
  console.log(`No instructions: ${noInstructions.length}`);
  console.log(`References a deleted ingredient: ${danglingRecipeIngredients.length}`);
  console.log(`Possible duplicate names: ${dupRecipes.length} group(s), ${dupRecipes.reduce((s, g) => s + g.length, 0)} recipe(s) involved`);
  console.log(`Still marked "want to try" (isConfirmed: false): ${unconfirmedRecipes.length}`);
  if (noInstructions.length) {
    console.log(`\n  No instructions:`);
    for (const r of noInstructions) console.log(`  - "${r.name}"  (id ${r._id})`);
  }
  console.log();

  // ── Meals ────────────────────────────────────────────────────────────────
  const meals = await Meal.find().populate("courses.recipe", "name isArchived").populate("bentoLayout.sections.recipe", "name isArchived");
  const activeMeals = meals.filter(m => !m.isArchived);
  const archivedMeals = meals.filter(m => m.isArchived);

  const emptyCourseMeals = activeMeals.filter(m => m.type === "course" && (m.courses?.length ?? 0) === 0);
  // populate() nulls out an unresolved ref, but a course can also
  // legitimately have no recipe set — so dangling refs are checked against
  // raw ids instead of trusting the populated null.
  const rawMeals = await Meal.find({ isArchived: false }, "courses bentoLayout name").lean();
  const recipeIdSet = new Set((await Recipe.find({}, "_id").lean()).map(r => String(r._id)));
  const mealsWithDanglingRecipe = rawMeals.filter(m => {
    const courseIds = (m.courses ?? []).map(c => c.recipe).filter(Boolean);
    const bentoIds = (m.bentoLayout?.sections ?? []).map(s => s.recipe).filter(Boolean);
    return [...courseIds, ...bentoIds].some(id => !recipeIdSet.has(String(id)));
  });
  const dupMeals = groupDuplicates(activeMeals, m => m.name);

  console.log("═══ MEALS ═══");
  console.log(`Total: ${meals.length}  (active: ${activeMeals.length}, archived: ${archivedMeals.length})`);
  console.log(`Course-type with no courses: ${emptyCourseMeals.length}`);
  console.log(`References a deleted recipe: ${mealsWithDanglingRecipe.length}`);
  console.log(`Possible duplicate names: ${dupMeals.length} group(s), ${dupMeals.reduce((s, g) => s + g.length, 0)} meal(s) involved`);
  console.log();

  // ── Planner entries ─────────────────────────────────────────────────────
  const entries = await MealPlanEntry.find()
    .populate("recipe", "name")
    .populate("ingredient", "name")
    .populate("meal", "name")
    .populate("restaurantMeal", "restaurantName");
  const activeEntries = entries.filter(e => !e.isArchived);
  const archivedEntries = entries.filter(e => e.isArchived);

  const today = todayStr();
  const stalePlanned = activeEntries.filter(e => e.status === "planned" && e.date < today);
  const futureEntries = activeEntries.filter(e => e.date > today);
  const todayEntries = activeEntries.filter(e => e.date === today);
  const pastConfirmed = activeEntries.filter(e => e.status === "confirmed" && e.date <= today);

  // Schema validation guarantees exactly one of these four was set at save
  // time — so after population, an entry with none of them resolved means
  // whichever one it was pointed at a doc that's since been hard-deleted.
  const danglingEntries = activeEntries.filter(e => !e.recipe && !e.ingredient && !e.meal && !e.restaurantMeal);

  console.log("═══ PLANNER ENTRIES ═══");
  console.log(`Total: ${entries.length}  (active: ${activeEntries.length}, archived: ${archivedEntries.length})`);
  console.log(`Past date, still "planned" (never confirmed or discarded): ${stalePlanned.length}`);
  console.log(`Today: ${todayEntries.length}   Future: ${futureEntries.length}   Past & confirmed: ${pastConfirmed.length}`);
  console.log(`References a deleted meal/recipe/ingredient/restaurant meal: ${danglingEntries.length}`);
  if (stalePlanned.length) {
    console.log(`\n  Past-dated, still "planned":`);
    for (const e of stalePlanned) {
      const ref = e.recipe ? `recipe "${e.recipe.name}"` : e.ingredient ? `ingredient "${e.ingredient.name}"` : e.meal ? `meal "${e.meal.name}"` : `restaurant visit "${e.restaurantMeal?.restaurantName}"`;
      console.log(`  - ${e.date} ${e.slot}  (id ${e._id}, ${ref})`);
    }
  }
  if (pastConfirmed.length) {
    console.log(`\n  Past & confirmed (already logged as eaten):`);
    for (const e of pastConfirmed) {
      const ref = e.recipe ? `recipe "${e.recipe.name}"` : e.ingredient ? `ingredient "${e.ingredient.name}"` : e.meal ? `meal "${e.meal.name}"` : `restaurant visit "${e.restaurantMeal?.restaurantName}"`;
      console.log(`  - ${e.date} ${e.slot}  (id ${e._id}, ${ref})`);
    }
  }
  console.log();

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
