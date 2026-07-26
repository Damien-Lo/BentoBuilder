/**
 * Permanently deletes every Ingredient and PantryItem from the database.
 *
 * Safety checks before deleting anything:
 *   - Requires ingredients_export.json and pantry_items_export.json to
 *     already exist next to this script (see export_ingredients.js /
 *     export_pantry_items.js).
 *   - Aborts if either backup's record count doesn't match what's
 *     currently live in the DB (re-run the exports first if it doesn't).
 *   - Asks for interactive confirmation unless --force is passed.
 *
 * Note: Recipes are NOT deleted or touched. Any recipe.ingredientList
 * entries pointing at deleted ingredients will be left dangling.
 *
 * Connects directly to MongoDB via MONGODB_URI (server/.env) — the API
 * server does not need to be running.
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/delete_ingredients_and_pantry.js [--force]
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

import Ingredient from "../../models/Ingredient.js";
import PantryItem from "../../models/PantryItem.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORCE = process.argv.includes("--force");

function confirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function loadBackup(label, fileName, liveCount) {
  const backupPath = path.join(__dirname, fileName);

  if (!fs.existsSync(backupPath)) {
    throw new Error(
      `No backup found at ${backupPath} — export ${label} before deleting.`,
    );
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, "utf-8"));

  if (backup.length !== liveCount) {
    throw new Error(
      `Backup for ${label} has ${backup.length} record(s) but the DB currently ` +
        `has ${liveCount} — re-run the export before deleting.`,
    );
  }
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from server/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB (${mongoose.connection.name})`);

  const ingredientCount = await Ingredient.countDocuments({});
  const pantryCount = await PantryItem.countDocuments({});

  console.log(
    `This will permanently delete ${ingredientCount} ingredient(s) and ${pantryCount} pantry item(s).`,
  );

  loadBackup("ingredients", "ingredients_export.json", ingredientCount);
  loadBackup("pantry items", "pantry_items_export.json", pantryCount);

  console.log("Backups verified — counts match.");

  if (!FORCE) {
    const answer = await confirm(
      'Type "DELETE" to permanently remove all ingredients and pantry items: ',
    );

    if (answer !== "DELETE") {
      console.log("Aborted — no changes made.");
      await mongoose.disconnect();
      return;
    }
  }

  const pantryResult = await PantryItem.deleteMany({});
  const ingredientResult = await Ingredient.deleteMany({});

  console.log(`Deleted ${pantryResult.deletedCount} pantry item(s).`);
  console.log(`Deleted ${ingredientResult.deletedCount} ingredient(s).`);

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Delete failed:", error.message);
  process.exit(1);
});
