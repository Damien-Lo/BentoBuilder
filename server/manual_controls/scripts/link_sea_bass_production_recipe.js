// Follow-up to convert_sea_bass_prep_to_whole_piece.js: converting the raw
// Chilean Sea Bass line to wholePiece matching is unreachable in practice
// without this - "Vacuum-Sealed Miso Chilean Sea Bass" (what the consumer-
// facing "Sous Vide Seared Miso Chilean Sea Bass" recipe actually consumes,
// "1 bag") had productionRecipe: null, unlike its Filet Mignon equivalent.
// Without that link, pantryDeduction.ts's production-substitution path
// (expandProducedIngredientRows) never expands a shortfall of the bag into
// this Prep recipe's raw ingredients - so with no pre-made bag in pantry
// (the common case - nobody manually stocks "vacuum sealed" bags), the
// seared recipe's "1 bag" requirement just stayed a plain quantity-mode
// line with 0 pantry stock, silently deducting nothing and contributing NO
// nutrition for the fish at all, with no weight prompt ever reached. Caught
// live: adding the seared dish to the planner didn't ask for a weight the
// way Filet Mignon does.
//
// Sets Ingredient.productionRecipe to the Prep recipe's _id (same shape as
// Vacuum-Sealed Filet Mignon -> Sous Vide Filet Mignon Prep), then syncs
// the produced ingredient's cached nutrition to the Prep recipe's own
// (already correct, wholePiece-aware) computed nutrition - it was stale
// (240 cal/1 bag) since nothing ever kept it in sync before this link
// existed.
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import Recipe from "../../models/Recipe.js";
import Ingredient from "../../models/Ingredient.js";
import { syncProducedIngredientNutrition } from "../../services/recipeNutrition.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const RECIPE_NAME = "Sous Vide Miso Chilean Sea Bass Prep";
const INGREDIENT_NAME = "Vacuum-Sealed Miso Chilean Sea Bass";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name}`);

  const recipe = await Recipe.findOne({ name: RECIPE_NAME });
  if (!recipe) {
    console.error(`Recipe "${RECIPE_NAME}" not found`);
    process.exit(1);
  }

  const ingredient = await Ingredient.findOne({ name: INGREDIENT_NAME });
  if (!ingredient) {
    console.error(`Ingredient "${INGREDIENT_NAME}" not found`);
    process.exit(1);
  }

  const backupPath = path.join(__dirname, "../seeds/ingredient_vacuum_sealed_sea_bass_backup.json");
  fs.writeFileSync(backupPath, JSON.stringify(ingredient.toObject(), null, 2));
  console.log(`Backed up "${ingredient.name}" to ${backupPath}`);

  ingredient.productionRecipe = recipe._id;
  await ingredient.save();
  console.log(`Set "${INGREDIENT_NAME}".productionRecipe = "${RECIPE_NAME}" (${recipe._id})`);

  await syncProducedIngredientNutrition(recipe, recipe.nutrition);
  console.log(`Synced "${INGREDIENT_NAME}" nutrition to recipe's own:`, recipe.nutrition);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
