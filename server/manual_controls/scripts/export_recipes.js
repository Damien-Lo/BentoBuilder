/**
 * Backfill `scores: []` onto any recipe saved before the scoring feature
 * existed (so the field is actually persisted, not just applied at read
 * time via the schema default), then export every recipe to a JSON file so
 * the backfill can be spot-checked and the data hand-edited/re-imported
 * later if needed.
 *
 * Connects directly to MongoDB via MONGODB_URI (server/.env) — the API
 * server does not need to be running.
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/export_recipes.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Recipe from "../../models/Recipe.js";
import "../../models/RecipeCategory.js";
import "../../models/Ingredient.js";
import "../../models/IngredientCategory.js";
import "../../models/Brand.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "recipes_export.json");

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from server/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB (${mongoose.connection.name})`);

  const backfillResult = await Recipe.updateMany(
    { scores: { $exists: false } },
    { $set: { scores: [] } },
  );
  console.log(`Backfilled scores on ${backfillResult.modifiedCount} recipe(s).`);

  // Includes archived recipes so a later reset doesn't silently drop them.
  const recipes = await Recipe.find({})
    .populate("recipeCategory")
    .populate({
      path: "ingredientList.ingredient",
      populate: [{ path: "category" }, { path: "brand" }],
    })
    .sort({ name: 1 });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(recipes, null, 2));

  console.log(`Wrote ${recipes.length} recipe(s) to ${OUTPUT_PATH}`);

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Export failed:", error);
  process.exit(1);
});
