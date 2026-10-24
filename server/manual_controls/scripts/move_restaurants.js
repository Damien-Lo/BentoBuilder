// One-off (Oct 24, 2026): restaurants become public (models/Restaurant.js).
// Each account's own RestaurantMeals — Damien's, and the admin's copy of
// them from Oct 23 — become one public Restaurant per place (matched by
// name); five are chain locations (Chipotle, Chick-fil-A, Shake Shack, Cava,
// Paris Baguette) whose dishes go on the chain's menu. Each distinct dish
// becomes a RestaurantDish. What was each account's own — a dish's notes,
// price and ratings, a restaurant's notes — goes to that account's
// FoodSettings, with every restaurant saved as theirs.
//
// The meals that had them now point at the Restaurant, each chosen dish at
// its RestaurantDish with a copy of its name and nutrition as it was (so
// later corrections to the public dish don't change them). Their old
// `restaurantMeal` is left as it was, and the RestaurantMeals themselves
// aren't touched — the app before this change keeps working, and it can
// all be undone. The meals are backed up first
// (backup_20261024_restaurant_entries), and the ids made kept
// (move_20261024_restaurants).
//
// (Dish ids repeat across the two accounts — the Oct 23 copy kept them —
// so a dish is found by its RestaurantMeal and its own id together.)
//
//   node manual_controls/scripts/move_restaurants.js            (dry run)
//   node manual_controls/scripts/move_restaurants.js --go
//   … --db <name>   (another database on the cluster, to try it)

import "dotenv/config";
import mongoose from "mongoose";

const GO = process.argv.includes("--go");
const dbName = process.argv.includes("--db") ? process.argv[process.argv.indexOf("--db") + 1] : undefined;
const CHAINS = ["Chipotle", "Chick-fil-A", "Shake Shack", "Cava", "Paris Baguette"];
const DAMIEN = new mongoose.Types.ObjectId("6adbd87d0f6154443617151b");
const { ObjectId } = mongoose.Types;
const normal = (name) => String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const now = new Date();

await mongoose.connect(process.env.MONGODB_URI, dbName ? { dbName } : {});
const db = mongoose.connection.db;
console.log(`Database: ${db.databaseName}${GO ? "" : "  (dry run — nothing changes)"}`);
if (await db.collection("restaurants").countDocuments({})) throw new Error("There are restaurants already — has this run?");

const meals = await db.collection("restaurantmeals").find({}).toArray();
const byPlace = new Map();
for (const rm of meals) {
  const key = normal(rm.restaurantName);
  if (!byPlace.has(key)) byPlace.set(key, []);
  byPlace.get(key).push(rm);
}

const chains = [], restaurants = [], dishes = [], settings = [];
const dishFor = new Map(); // "rmId|dishId" → { id, name, nutrition }
const restaurantFor = new Map(); // rmId → restaurant id
for (const copies of byPlace.values()) {
  const name = copies[0].restaurantName.trim();
  const chainName = CHAINS.find((c) => normal(c) === normal(name));
  const chain = chainName ? { _id: new ObjectId(), name: chainName, normalizedName: normal(chainName), cuisine: "", website: "", addedBy: DAMIEN, history: [{ at: now, by: DAMIEN, changes: {}, note: "added (from Damien's restaurants)" }], isArchived: false, createdAt: now, updatedAt: now } : null;
  if (chain) chains.push(chain);
  const restaurant = {
    _id: new ObjectId(), name, cuisine: "", chain: chain?._id ?? null, address: "", googlePlaceId: null, website: "", phone: "",
    addedBy: DAMIEN, history: [{ at: now, by: DAMIEN, changes: {}, note: "added (from Damien's restaurants)" }], mergedInto: null, isArchived: false, createdAt: now, updatedAt: now,
  };
  restaurants.push(restaurant);
  // Its dishes: one per distinct name, the first copy's numbers.
  const dishByName = new Map();
  for (const rm of copies) {
    restaurantFor.set(String(rm._id), restaurant._id);
    settings.push({ owner: rm.owner, kind: "restaurant", item: restaurant._id, saved: !rm.isArchived, notes: rm.notes ?? "" });
    for (const d of rm.dishes ?? []) {
      let made = dishByName.get(normal(d.name));
      if (!made) {
        made = {
          _id: new ObjectId(), ...(chain ? { chain: chain._id, restaurant: null } : { restaurant: restaurant._id, chain: null }),
          name: d.name.trim(), section: "", nutrition: d.nutrition ?? {}, source: "typed", fromLibrary: null,
          addedBy: DAMIEN, history: [{ at: now, by: DAMIEN, changes: {}, note: "added (from Damien's restaurants)" }], mergedInto: null, isArchived: false, createdAt: now, updatedAt: now,
        };
        dishByName.set(normal(d.name), made);
        dishes.push(made);
      }
      dishFor.set(`${rm._id}|${d._id}`, { id: made._id, name: d.name.trim(), nutrition: d.nutrition ?? {} });
      if (d.notes || d.price != null || d.scores?.length) settings.push({ owner: rm.owner, kind: "dish", item: made._id, notes: d.notes ?? "", price: d.price ?? null, scores: d.scores ?? [] });
    }
  }
  console.log(`${name.padEnd(26)} ${chain ? "chain" : "     "} ${copies.length} copies → ${dishByName.size} dishes`);
}

// The meals that had them.
const entries = await db.collection("mealplanentries").find({ restaurantMeal: { $ne: null } }).toArray();
const usuals = await db.collection("usualmeals").find({ restaurantMeal: { $ne: null } }).toArray();
let lost = 0;
const rewrite = (doc) => {
  const restaurant = restaurantFor.get(String(doc.restaurantMeal));
  const selections = (doc.restaurantDishSelections ?? []).map((s) => {
    const dish = dishFor.get(`${doc.restaurantMeal}|${s.dish}`);
    if (!dish) {
      lost++;
      return null;
    }
    return { dish: dish.id, quantity: s.quantity ?? 1, name: dish.name, nutrition: dish.nutrition };
  }).filter(Boolean);
  return restaurant ? { restaurant, restaurantDishSelections: selections } : null;
};
const entryChanges = entries.map((e) => [e, rewrite(e)]);
const usualChanges = usuals.map((u) => [u, rewrite(u)]);
const noRestaurant = entryChanges.filter(([, c]) => !c).length;
console.log(`\n${restaurants.length} restaurants (${chains.length} chain locations), ${dishes.length} dishes, ${settings.length} personal settings`);
console.log(`${entries.length} meals and ${usuals.length} usual meals to point at them; ${noRestaurant} whose restaurant's gone; ${lost} chosen dishes no longer on the menu (left out)`);

if (!GO) {
  console.log("\nDry run. Run again with --go to apply.");
  await mongoose.disconnect();
  process.exit(0);
}

if (entries.length) await db.collection("backup_20261024_restaurant_entries").insertMany(entries.map(({ _id, ...rest }) => ({ originalId: _id, ...rest })));
if (chains.length) await db.collection("chains").insertMany(chains);
await db.collection("restaurants").insertMany(restaurants);
if (dishes.length) await db.collection("restaurantdishes").insertMany(dishes);
for (const s of settings) {
  const { owner, kind, item, ...fields } = s;
  await db.collection("foodsettings").updateOne({ owner, kind, item }, { $set: fields, $setOnInsert: { owner, kind, item, createdAt: now }, $currentDate: { updatedAt: true } }, { upsert: true });
}
for (const [doc, change] of entryChanges) if (change) await db.collection("mealplanentries").updateOne({ _id: doc._id }, { $set: change });
for (const [doc, change] of usualChanges) if (change) await db.collection("usualmeals").updateOne({ _id: doc._id }, { $set: change });
await db.collection("move_20261024_restaurants").insertOne({ at: now, chains: chains.map((c) => c._id), restaurants: restaurants.map((r) => r._id), dishes: dishes.map((d) => d._id), entries: entryChanges.filter(([, c]) => c).map(([e]) => e._id) });

const pointed = await db.collection("mealplanentries").countDocuments({ restaurant: { $in: restaurants.map((r) => r._id) } });
const withCopies = await db.collection("mealplanentries").countDocuments({ restaurant: { $ne: null }, "restaurantDishSelections.name": { $exists: true } });
console.log(`\nMeals pointing at the new restaurants: ${pointed} of ${entries.length - noRestaurant} · with the dish copies: ${withCopies}`);
await mongoose.disconnect();
