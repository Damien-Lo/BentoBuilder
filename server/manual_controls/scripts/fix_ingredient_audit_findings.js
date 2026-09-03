// One-time cleanup from the ingredient data audit (see chat/PR history for
// the full findings). Every item here was individually investigated first —
// cross-references checked, units confirmed compatible — this is not a
// blind bulk operation. Run once by hand:
//   node manual_controls/scripts/fix_ingredient_audit_findings.js
import "dotenv/config";
import mongoose from "mongoose";
import Ingredient from "../../models/Ingredient.js";
import Recipe from "../../models/Recipe.js";
import "../../models/IngredientCategory.js";
import "../../models/Brand.js";
import { calcNutrition, syncProducedIngredientNutrition } from "../../services/recipeNutrition.js";

// Archived, zero-referenced junk with a broken genericParent link — dead
// weight, safe to hard-delete outright.
const DELETE_UNREFERENCED = [
  "6a6806bb321e34540b333845", // Hart Peach
  "6a68073a25be1fa8f50016f4", // Hart Peach (2nd copy)
  "6a68078e25be1fa8f50016f8", // Hmart Peach
  "6a68d38b4e0143a1114752fd", // Japanese peach
  "6a6ab45ebed510a8ab40a22b", // Test Ingredient 1
  "6a6ab487bed510a8ab40a22e", // Test Ingredient 2
];

// The zero-reference half of the "Green Grapes" duplicate pair — the other
// copy (with the real pantry entry) survives.
const DELETE_DUPLICATE_GREEN_GRAPES = "6a8fa5b311f67222a9d90765";

const SLICED_CHEDDAR_ID = "6a6b918ebed510a8ab40a24e";
const CHEDDAR_CHEESE_GENERIC_ID = "6a70b817121d0b38050808cf";

const SESAME_SEEDS_ID = "6a70b81e121d0b38050808f0";
const WHITE_SESAME_SEEDS_ID = "6a691e9b0f94cb20253ba712";
const SESAME_SEEDS_RECIPE_NAMES = ["Crispy Rice Paper Shrimp Pops", "Rice Paper Shrimp Pancake"];

const NORI_ID = "6a70b820121d0b38050808f8";
const NORI_SHEETS_ID = "6a68178425be1fa8f5001721";
const NORI_RECIPE_NAMES = ["Cold Udon (Zaru Udon)", "Cold Soba (Zaru Soba)"];

const RENAMES = [
  ["Chili oil with fermented soybeans", "Chili Oil with Fermented Soybeans"],
  ["Premium oyster sauce", "Premium Oyster Sauce"],
  ["Squid Brand fish sauce", "Squid Brand Fish Sauce"],
  ["Roasted sesame seed", "Roasted Sesame Seed"],
];

// Swaps every ingredientList entry pointing at `fromId` to `toId` across the
// named recipes, then recomputes and saves that recipe's nutrition through
// the app's own calcNutrition — never hand-computed, so it can't drift from
// what the real API would have produced.
async function swapIngredientInRecipes(recipeNames, fromId, toId) {
  const recipes = await Recipe.find({ name: { $in: recipeNames } });
  for (const recipe of recipes) {
    let touched = false;
    for (const entry of recipe.ingredientList) {
      if (String(entry.ingredient) === fromId) {
        entry.ingredient = toId;
        touched = true;
      }
    }
    if (!touched) continue;
    await recipe.populate({
      path: "ingredientList.ingredient",
      populate: [{ path: "category" }, { path: "brand" }, { path: "genericParent" }],
    });
    const before = recipe.nutrition;
    const nutrition = await calcNutrition(recipe);
    recipe.nutrition = nutrition;
    await recipe.save();
    await syncProducedIngredientNutrition(recipe, nutrition);
    console.log(`  Updated "${recipe.name}" nutrition: ${JSON.stringify(before)} -> ${JSON.stringify(nutrition)}`);
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log("Deleting archived, zero-reference junk ingredients...");
  const delRes = await Ingredient.deleteMany({ _id: { $in: DELETE_UNREFERENCED } });
  console.log(`  Deleted ${delRes.deletedCount}/${DELETE_UNREFERENCED.length}`);

  console.log('Deleting duplicate "Green Grapes" (unreferenced copy)...');
  await Ingredient.deleteOne({ _id: DELETE_DUPLICATE_GREEN_GRAPES });

  console.log('Relinking "Sliced Cheddar Cheese" -> "Cheddar Cheese" generic...');
  await Ingredient.updateOne({ _id: SLICED_CHEDDAR_ID }, { $set: { genericParent: CHEDDAR_CHEESE_GENERIC_ID } });

  console.log('Merging "Sesame Seeds" into "White Sesame Seeds"...');
  await swapIngredientInRecipes(SESAME_SEEDS_RECIPE_NAMES, SESAME_SEEDS_ID, WHITE_SESAME_SEEDS_ID);
  await Ingredient.deleteOne({ _id: SESAME_SEEDS_ID });

  console.log('Merging "Nori" into "Nori Sheets"...');
  await swapIngredientInRecipes(NORI_RECIPE_NAMES, NORI_ID, NORI_SHEETS_ID);
  await Ingredient.deleteOne({ _id: NORI_ID });

  console.log("Fixing name casing...");
  for (const [from, to] of RENAMES) {
    const res = await Ingredient.updateOne({ name: from }, { $set: { name: to } });
    console.log(`  "${from}" -> "${to}"  (matched ${res.matchedCount})`);
  }

  console.log("\nDone.");
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
