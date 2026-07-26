/**
 * Export every ingredient in the database to a JSON file so it can be
 * hand-edited (e.g. adding isGeneric / genericParent relationships) and
 * later re-imported to reset the DB.
 *
 * Connects directly to MongoDB via MONGODB_URI (server/.env) — the API
 * server does not need to be running.
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/export_ingredients.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Ingredient from "../../models/Ingredient.js";
import "../../models/IngredientCategory.js";
import "../../models/Brand.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "ingredients_export.json");

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from server/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB (${mongoose.connection.name})`);

  // Includes archived ingredients so a later reset doesn't silently drop them.
  // Not using .lean() here so hydrated schema defaults (isGeneric: false,
  // genericParent: null, etc.) show up explicitly on older records that
  // predate those fields — makes them easier to spot and edit.
  const ingredients = await Ingredient.find({})
    .populate("category")
    .populate("brand")
    .populate("genericParent")
    .sort({ name: 1 });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(ingredients, null, 2));

  console.log(`Wrote ${ingredients.length} ingredient(s) to ${OUTPUT_PATH}`);

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Export failed:", error);
  process.exit(1);
});
