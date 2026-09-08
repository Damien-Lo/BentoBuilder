// One-time data migration: converts the ingredient lines that genuinely
// represent "one whole real-world piece" (not a measured/bulk amount) from
// exact-gram matching to the new "wholePiece" matchMode, now that
// pantryDeduction.ts supports it. Picked after an explicit back-and-forth
// with the user about which recipes actually qualify - see the session
// transcript, not guessed from ingredient names alone.
//
// Converted:
//  - Pan-Fried Salmon Fillet: Salmon Fillet, was 100g exact
//  - Grilled Salmon Fillet: Salmon Fillet, was 126g exact
//  - Tuna Tataki: Tuna Steak, was 300g exact
//
// Each becomes quantity: 1 whole piece, with a weight range centered
// loosely around the recipe's own prior gram value but wide enough to
// cover realistic real-world variance in one retail-cut piece - these are
// starting points, not a precise measurement, and worth adjusting once
// real pantry pieces are weighed against them.
//
// Backs up the 3 affected recipes' pre-migration documents first. Goes
// through the Mongoose model (not the raw driver) so the schema's
// wholePiece validation actually runs, and recomputes+persists the
// recipe's cached nutrition snapshot afterward (calcNutrition's own
// wholePiece branch) rather than leaving it to the next GET's self-heal.
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import Recipe from "../../models/Recipe.js";
import { calcNutrition, nutritionChanged } from "../../services/recipeNutrition.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const CONVERSIONS = [
  { recipeName: "Pan-Fried Salmon Fillet", ingredientName: "Salmon Fillet", min: 100, max: 200, unit: "g", displayUnit: "fillet" },
  { recipeName: "Grilled Salmon Fillet", ingredientName: "Salmon Fillet", min: 100, max: 200, unit: "g", displayUnit: "fillet" },
  { recipeName: "Tuna Tataki", ingredientName: "Tuna Steak", min: 250, max: 350, unit: "g", displayUnit: "steak" },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name}`);

  const recipes = await Recipe.find({ name: { $in: CONVERSIONS.map((c) => c.recipeName) } }).populate({
    path: "ingredientList.ingredient",
    populate: [{ path: "genericParent" }],
  });

  const backup = recipes.map((r) => r.toObject());
  const backupPath = path.join(__dirname, "../seeds/recipes_whole_piece_backup.json");
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backed up ${backup.length} recipe(s) to ${backupPath}`);

  for (const conv of CONVERSIONS) {
    const recipe = recipes.find((r) => r.name === conv.recipeName);
    if (!recipe) {
      console.warn(`SKIP: recipe "${conv.recipeName}" not found`);
      continue;
    }
    const entry = recipe.ingredientList.find(
      (e) => e.ingredient && e.ingredient.name === conv.ingredientName,
    );
    if (!entry) {
      console.warn(`SKIP: "${conv.recipeName}" has no "${conv.ingredientName}" ingredient line`);
      continue;
    }

    const before = { quantity: entry.quantity, unit: entry.unit };
    entry.quantity = 1;
    entry.unit = conv.displayUnit;
    entry.matchMode = "wholePiece";
    entry.pieceMinWeight = conv.min;
    entry.pieceMaxWeight = conv.max;
    entry.pieceWeightUnit = conv.unit;

    const nutrition = await calcNutrition(recipe);
    if (nutritionChanged(recipe.nutrition, nutrition)) {
      recipe.nutrition = nutrition;
    }

    await recipe.save();
    console.log(
      `Converted "${conv.recipeName}" — ${conv.ingredientName}: ` +
      `${before.quantity}${before.unit} -> 1 ${conv.displayUnit} (${conv.min}-${conv.max}${conv.unit} each, whole)`,
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
