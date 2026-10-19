// Accounts, step B: gives every personal record from before accounts an
// owner — the admin, whose they all are — and replaces database rules that
// were for one person with per-person ones (one weight entry per day was
// for everyone; now it's per person).
//
// Run from server/, after making the admin (create_admin.js):
//   node manual_controls/scripts/assign_owners.js                  (real data: says what it would do)
//   node manual_controls/scripts/assign_owners.js --apply          (real data: does it)
//   node manual_controls/scripts/assign_owners.js --test [--apply] (test data)
// Take a backup first (backup_all_data.js). Running it again is harmless:
// only records without an owner are changed.
import "dotenv/config";
import mongoose from "mongoose";

import { TEST_DB_NAME } from "../../config/database.js";

// The personal collections (models using services/ownership.js).
const OWNED = [
  "calendarevents",
  "eventcalendars",
  "groceryitems",
  "mealplanentries",
  "menuitems",
  "pantryitems",
  "receiptdrafts",
  "suggestionevents",
  "todogroups",
  "todolists",
  "todotasks",
  "usualmeals",
  "userprofiles",
  "weightentries",
  "devices",
  "capturerequests",
];

// Rules for one person that become per-person: [collection, old index name].
// (The per-person ones are made by the server when it starts.)
const OLD_INDEXES = [["weightentries", "date_-1"]];

async function main() {
  const test = process.argv.includes("--test");
  const apply = process.argv.includes("--apply");
  await mongoose.connect(process.env.MONGODB_URI, test ? { dbName: TEST_DB_NAME } : {});
  const db = mongoose.connection.db;
  console.log(`Database: ${db.databaseName} (${test ? "TEST" : "REAL"} data) — ${apply ? "APPLYING" : "dry run: nothing is changed"}`);

  const admins = await db.collection("users").find({ role: "admin" }).sort({ createdAt: 1 }).toArray();
  if (!admins.length) throw new Error("There's no admin account yet: run create_admin.js first.");
  const admin = admins[0];
  console.log(`Owner for records without one: the admin, ${admin._id}`);

  const unowned = { $or: [{ owner: { $exists: false } }, { owner: null }] };
  let total = 0;
  for (const name of OWNED) {
    const collection = db.collection(name);
    const count = await collection.countDocuments(unowned);
    total += count;
    if (!count) continue;
    if (apply) {
      const { modifiedCount } = await collection.updateMany(unowned, { $set: { owner: admin._id } });
      console.log(`  ${name}: ${modifiedCount} given to the admin`);
    } else {
      console.log(`  ${name}: ${count} without an owner`);
    }
  }
  console.log(`${total} record(s) ${apply ? "given an owner" : "would be given an owner"}.`);

  for (const [name, index] of OLD_INDEXES) {
    const exists = (await db.collection(name).indexes().catch(() => [])).some((i) => i.name === index);
    if (!exists) continue;
    if (apply) {
      await db.collection(name).dropIndex(index);
      console.log(`  ${name}: removed the old rule ${index}`);
    } else {
      console.log(`  ${name}: would remove the old rule ${index}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
