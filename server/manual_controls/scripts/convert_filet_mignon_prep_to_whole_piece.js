// Follow-up to convert_to_whole_piece.js: "Sous Vide Filet Mignon Prep"
// consumes raw Filet Mignon at an exact 331g to produce 1 "bag" of
// Vacuum-Sealed Filet Mignon - the "bag" unit downstream is already a
// non-splittable discrete unit (fine as-is), but this upstream raw-meat
// line has the exact same "bought as one irregular piece" problem the
// salmon/tuna conversions were built for, just one production-step
// removed. Caught by the user after the first conversion pass.
//
// pantryDeduction.ts's production-substitution path (expandProduced-
// IngredientRows) already builds this recipe's own rows generically via
// recipeLineToRow, so converting this line needs no new code - purely a
// data change, same as convert_to_whole_piece.js.
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import Recipe from "../../models/Recipe.js";
import { calcNutrition, nutritionChanged, syncProducedIngredientNutrition } from "../../services/recipeNutrition.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const RECIPE_NAME = "Sous Vide Filet Mignon Prep";
const INGREDIENT_NAME = "Filet Mignon";
// Was a flat 331g - typical individual filet mignon steaks run roughly
// 200-400g (7-14 oz) at retail; centered close to the prior value so the
// snapshot nutrition estimate doesn't jump much.
const MIN_WEIGHT = 250;
const MAX_WEIGHT = 400;
const WEIGHT_UNIT = "g";
const DISPLAY_UNIT = "steak";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name}`);

  const recipe = await Recipe.findOne({ name: RECIPE_NAME }).populate({
    path: "ingredientList.ingredient",
    populate: [{ path: "genericParent" }],
  });
  if (!recipe) {
    console.error(`Recipe "${RECIPE_NAME}" not found`);
    process.exit(1);
  }

  const backupPath = path.join(__dirname, "../seeds/recipe_filet_mignon_prep_backup.json");
  fs.writeFileSync(backupPath, JSON.stringify(recipe.toObject(), null, 2));
  console.log(`Backed up "${recipe.name}" to ${backupPath}`);

  const entry = recipe.ingredientList.find(
    (e) => e.ingredient && e.ingredient.name === INGREDIENT_NAME,
  );
  if (!entry) {
    console.error(`"${RECIPE_NAME}" has no "${INGREDIENT_NAME}" ingredient line`);
    process.exit(1);
  }

  const before = { quantity: entry.quantity, unit: entry.unit };
  entry.quantity = 1;
  entry.unit = DISPLAY_UNIT;
  entry.matchMode = "wholePiece";
  entry.pieceMinWeight = MIN_WEIGHT;
  entry.pieceMaxWeight = MAX_WEIGHT;
  entry.pieceWeightUnit = WEIGHT_UNIT;

  const nutrition = await calcNutrition(recipe);
  if (nutritionChanged(recipe.nutrition, nutrition)) {
    recipe.nutrition = nutrition;
  }

  await recipe.save();
  // This recipe produces "Vacuum-Sealed Filet Mignon" (Ingredient.
  // productionRecipe points back here) - its own cached nutrition is kept
  // permanently synced to this recipe's, same as the real route does on
  // every save. Skipped by a raw script otherwise, leaving it stale.
  await syncProducedIngredientNutrition(recipe, nutrition);

  console.log(
    `Converted "${RECIPE_NAME}" — ${INGREDIENT_NAME}: ${before.quantity}${before.unit} -> ` +
    `1 ${DISPLAY_UNIT} (${MIN_WEIGHT}-${MAX_WEIGHT}${WEIGHT_UNIT} each, whole)`,
  );
  console.log(`Recomputed nutrition:`, recipe.nutrition);
  console.log(`Synced produced ingredient (Vacuum-Sealed Filet Mignon) nutrition too.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
