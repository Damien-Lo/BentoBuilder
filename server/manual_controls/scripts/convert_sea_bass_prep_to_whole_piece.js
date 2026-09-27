// Follow-up to convert_to_whole_piece.js / convert_filet_mignon_prep_to_
// whole_piece.js: "Sous Vide Miso Chilean Sea Bass Prep" still consumed raw
// Chilean Sea Bass at an exact 226g - the same "bought as one irregular
// piece" case the salmon/tuna/filet mignon conversions were built for, just
// never revisited for this recipe (flagged in TODO.md, not caught earlier).
//
// Also sets Ingredient.pieceLabel ("fillet") on the raw Chilean Sea Bass
// ingredient itself, which the earlier conversions left set some other way
// (likely a manual edit) rather than via script - without it, the pantry
// list can't show a piece count for this ingredient the way it does for
// Salmon Fillet/Filet Mignon/Tuna Steak.
//
// Unlike the Filet Mignon Prep follow-up, "Vacuum-Sealed Miso Chilean Sea
// Bass" (the ingredient the downstream "Sous Vide Seared Miso Chilean Sea
// Bass" recipe consumes) has productionRecipe: null - it is NOT linked back
// to this Prep recipe the way Vacuum-Sealed Filet Mignon is. That means
// pantryDeduction.ts's production-substitution path won't auto-expand a
// shortfall of it into this Prep recipe's raw ingredients today. That's a
// separate, pre-existing gap this script does not fix - flagged, not
// addressed, since it's a different problem (a missing link) from the one
// asked for here (wholePiece matching on the raw fish).
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import Recipe from "../../models/Recipe.js";
import Ingredient from "../../models/Ingredient.js";
import { calcNutrition, nutritionChanged } from "../../services/recipeNutrition.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const RECIPE_NAME = "Sous Vide Miso Chilean Sea Bass Prep";
const INGREDIENT_NAME = "Chilean Sea Bass";
// Was a flat 226g - Chilean sea bass fillets commonly run 170-280g (roughly
// 6-10oz) at retail; centered near the prior value so the recomputed
// nutrition snapshot doesn't jump much.
const MIN_WEIGHT = 170;
const MAX_WEIGHT = 280;
const WEIGHT_UNIT = "g";
const DISPLAY_UNIT = "fillet";
const PIECE_LABEL = "fillet";

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

  const backupPath = path.join(__dirname, "../seeds/recipe_sea_bass_prep_backup.json");
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
  console.log(
    `Converted "${RECIPE_NAME}" — ${INGREDIENT_NAME}: ${before.quantity}${before.unit} -> ` +
    `1 ${DISPLAY_UNIT} (${MIN_WEIGHT}-${MAX_WEIGHT}${WEIGHT_UNIT} each, whole)`,
  );
  console.log(`Recomputed nutrition:`, recipe.nutrition);

  const rawIngredient = await Ingredient.findOne({ name: INGREDIENT_NAME });
  if (rawIngredient && rawIngredient.pieceLabel !== PIECE_LABEL) {
    rawIngredient.pieceLabel = PIECE_LABEL;
    await rawIngredient.save();
    console.log(`Set Ingredient "${INGREDIENT_NAME}".pieceLabel = "${PIECE_LABEL}"`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
