// One-off (Oct 23, 2026): Damien's generic ingredients, matched to the food
// library (data/usda-foods). He reviewed the matches
// (food_library_matches_20261023.json, 160 of his 266 generics; the rest have
// no library food, or are duplicates of one that does). Each matched
// ingredient becomes that library food: it gets the USDA id, so the library
// never adds a second copy, and keeps its own id, so every recipe, pantry
// item and meal still points at it.
//
// His name, nutrition, portions and category are kept. Only what's missing
// is filled in from USDA:
// - the nutrients he left blank, scaled to his own default portion (skipped
//   where that portion can't be turned into grams);
// - the unit weights he doesn't have;
// - the search aliases.
// Each ingredient is backed up first, in backup_20261023_foodlibrary_match.
//
//   node manual_controls/scripts/match_food_library.js        (dry run)
//   node manual_controls/scripts/match_food_library.js --go

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import { ALL_NUTRITION_FIELD_NAMES } from "../../models/nutritionSchema.js";
import { convertUnits } from "../../services/unitConversion.js";

const GO = process.argv.includes("--go");
const here = path.dirname(fileURLToPath(import.meta.url));
const matches = JSON.parse(fs.readFileSync(path.join(here, "food_library_matches_20261023.json"), "utf8"));
const library = new Map(JSON.parse(fs.readFileSync(path.join(here, "..", "..", "data", "usda-foods", "foods.json"), "utf8")).map((f) => [f.fdcId, f]));

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
console.log(`Database: ${db.databaseName}${GO ? "" : "  (dry run — nothing changes)"}`);
const ingredients = db.collection("ingredients");
const taken = await ingredients.countDocuments({ fdcId: { $type: "number" } });
if (taken) throw new Error(`${taken} ingredients already have a USDA id — has this run already?`);

const updates = [];
const filled = { nutrients: 0, units: 0, aliases: 0, noGrams: [] };
for (const match of matches) {
  const mine = await ingredients.findOne({ _id: new mongoose.Types.ObjectId(match.id), owner: null });
  if (!mine) throw new Error(`${match.name} (${match.id}) isn't a shared ingredient any more.`);
  const food = library.get(match.fdcId);
  if (!food) throw new Error(`${match.libraryName} (${match.fdcId}) isn't in the library.`);

  // Unit weights: his, then USDA's for the units he doesn't have.
  const have = new Set((mine.unitConversions ?? []).map((c) => c.unit.trim().toLowerCase()));
  const extraUnits = (food.unitConversions ?? []).filter((c) => !have.has(c.unit.toLowerCase()));
  const unitConversions = [...(mine.unitConversions ?? []), ...extraUnits];

  // His portion in grams (by his own weights first), to scale USDA's nutrients to it.
  const usdaGrams = food.defaultPortionUnit === "g" ? food.defaultPortionAmount : food.defaultPortionAmount * (food.unitConversions.find((c) => c.unit === food.defaultPortionUnit)?.factor ?? NaN);
  // (The converter loops forever on weights that never reach grams — "1 item = 1 stalk" — so a throw is "not in grams" too.)
  let myGrams = null;
  try {
    myGrams = convertUnits(mine.defaultPortionAmount ?? 1, mine.defaultPortionUnit, "g", unitConversions);
  } catch {
    myGrams = null;
  }
  const nutrition = { ...(mine.nutrition ?? {}) };
  let added = 0;
  if (myGrams != null && Number.isFinite(usdaGrams)) {
    for (const field of ALL_NUTRITION_FIELD_NAMES) {
      if (nutrition[field] == null && food.nutrition[field] != null) {
        const v = (food.nutrition[field] / usdaGrams) * myGrams;
        nutrition[field] = Math.round(v * (v >= 10 ? 10 : v >= 1 ? 100 : 1000)) / (v >= 10 ? 10 : v >= 1 ? 100 : 1000);
        added++;
      }
    }
  } else filled.noGrams.push(`${mine.name} (${mine.defaultPortionAmount} ${mine.defaultPortionUnit})`);

  const aliases = [...new Set([...(mine.aliases ?? []), ...(food.aliases ?? [])])];
  filled.nutrients += added;
  filled.units += extraUnits.length;
  filled.aliases += aliases.length - (mine.aliases ?? []).length;
  updates.push({
    before: mine,
    set: { source: "usda", fdcId: food.fdcId, alsoFdcIds: food.alsoFdcIds ?? [], sourceName: food.sourceName, aliases, unitConversions, nutrition },
    line: `${mine.name.padEnd(34)} → ${food.name.padEnd(40)} +${String(added).padStart(2)} nutrients, +${extraUnits.length} units`,
  });
}

for (const u of updates) console.log(u.line);
console.log(`\n${updates.length} ingredients matched: ${filled.nutrients} nutrients filled in, ${filled.units} unit weights and ${filled.aliases} aliases added.`);
console.log(`Portion not in grams, so no nutrients filled (${filled.noGrams.length}): ${filled.noGrams.join(", ") || "none"}`);

if (!GO) {
  console.log("\nDry run. Run again with --go to apply.");
  await mongoose.disconnect();
  process.exit(0);
}

await db.collection("backup_20261023_foodlibrary_match").insertMany(updates.map((u) => u.before));
for (const u of updates) await ingredients.updateOne({ _id: u.before._id, owner: null }, { $set: { ...u.set, updatedAt: new Date() } });
const done = await ingredients.countDocuments({ _id: { $in: updates.map((u) => u.before._id) }, source: "usda", fdcId: { $type: "number" } });
console.log(`\nApplied: ${done} of ${updates.length} ${done === updates.length ? "✓" : "✗"} (backed up in backup_20261023_foodlibrary_match)`);
await mongoose.disconnect();
