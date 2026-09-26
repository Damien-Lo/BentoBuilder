/**
 * One-time backfill: fills the 11 extended nutrient fields (sugar, fat
 * breakdown, cholesterol, potassium, vitamins A/C, calcium, iron) on every
 * catalog ingredient that existed before extended tracking.
 *
 * Values come from manual_controls/seed_data/extended_nutrients_backfill.json,
 * generated per ingredient from:
 *   - Open Food Facts label data (by barcode) where it looked trustworthy;
 *   - otherwise typical per-100 g composition (USDA-style) for the matching
 *     generic food, scaled to the serving the ingredient's *stored* core
 *     values describe. Sugar and the fat breakdown are scaled from the
 *     ingredient's own stored carbs/fat, so they never exceed them.
 * Each row's `basis` records which reference food and serving weight was
 * used.
 *
 * Only fills fields that are still null/absent — never overwrites a value
 * that's already there (e.g. one entered by hand or from a barcode scan),
 * and never touches the core 6. Ingredients produced by a recipe are not in
 * the file; they get their values from the recipe (run
 * backfill_recipe_nutrition.js afterwards).
 *
 * Writes a backup of every affected ingredient's current nutrition to
 * manual_controls/seeds/ingredients_extended_nutrients_backup.json first
 * (skipped if that file already exists, so a re-run can't clobber the
 * original backup).
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/backfill_extended_nutrients.js [--dry-run]
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import Ingredient from "../../models/Ingredient.js";
import { EXTENDED_NUTRITION_FIELD_NAMES } from "../../models/nutritionSchema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "seed_data", "extended_nutrients_backfill.json");
const BACKUP_PATH = path.join(__dirname, "..", "seeds", "ingredients_extended_nutrients_backup.json");

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const rows = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  await mongoose.connect(process.env.MONGODB_URI);

  const ids = rows.map((r) => r._id);
  const current = await Ingredient.find({ _id: { $in: ids } }).select("name nutrition").lean();
  const byId = new Map(current.map((i) => [String(i._id), i]));

  if (!dryRun && !fs.existsSync(BACKUP_PATH)) {
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(current, null, 2));
    console.log(`Backed up ${current.length} ingredient(s) to ${BACKUP_PATH}`);
  }

  const ops = [];
  let fieldsSet = 0;
  let missing = 0;
  for (const row of rows) {
    const ingredient = byId.get(row._id);
    if (!ingredient) {
      missing++;
      console.log(`Skipping "${row.name}" — no longer exists`);
      continue;
    }
    const $set = {};
    for (const field of EXTENDED_NUTRITION_FIELD_NAMES) {
      const value = row.values[field];
      const existing = ingredient.nutrition?.[field];
      if (value == null || existing != null) continue;
      $set[`nutrition.${field}`] = value;
    }
    const count = Object.keys($set).length;
    if (count === 0) continue;
    fieldsSet += count;
    ops.push({ updateOne: { filter: { _id: ingredient._id }, update: { $set } } });
  }

  console.log(`${ops.length} ingredient(s) to update, ${fieldsSet} field(s) total${missing ? `, ${missing} missing` : ""}.`);
  if (dryRun) {
    console.log("Dry run — nothing written.");
  } else if (ops.length > 0) {
    const result = await Ingredient.bulkWrite(ops);
    console.log(`Updated ${result.modifiedCount} ingredient(s).`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
