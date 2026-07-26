/**
 * Export every pantry item in the database to a JSON file so it can be
 * hand-edited and later re-imported to reset the DB.
 *
 * Connects directly to MongoDB via MONGODB_URI (server/.env) — the API
 * server does not need to be running.
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/export_pantry_items.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import PantryItem from "../../models/PantryItem.js";
import "../../models/Ingredient.js";
import "../../models/IngredientCategory.js";
import "../../models/Brand.js";
import "../../models/StorageLocation.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "pantry_items_export.json");

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from server/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB (${mongoose.connection.name})`);

  // Includes finished items so a later reset doesn't silently drop them.
  const pantryItems = await PantryItem.find({})
    .populate({
      path: "ingredient",
      populate: [
        { path: "category" },
        { path: "brand" },
        { path: "genericParent" },
      ],
    })
    .populate("storageLocation")
    .sort({ createdAt: 1 });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(pantryItems, null, 2));

  console.log(`Wrote ${pantryItems.length} pantry item(s) to ${OUTPUT_PATH}`);

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Export failed:", error);
  process.exit(1);
});
