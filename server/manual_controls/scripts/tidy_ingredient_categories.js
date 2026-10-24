// One-off (Oct 23, 2026): the ingredient categories tidied before the food
// library goes in (agreed with Damien).
// - Snack is merged into Snacks & Confectionery.
// - Drinks is merged into Beverages & Stock.
// - Pancake's one ingredient goes to Baking.
// - Test Ingredients' one (archived) ingredient goes to Essentials.
// - Those four, and the empty Sau, Uncategorized, Baked Goods & Pantry and
//   Japanese, are archived: hidden in the app, still in the database.
// Each move is recorded in tidy_20261023_categories, so it can be undone.
//
//   node manual_controls/scripts/tidy_ingredient_categories.js        (dry run)
//   node manual_controls/scripts/tidy_ingredient_categories.js --go

import "dotenv/config";
import mongoose from "mongoose";

const GO = process.argv.includes("--go");
const MOVES = { Snack: "Snacks & Confectionery", Drinks: "Beverages & Stock", Pancake: "Baking", "Test Ingredients": "Essentials" };
const EMPTY = ["Sau", "Uncategorized", "Baked Goods & Pantry", "Japanese"];

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
console.log(`Database: ${db.databaseName}${GO ? "" : "  (dry run — nothing changes)"}`);
const categories = db.collection("ingredientcategories");
const ingredients = db.collection("ingredients");
const shared = { owner: { $in: [null] } };
const named = async (name) => {
  const found = await categories.find({ ...shared, name, isArchived: false }).toArray();
  if (found.length !== 1) throw new Error(`Expected one shared "${name}" category, found ${found.length}.`);
  return found[0];
};

const record = [];
for (const [from, to] of Object.entries(MOVES)) {
  const [a, b] = [await named(from), await named(to)];
  const moving = await ingredients.find({ category: a._id }, { projection: { name: 1 } }).toArray();
  console.log(`${from} → ${to}: ${moving.map((i) => i.name).join(", ") || "nothing"}`);
  record.push({ category: a._id, name: a.name, movedTo: b._id, ingredients: moving.map((i) => i._id) });
}
for (const name of EMPTY) {
  const c = await named(name);
  const n = await ingredients.countDocuments({ category: c._id });
  if (n) throw new Error(`"${name}" isn't empty (${n}).`);
  console.log(`${name}: empty`);
  record.push({ category: c._id, name: c.name, movedTo: null, ingredients: [] });
}
console.log(`\n${record.reduce((n, r) => n + r.ingredients.length, 0)} ingredients to move, ${record.length} categories to archive.`);

if (!GO) {
  console.log("\nDry run. Run again with --go to apply.");
  await mongoose.disconnect();
  process.exit(0);
}

await db.collection("tidy_20261023_categories").insertOne({ at: new Date(), record });
for (const r of record) {
  if (r.ingredients.length) await ingredients.updateMany({ _id: { $in: r.ingredients } }, { $set: { category: r.movedTo, updatedAt: new Date() } });
  await categories.updateOne({ _id: r.category }, { $set: { isArchived: true, updatedAt: new Date() } });
}
const left = await ingredients.countDocuments({ category: { $in: record.map((r) => r.category) } });
const archived = await categories.countDocuments({ _id: { $in: record.map((r) => r.category) }, isArchived: true });
console.log(`\nIngredients left in the old categories: ${left} ${left ? "✗" : "✓"} · categories archived: ${archived} of ${record.length} ${archived === record.length ? "✓" : "✗"}`);
await mongoose.disconnect();
