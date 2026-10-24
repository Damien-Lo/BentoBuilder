import mongoose from "mongoose";

import { TEST_DB_NAME } from "../config/database.js";

// Rebuilding the test database from the real one.
//
// What you'd want there to try things out is copied — recipes, ingredients
// and everything they hang off (categories, brands, tags, stores, storage
// locations), saved and restaurant meals, your settings and the calendars
// themselves. What records a life is left out, so the test data starts
// empty of it: the pantry, the meal plan, calendar events, tasks, the
// grocery list, weigh-ins, usual meals, the suggestion record. A collection
// this list doesn't know about is left out too — the safe side to err on.
//
// The test data's own accounts (and their sessions and invites) stay as
// they are, so test sign-ins keep working; what's copied in comes as the
// test admin's — it's the admin's in the real data, whose account isn't
// here (records with no owner are the admin's: services/ownership.js).
//
// The real database is only ever read here.
const KEPT = ["users", "sessions", "accesscodes"];
export const COPIED = ["brands", "eventcalendars", "ingredientcategories", "ingredients", "meals", "mealtags", "photos", "recipecategories", "recipes", "restaurantmeals", "restaurants", "chains", "restaurantdishes", "storagelocations", "stores", "tags", "userprofiles"];

export async function resetTestDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing from server/.env");
  const real = await mongoose.createConnection(uri).asPromise();
  const test = await mongoose.createConnection(uri, { dbName: TEST_DB_NAME }).asPromise();
  try {
    if (real.name === test.name) throw new Error("The test database would be the real one — not touching it.");
    const copied = {};
    for (const { name } of await test.db.listCollections().toArray()) if (!KEPT.includes(name)) await test.db.collection(name).deleteMany({});
    for (const name of COPIED) {
      const docs = (await real.db.collection(name).find().toArray()).map((doc) => (doc.owner ? { ...doc, owner: null } : doc));
      if (docs.length) await test.db.collection(name).insertMany(docs);
      copied[name] = docs.length;
    }
    return { from: real.name, to: test.name, copied };
  } finally {
    await real.close();
    await test.close();
  }
}
