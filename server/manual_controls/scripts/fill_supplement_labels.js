/**
 * One-time fill: complete nutrition for the first logged supplements, from
 * their actual labels (NIH Dietary Supplement Label Database, DSLD):
 *   - Bayer One A Day Men's Complete Multivitamin (DSLD 337439, 2025 label)
 *   - Nature Made Fish Oil 1200 mg (DSLD 271348)
 *   - Country Farms FiberCare Fiber Gummies (product label)
 * plus the generic Multivitamin / Fish Oil / Fiber entries, which were
 * entered as exact copies of the branded ones.
 *
 * Supplement labels must declare every nutrient they contain, so anything
 * a label doesn't list is filled as 0 (not unknown). Biotin, pantothenic
 * acid, chromium and lycopene (all on the multivitamin) aren't tracked.
 *
 * Also fixes two serving sizes: the fish oil's and gummies' values were
 * each label's full serving (2 softgels / 3 gummies) but saved per
 * "1 tablet" — so the Supplement Stack recipe (2 softgels, 3 gummies)
 * counted them 2x and 3x over. Run backfill_recipe_nutrition.js afterwards.
 *
 * Backs up the touched ingredients to
 * manual_controls/seeds/supplements_label_fill_backup.json (skipped if it
 * already exists).
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/fill_supplement_labels.js [--dry-run]
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import Ingredient from "../../models/Ingredient.js";
import { ALL_NUTRITION_FIELD_NAMES } from "../../models/nutritionSchema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_PATH = path.join(__dirname, "..", "seeds", "supplements_label_fill_backup.json");
const dryRun = process.argv.includes("--dry-run");

// Everything a label lists; every other tracked field becomes 0.
const MULTIVITAMIN = {
  vitaminA: 900, vitaminC: 99, vitaminD: 25, vitaminE: 15, thiamin: 1.32, riboflavin: 1.43,
  niacin: 17.6, vitaminB6: 2.17, folate: 400, vitaminB12: 6.24, calcium: 210, iodine: 150,
  magnesium: 120, zinc: 11, selenium: 55, copper: 0.9, manganese: 2.3,
};
// Per 2 softgels.
const FISH_OIL = {
  calories: 35, fats: 3, saturatedFat: 1, polyunsaturatedFat: 1, monounsaturatedFat: 0.5,
  cholesterol: 25, carbs: 1, protein: 1, omega3: 600,
};
// Per 3 gummies.
const FIBER_GUMMIES = { calories: 15, carbs: 7, fiber: 6, sodium: 6 };

const FIXES = [
  { _id: "6ab863ab2f62a52af2efaf2a", name: "Men’s Complete Multivitamin/multimineral Supplement", label: MULTIVITAMIN },
  { _id: "6ab863ab2f62a52af2efaf29", name: "Multivitamin", label: MULTIVITAMIN },
  { _id: "6ab863382f62a52af2efaf17", name: "Fish Oil 1200mg", label: FISH_OIL, portion: 2 },
  { _id: "6ab863382f62a52af2efaf16", name: "Fish Oil Suppliment", label: FISH_OIL, portion: 2 },
  { _id: "6ab864222f62a52af2efaf58", name: "Fiber Gummies", label: FIBER_GUMMIES, portion: 3 },
  { _id: "6ab864222f62a52af2efaf57", name: "Fiber Suppliment", label: FIBER_GUMMIES, portion: 3 },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const current = await Ingredient.find({ _id: { $in: FIXES.map((f) => f._id) } })
    .select("name defaultPortionAmount defaultPortionUnit nutrition")
    .lean();
  const byId = new Map(current.map((i) => [String(i._id), i]));

  const mismatched = FIXES.filter((f) => byId.get(f._id)?.name !== f.name);
  if (mismatched.length > 0) {
    for (const f of mismatched) console.error(`  ${f._id} expected "${f.name}", found "${byId.get(f._id)?.name}"`);
    console.error("Missing or renamed — nothing written.");
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!dryRun && !fs.existsSync(BACKUP_PATH)) {
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(current, null, 2));
    console.log(`Backed up ${current.length} ingredient(s) to ${BACKUP_PATH}`);
  }

  const ops = FIXES.map((fix) => {
    const nutrition = Object.fromEntries(ALL_NUTRITION_FIELD_NAMES.map((field) => [field, fix.label[field] ?? 0]));
    const $set = { nutrition };
    if (fix.portion) $set.defaultPortionAmount = fix.portion;
    const before = byId.get(fix._id);
    console.log(`${fix.name}: portion ${before.defaultPortionAmount} ${before.defaultPortionUnit} -> ${fix.portion ?? before.defaultPortionAmount}`);
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
