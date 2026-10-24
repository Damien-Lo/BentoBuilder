// One-off (Oct 24, 2026): two tidy-ups of the shared ingredient catalog,
// agreed with Damien.
//
// 1. Three true duplicates merged into the one kept:
//    - Pepper → Black Pepper
//    - Spring Onion → Green Onion
//    - Korean Spinach → Spinach
//    Everything that pointed at the duplicate now points at the one kept:
//    recipe lines, meals planned or logged, pantry, grocery list, saved and
//    usual meals, a product's generic. Then the duplicate is archived.
//    (Same-named generic + product pairs — "Soy Sauce" and its branded
//    "Soy Sauce" — are the generic/product hierarchy, not duplicates, and
//    are left alone. So are the look-alikes that are different things:
//    Minced Garlic and Vacuum-Sealed Filet Mignon are made by a recipe,
//    Light Soy Sauce is asked for by name, and so on.)
// 2. Portions that couldn't reach grams, given a weight:
//    - produce counted by "item"/"pieces": its medium piece's weight, from
//      its own unit (1 carrot = 61 g → 1 item = 61 g);
//    - the konjac jellies' "pack = 150 ml": 1 ml = 1 g (water-based).
//
// Every record changed is backed up first, in backup_20261024_tidy_ingredients.
//
//   node manual_controls/scripts/tidy_ingredients_20261024.js        (dry run)
//   node manual_controls/scripts/tidy_ingredients_20261024.js --go

import "dotenv/config";
import mongoose from "mongoose";

import { convertUnits } from "../../services/unitConversion.js";

const GO = process.argv.includes("--go");
const MERGES = [
  ["Pepper", "Black Pepper"],
  ["Spring Onion", "Green Onion"],
  ["Korean Spinach", "Spinach"],
];
// Where an ingredient is pointed at: [collection, path].
const USES = [
  ["recipes", "ingredientList.ingredient"],
  ["mealplanentries", "ingredient"],
  ["mealplanentries", "manualPieceEntries.ingredient"],
  ["mealplanentries", "pieceSizes.ingredient"],
  ["pantryitems", "ingredient"],
  ["pantryitems", "madeFrom.ingredient"],
  ["groceryitems", "ingredient"],
  ["meals", "courses.ingredient"],
  ["meals", "bentoLayout.sections.ingredient"],
  ["usualmeals", "ingredient"],
  ["ingredients", "genericParent"],
];

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
console.log(`Database: ${db.databaseName}${GO ? "" : "  (dry run — nothing changes)"}`);
const ingredients = db.collection("ingredients");
const one = async (name) => {
  const found = await ingredients.find({ owner: null, name, isArchived: { $ne: true } }).toArray();
  if (found.length !== 1) throw new Error(`Expected one shared "${name}", found ${found.length}.`);
  return found[0];
};

const backups = [];
const steps = [];

// 1. Merges.
for (const [dupName, keepName] of MERGES) {
  const [dup, keep] = [await one(dupName), await one(keepName)];
  let moved = 0;
  for (const [collection, path] of USES) {
    const n = await db.collection(collection).countDocuments({ [path]: dup._id });
    if (!n) continue;
    moved += n;
    const cut = path.lastIndexOf(".");
    const [list, field] = cut > 0 ? [path.slice(0, cut), path.slice(cut + 1)] : [null, path];
    for (const doc of await db.collection(collection).find({ [path]: dup._id }).toArray()) backups.push({ ...doc, _from: collection });
    steps.push(() =>
      list
        ? db.collection(collection).updateMany({ [path]: dup._id }, { $set: { [`${list}.$[x].${field}`]: keep._id } }, { arrayFilters: [{ [`x.${field}`]: dup._id }] })
        : db.collection(collection).updateMany({ [path]: dup._id }, { $set: { [path]: keep._id } }),
    );
    console.log(`  ${dupName} in ${collection}.${path}: ${n} → ${keepName}`);
  }
  backups.push({ ...dup, _from: "ingredients" });
  steps.push(() => ingredients.updateOne({ _id: dup._id }, { $set: { isArchived: true, updatedAt: new Date() } }));
  console.log(`Merge ${dupName} → ${keepName}: ${moved} record(s) moved, then ${dupName} archived`);
}

// 2. Weights.
const live = await ingredients.find({ owner: null, isArchived: { $ne: true } }).toArray();
const grams = (i, conv) => {
  try {
    return convertUnits(i.defaultPortionAmount ?? 1, i.defaultPortionUnit, "g", conv);
  } catch {
    return null;
  }
};
for (const i of live) {
  const conv = i.unitConversions ?? [];
  if (grams(i, conv) != null) continue;
  const unit = (i.defaultPortionUnit ?? "").trim();
  let add = null;
  if (/^(item|items|piece|pieces|count)$/i.test(unit)) {
    // Its own piece: the unit that isn't a size, a slice or a volume ("carrot", "lemon").
    const piece = conv.find((c) => c.baseUnit === "g" && !/^(cup|tbsp|tsp|ml|slice|ring|strip|wedge|cherry|small |medium |large |extra )/i.test(c.unit));
    if (piece) add = { unit, baseUnit: "g", factor: piece.factor, why: `1 ${unit} = 1 ${piece.unit}` };
  } else if (conv.some((c) => c.baseUnit.toLowerCase() === "ml") && /konjac|conjac|jelly/i.test(i.name)) {
    add = { unit: "ml", baseUnit: "g", factor: 1, why: "1 ml = 1 g (water-based jelly)" };
  }
  if (!add) continue;
  const { why, ...entry } = add;
  const next = [...conv, entry];
  if (grams(i, next) == null) continue;
  backups.push({ ...i, _from: "ingredients" });
  steps.push(() => ingredients.updateOne({ _id: i._id }, { $set: { unitConversions: next, updatedAt: new Date() } }));
  console.log(`Weight: ${i.name} — ${i.defaultPortionAmount} ${unit} = ${Math.round(grams(i, next))} g (${why} = ${entry.factor} g)`);
}

console.log(`\n${steps.length} change(s), ${backups.length} record(s) to back up.`);
if (!GO) {
  console.log("Dry run. Run again with --go to apply.");
  await mongoose.disconnect();
  process.exit(0);
}
await db.collection("backup_20261024_tidy_ingredients").insertMany(backups.map(({ _id, ...rest }) => ({ originalId: _id, ...rest })));
for (const step of steps) await step();
console.log("Applied.");
await mongoose.disconnect();
