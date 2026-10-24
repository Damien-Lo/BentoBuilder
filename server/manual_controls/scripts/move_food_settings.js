// One-off (Oct 23, 2026): Damien's own side of the shared catalog, into his
// personal account. Before accounts, his ratings, notes and kitchen settings
// for each ingredient and recipe were kept on the shared records themselves
// (they're the admin's there — see services/catalog.js); his personal
// account (Damien) sees none of them. This copies each into a FoodSettings
// record of his, the way anyone else's are kept, and marks every shared
// ingredient saved: his own list, now that the food library's foods are
// only listed once saved.
//
// What follows the copy: a rating's meal points at Damien's copy of that
// meal (copied Oct 23 with its createdAt kept: matched on it, the day and
// the slot), and a storage place at his own place of the same name. The
// shared records are left exactly as they are. The ids made are kept in
// copy_20261023_foodsettings_ids.
//
//   node manual_controls/scripts/move_food_settings.js        (dry run)
//   node manual_controls/scripts/move_food_settings.js --go

import "dotenv/config";
import mongoose from "mongoose";

const GO = process.argv.includes("--go");
const { ObjectId } = mongoose.Types;
const FROM = new ObjectId("6ad547d6919c8d53ececaefa"); // Orbit Admin
const TO = new ObjectId("6adbd87d0f6154443617151b"); // Damien

// (services/catalog.js's PERSONAL_FIELDS.)
const PERSONAL = {
  ingredient: ["notes", "scores", "ratingPrompt", "lowStockThreshold", "isAlwaysAvailable", "cooksFromFrozen", "thawLeads", "defaultStorageLocation", "defaultExpiryDurationAmount", "defaultExpiryDurationUnit"],
  recipe: ["notes", "scores", "ratingPrompt", "isConfirmed"],
};
// Unset, or only defaults.
const empty = (v) =>
  v == null || v === "" || v === false || (Array.isArray(v) && !v.length) ||
  (typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof ObjectId) && Object.values(v).every((x) => x == null || x === 0 || x === false || (Array.isArray(x) && !x.length)));

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
console.log(`Database: ${db.databaseName}${GO ? "" : "  (dry run — nothing changes)"}`);
const [from, to] = await Promise.all([db.collection("users").findOne({ _id: FROM }), db.collection("users").findOne({ _id: TO })]);
if (!from || !to) throw new Error("One of the two accounts wasn't found.");
const already = await db.collection("foodsettings").countDocuments({ owner: TO });
if (already) throw new Error(`Damien already has ${already} FoodSettings — not copying over them.`);

// The admin's meals → Damien's copies (same createdAt, day and slot).
const key = (e) => `${e.createdAt?.toISOString()}|${e.date}|${e.slot ?? e.mealSlot ?? ""}`;
const theirEntries = new Map((await db.collection("mealplanentries").find({ owner: TO }).toArray()).map((e) => [key(e), e._id]));
const entryFor = new Map((await db.collection("mealplanentries").find({ owner: FROM }).toArray()).map((e) => [String(e._id), theirEntries.get(key(e)) ?? null]));
// The admin's storage places → Damien's, by name.
const theirPlaces = new Map((await db.collection("storagelocations").find({ owner: TO }).toArray()).map((l) => [l.name.toLowerCase(), l._id]));
const placeFor = new Map((await db.collection("storagelocations").find({ owner: FROM }).toArray()).map((l) => [String(l._id), theirPlaces.get(l.name.toLowerCase()) ?? null]));

const settings = [];
const unmatched = { meals: 0, places: [] };
const now = new Date();
for (const [kind, collection] of [["ingredient", "ingredients"], ["recipe", "recipes"]]) {
  const shared = await db.collection(collection).find({ owner: null }).toArray();
  let personal = 0;
  for (const item of shared) {
    const own = {};
    for (const field of PERSONAL[kind]) if (!empty(item[field])) own[field] = item[field];
    if (own.scores) {
      own.scores = own.scores.map((s) => {
        if (!s.mealPlanEntry) return s;
        const mine = entryFor.get(String(s.mealPlanEntry)) ?? null;
        if (!mine) unmatched.meals++;
        return { ...s, mealPlanEntry: mine };
      });
    }
    if (own.defaultStorageLocation) {
      const mine = placeFor.get(String(own.defaultStorageLocation)) ?? null;
      if (!mine) unmatched.places.push(item.name);
      own.defaultStorageLocation = mine;
    }
    const saved = kind === "ingredient";
    if (!Object.keys(own).length && !saved) continue;
    if (Object.keys(own).length) personal++;
    settings.push({ _id: new ObjectId(), owner: TO, kind, item: item._id, saved, ...own, createdAt: now, updatedAt: now });
  }
  console.log(`${collection.padEnd(12)} ${shared.length} shared, ${personal} with Damien's own settings${kind === "ingredient" ? `, all ${shared.length} saved` : ""}`);
}
const count = (field) => settings.filter((s) => !empty(s[field])).length;
console.log(`\nFoodSettings to make: ${settings.length}`);
for (const field of [...new Set(Object.values(PERSONAL).flat())]) if (count(field)) console.log(`  ${field.padEnd(28)} ${count(field)}`);
console.log(`Ratings whose meal has no copy: ${unmatched.meals} (kept, without the link)`);
console.log(`Storage places with no match: ${unmatched.places.length ? unmatched.places.join(", ") : "none"}`);

if (!GO) {
  console.log("\nDry run. Run again with --go to copy.");
  await mongoose.disconnect();
  process.exit(0);
}

await db.collection("foodsettings").insertMany(settings, { ordered: true });
await db.collection("copy_20261023_foodsettings_ids").insertOne({ at: new Date(), from: FROM, to: TO, made: settings.map((s) => s._id) });
const made = await db.collection("foodsettings").countDocuments({ _id: { $in: settings.map((s) => s._id) }, owner: TO });
console.log(`\nMade ${made} of ${settings.length} ${made === settings.length ? "✓" : "✗"}`);
await mongoose.disconnect();
