// One-time fix: recompute every recipe's stored nutrition from its current
// ingredients. Recipe nutrition is a snapshot taken at save time — any
// recipe created or edited before its ingredients had nutrition data (or
// before an ingredient's nutrition was later corrected) is stuck showing
// stale numbers until it's recomputed. GET /api/recipes/:id now self-heals
// this going forward; this script fixes everything that's already stale.
//
// Run once by hand: node manual_controls/scripts/backfill_recipe_nutrition.js
import "dotenv/config";
import mongoose from "mongoose";
import Recipe from "../../models/Recipe.js";
// Populate()'d sub-paths (ingredientList.ingredient.category/.brand/.genericParent)
// need their models registered even though they're never referenced by name below.
import "../../models/Ingredient.js";
import "../../models/IngredientCategory.js";
import "../../models/Brand.js";
import { calcNutrition, nutritionChanged, syncProducedIngredientNutrition } from "../../services/recipeNutrition.js";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const recipes = await Recipe.find({}).populate({
    path: "ingredientList.ingredient",
    populate: [{ path: "category" }, { path: "brand" }, { path: "genericParent" }],
  });

  let changed = 0;
  let unchanged = 0;

  for (const recipe of recipes) {
    const nutrition = await calcNutrition(recipe);
    if (nutritionChanged(recipe.nutrition, nutrition)) {
      const before = recipe.nutrition;
      recipe.nutrition = nutrition;
      await recipe.save();
      await syncProducedIngredientNutrition(recipe, nutrition);
      changed++;
      console.log(`Updated "${recipe.name}": ${JSON.stringify(before)} -> ${JSON.stringify(nutrition)}`);
    } else {
      unchanged++;
    }
  }

  console.log(`\nRecomputed ${recipes.length} recipe(s): ${changed} updated, ${unchanged} already accurate.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
