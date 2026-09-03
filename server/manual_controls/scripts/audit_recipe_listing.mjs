// Read-only — dumps every active recipe grouped by category, plus a
// never-used check that automated field checks in audit_data_overview.mjs
// can't catch (a recipe can have complete data and still never actually
// have been cooked or planned). Run with:
//   node manual_controls/scripts/audit_recipe_listing.mjs
import mongoose from "mongoose";
import dotenv from "dotenv";

import Recipe from "../../models/Recipe.js";
import RecipeCategory from "../../models/RecipeCategory.js";
import Meal from "../../models/Meal.js";
import MealPlanEntry from "../../models/MealPlanEntry.js";
import "../../models/Ingredient.js";
import "../../models/Tag.js";

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const categories = await RecipeCategory.find().sort({ name: 1 });
  const recipes = await Recipe.find({ isArchived: false })
    .populate("recipeCategory", "name")
    .populate("tags", "name")
    .sort({ name: 1 });

  // Usage evidence: referenced by any Meal (course or bento section), or by
  // any MealPlanEntry ever (including archived — proof it was actually
  // planned/cooked at some point, distinct from the manual isConfirmed flag).
  const meals = await Meal.find({}, "courses bentoLayout").lean();
  const usedInMeal = new Set();
  for (const m of meals) {
    for (const c of m.courses ?? []) if (c.recipe) usedInMeal.add(String(c.recipe));
    for (const s of m.bentoLayout?.sections ?? []) if (s.recipe) usedInMeal.add(String(s.recipe));
  }
  const usedInPlanner = new Set(
    (await MealPlanEntry.find({ recipe: { $ne: null } }, "recipe").lean()).map(e => String(e.recipe)),
  );

  const byCategory = new Map(categories.map(c => [String(c._id), []]));
  const uncategorized = [];
  for (const r of recipes) {
    const key = r.recipeCategory ? String(r.recipeCategory._id) : null;
    if (key && byCategory.has(key)) byCategory.get(key).push(r);
    else uncategorized.push(r);
  }

  function printRecipe(r) {
    const flags = [];
    if ((r.instructions?.length ?? 0) === 0) flags.push("no instructions");
    if (!r.mealCategory?.length) flags.push("no meal category (breakfast/lunch/etc)");
    if (!r.imageUrl) flags.push("no image");
    if (!r.isConfirmed) flags.push("want to try");
    if (!usedInMeal.has(String(r._id)) && !usedInPlanner.has(String(r._id))) flags.push("never used in a meal or plan");
    const ingCount = r.ingredientList?.length ?? 0;
    console.log(`  - ${r.name}  [${ingCount} ingredient(s), ${r.servings} serving(s)]${flags.length ? "  ⚑ " + flags.join(", ") : ""}`);
  }

  for (const cat of categories) {
    const items = byCategory.get(String(cat._id));
    if (!items.length) continue;
    console.log(`\n── ${cat.name} (${items.length}) ──`);
    for (const r of items) printRecipe(r);
  }
  if (uncategorized.length) {
    console.log(`\n── (no category) (${uncategorized.length}) ──`);
    for (const r of uncategorized) printRecipe(r);
  }

  console.log(`\n\nCategories with zero active recipes:`);
  for (const cat of categories) {
    if (!byCategory.get(String(cat._id)).length) console.log(`  - ${cat.name}`);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
