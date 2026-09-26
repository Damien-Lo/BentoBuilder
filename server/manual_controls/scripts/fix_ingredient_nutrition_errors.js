/**
 * One-time fix for ingredient nutrition errors found while backfilling
 * extended nutrients (see backfill_extended_nutrients.js). Three kinds:
 *
 *   1. Core values that don't match the stated serving at all — corrected,
 *      and their extended values added (the backfill skipped these):
 *      - Yamamotoyama nori: per-100 g label values stored as "per sheet"
 *        (400 kcal/sheet) — rescaled to one ~3 g sheet.
 *      - Wise Wife black sesame: 270 kcal per tbsp with 0 g carbs/protein —
 *        replaced with standard roasted sesame per tbsp (9 g).
 *      - Kroger crushed red pepper: ~1/3 of real values per 10 g —
 *        replaced with USDA red pepper values.
 *      - Spring Onion: had no nutrition at all — filled with green onion
 *        values per 100 g.
 *   2. Right values, wrong serving amount — only the serving changes:
 *      - Hmart Seasoned Fresh Crabs: "1 g" -> 255 g (one container, per
 *        Open Food Facts; the stored 340 kcal is the whole container).
 *      - XO Sauce / LKK Xo sauce: "1 g" -> 20 g (100 kcal / 9 g fat is a
 *        ~20 g serving of an oil-based XO sauce).
 *      - Ofood Chicken Fritter / Chicken Katsu: "3 piece" -> 1 piece (the
 *        values are one 113 g piece, per the label).
 *      - LKK Toban Djan: "2 tbsp" -> 1 tsp (label serving is 1 tsp / 6 g).
 *      - House Wasabi / Wasabi Paste: "6 tsp" -> 1 tsp (label: 1 tsp / 6 g).
 *   3. Single wrong fields:
 *      - Chicken Thigh: protein 2 g -> 27.9 g and sodium 0 -> 133 mg per
 *        140 g raw skinless (USDA).
 *      - "Wasabi Family Siㄷ" -> "Wasabi Family Size" (Korean-keyboard typo).
 *
 * Backs up every touched ingredient to
 * manual_controls/seeds/ingredients_nutrition_error_fixes_backup.json first
 * (skipped if it already exists). Run backfill_recipe_nutrition.js
 * afterwards so recipes using these pick up the changes.
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/fix_ingredient_nutrition_errors.js [--dry-run]
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import Ingredient from "../../models/Ingredient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_PATH = path.join(__dirname, "..", "seeds", "ingredients_nutrition_error_fixes_backup.json");

const dryRun = process.argv.includes("--dry-run");

// `nutrition` entries are merged into the existing nutrition (dotted $set),
// so fields not listed here are left alone.
const FIXES = [
  {
    _id: "6aaeb9d07ac379360e1a5370", name: "Roasted Sushi Nori Seaweed Original",
    set: { defaultPortionAmount: 1, defaultPortionUnit: "sheet" },
    nutrition: {
      calories: 12, protein: 1.2, carbs: 1.2, fats: 0, fiber: 0, sodium: 24,
      sugar: 0, saturatedFat: 0, polyunsaturatedFat: 0, monounsaturatedFat: 0, transFat: 0,
      cholesterol: 0, potassium: 72, vitaminA: 69, vitaminC: 6.3, calcium: 8, iron: 0.3,
    },
  },
  {
    _id: "6a680fb925be1fa8f50016fd", name: "Roasted Black Sesame Seeds",
    set: { defaultPortionAmount: 1, defaultPortionUnit: "tbsp" },
    nutrition: {
      calories: 52, protein: 1.6, carbs: 2.1, fats: 4.5, fiber: 1.2, sodium: 1,
      sugar: 0, saturatedFat: 0.6, polyunsaturatedFat: 2, monounsaturatedFat: 1.7, transFat: 0,
      cholesterol: 0, potassium: 42, vitaminA: 0, vitaminC: 0, calcium: 88, iron: 1.3,
    },
  },
  {
    _id: "6aaebbaf7ac379360e1a5390", name: "Crushed red pepper",
    set: { defaultPortionAmount: 10, defaultPortionUnit: "g" },
    nutrition: {
      calories: 32, protein: 1.2, carbs: 5.7, fats: 1.7, fiber: 2.7, sodium: 3,
      sugar: 1, saturatedFat: 0.3, polyunsaturatedFat: 0.8, monounsaturatedFat: 0.3, transFat: 0,
      cholesterol: 0, potassium: 201, vitaminA: 208, vitaminC: 7.6, calcium: 15, iron: 0.8,
    },
  },
  {
    _id: "6a9a0a50f783c1565133ee09", name: "Spring Onion",
    set: { defaultPortionAmount: 100, defaultPortionUnit: "g" },
    nutrition: {
      calories: 32, protein: 1.8, carbs: 7.3, fats: 0.2, fiber: 2.6, sodium: 16,
      sugar: 2.3, saturatedFat: 0, polyunsaturatedFat: 0.1, monounsaturatedFat: 0, transFat: 0,
      cholesterol: 0, potassium: 276, vitaminA: 50, vitaminC: 18.8, calcium: 72, iron: 1.5,
    },
  },
  {
    _id: "6ab0483819b0b581fd458656", name: "Seasoned Fresh Crabs",
    set: { defaultPortionAmount: 255, defaultPortionUnit: "g" },
    nutrition: {
      sugar: 5, saturatedFat: 2, polyunsaturatedFat: 6.4, monounsaturatedFat: 3.8, transFat: 0,
      cholesterol: 165, potassium: 638, vitaminA: 153, vitaminC: 12.8, calcium: 255, iron: 3.1,
    },
  },
  {
    _id: "6ab0483119b0b581fd45864b", name: "XO Sauce",
    set: { defaultPortionAmount: 20, defaultPortionUnit: "g" },
    nutrition: {
      sugar: 4.3, saturatedFat: 1.4, polyunsaturatedFat: 4, monounsaturatedFat: 3.1, transFat: 0,
      cholesterol: 16, potassium: 60, vitaminA: 6, vitaminC: 0.2, calcium: 12, iron: 0.4,
    },
  },
  {
    _id: "6ab0483119b0b581fd45864c", name: "Xo sauce",
    set: { defaultPortionAmount: 20, defaultPortionUnit: "g" },
    nutrition: {
      sugar: 1, saturatedFat: 1.5, polyunsaturatedFat: 4, monounsaturatedFat: 3.1, transFat: 0,
      cholesterol: 16, potassium: 60, vitaminA: 6, vitaminC: 0.2, calcium: 12, iron: 0.4,
    },
  },
  { _id: "6a8b445d7787e51b73ad9e01", name: "Formed White Chicken Fritter Uncooked", set: { defaultPortionAmount: 1 } },
  { _id: "6a8b445c7787e51b73ad9e00", name: "Chicken Katsu", set: { defaultPortionAmount: 1 } },
  { _id: "6a691c670f94cb20253ba706", name: "Toban Djan", set: { defaultPortionAmount: 1, defaultPortionUnit: "tsp" } },
  {
    _id: "6ab0483019b0b581fd458649", name: "Wasabi Family Siㄷ",
    set: { name: "Wasabi Family Size", defaultPortionAmount: 1, defaultPortionUnit: "tsp" },
  },
  { _id: "6ab0483019b0b581fd458648", name: "Wasabi Paste", set: { defaultPortionAmount: 1, defaultPortionUnit: "tsp" } },
  { _id: "6a70b81a121d0b38050808dc", name: "Chicken Thigh", nutrition: { protein: 27.9, sodium: 133 } },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const ids = FIXES.map((f) => f._id);
  const current = await Ingredient.find({ _id: { $in: ids } })
    .select("name defaultPortionAmount defaultPortionUnit nutrition")
    .lean();
  const byId = new Map(current.map((i) => [String(i._id), i]));

  // Refuse to run against anything that doesn't look like what these fixes
  // were written for (renamed/deleted since), rather than guessing.
  const mismatched = FIXES.filter((f) => byId.get(f._id)?.name !== f.name);
  if (mismatched.length > 0) {
    console.error("These ingredients are missing or renamed — nothing written:");
    for (const f of mismatched) console.error(`  ${f._id} expected "${f.name}", found "${byId.get(f._id)?.name}"`);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!dryRun && !fs.existsSync(BACKUP_PATH)) {
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(current, null, 2));
    console.log(`Backed up ${current.length} ingredient(s) to ${BACKUP_PATH}`);
  }

  const ops = FIXES.map((fix) => {
    const $set = { ...fix.set };
    for (const [field, value] of Object.entries(fix.nutrition ?? {})) {
      $set[`nutrition.${field}`] = value;
    }
    const before = byId.get(fix._id);
    console.log(`${fix.name}: ${before.defaultPortionAmount} ${before.defaultPortionUnit} -> ${JSON.stringify($set)}`);
    return { updateOne: { filter: { _id: fix._id }, update: { $set } } };
  });

  if (dryRun) {
    console.log("Dry run — nothing written.");
  } else {
    const result = await Ingredient.bulkWrite(ops);
    console.log(`Updated ${result.modifiedCount} ingredient(s).`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
