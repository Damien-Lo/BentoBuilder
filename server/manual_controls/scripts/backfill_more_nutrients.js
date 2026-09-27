/**
 * One-time backfill for the second round of extended nutrients (added
 * sugar, omega-3 EPA+DHA, vitamins D/E/K, the B vitamins, folate, choline,
 * magnesium, phosphorus, zinc, selenium, iodine, copper, manganese,
 * caffeine) across catalog ingredients and restaurant dishes.
 *
 * Values come from manual_controls/seed_data/more_nutrients_backfill.json,
 * generated from:
 *   - USDA FoodData Central SR Legacy (per 100 g) for each ingredient's
 *     matching generic food, scaled to the serving its stored core values
 *     describe (dried foods scaled up by concentration);
 *   - Open Food Facts label values for branded items where they passed
 *     plausibility checks;
 *   - added sugar as a per-food share of the ingredient's own stored sugar
 *     (0 for whole foods; label value where Open Food Facts had one);
 *   - iodine only for known sources (dairy, eggs, some seafood, seaweed) —
 *     USDA SR Legacy doesn't carry it; everything else stays unknown;
 *   - restaurant dishes modeled as their USDA components, scaled to the
 *     dish's stored calories.
 * Foods USDA has nothing comparable for (gochujang, char siu sauce,
 * Hondashi, ...) keep these fields unknown rather than guessed. Supplements
 * are left out entirely — their values come from their own labels.
 *
 * Only fills fields that are still empty; never touches existing values.
 * Backs up first to manual_controls/seeds/more_nutrients_backup.json
 * (skipped if it already exists). Run backfill_recipe_nutrition.js
 * afterwards so recipes pick the new values up.
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/backfill_more_nutrients.js [--dry-run]
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import Ingredient from "../../models/Ingredient.js";
import RestaurantMeal from "../../models/RestaurantMeal.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "seed_data", "more_nutrients_backfill.json");
const BACKUP_PATH = path.join(__dirname, "..", "seeds", "more_nutrients_backup.json");

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  await mongoose.connect(process.env.MONGODB_URI);

  const ingredientIds = data.ingredients.map((row) => row._id);
  const ingredients = await Ingredient.find({ _id: { $in: ingredientIds } }).select("name nutrition").lean();
  const restaurants = await RestaurantMeal.find({});

  if (!dryRun && !fs.existsSync(BACKUP_PATH)) {
    fs.writeFileSync(
      BACKUP_PATH,
      JSON.stringify({ ingredients, restaurants: restaurants.map((r) => r.toObject()) }, null, 2),
    );
    console.log(`Backed up ${ingredients.length} ingredient(s) and ${restaurants.length} restaurant(s) to ${BACKUP_PATH}`);
  }

  const byId = new Map(ingredients.map((i) => [String(i._id), i]));
  const ops = [];
  let ingredientFields = 0;
  for (const row of data.ingredients) {
    const current = byId.get(row._id);
    if (!current) {
      console.log(`Skipping "${row.name}" — no longer exists`);
      continue;
    }
    const $set = {};
    for (const [field, value] of Object.entries(row.values)) {
      if (value == null || current.nutrition?.[field] != null) continue;
      $set[`nutrition.${field}`] = value;
    }
    if (Object.keys($set).length === 0) continue;
    ingredientFields += Object.keys($set).length;
    ops.push({ updateOne: { filter: { _id: current._id }, update: { $set } } });
  }

  const dishValues = new Map(data.dishes.map((row) => [row._id, row.values]));
  let dishCount = 0;
  let dishFields = 0;
  for (const restaurant of restaurants) {
    let changed = false;
    for (const dish of restaurant.dishes) {
      const values = dishValues.get(String(dish._id));
      if (!values) continue;
      let dishChanged = false;
      for (const [field, value] of Object.entries(values)) {
        if (value == null || dish.nutrition?.[field] != null) continue;
        dish.nutrition[field] = value;
        dishFields++;
        dishChanged = true;
      }
      if (dishChanged) {
        dishCount++;
        changed = true;
      }
    }
    if (changed && !dryRun) await restaurant.save();
  }

  console.log(`${ops.length} ingredient(s) / ${ingredientFields} field(s); ${dishCount} dish(es) / ${dishFields} field(s).`);
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
