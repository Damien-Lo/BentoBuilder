// Puts back the pantry entries saved in a backup file (see
// manual_controls/seeds/pantry_items_backup_*.json), exactly as they were:
// same ids, dates and amounts. Entries that still exist are left alone, so
// it's safe to run twice, and anything added to the pantry since stays.
//
//   node manual_controls/scripts/restore_pantry_backup.js [file] [--dry-run]
//
// Run from the server folder. Defaults to the 2026-10-13 backup.
import "dotenv/config";
import fs from "node:fs";
import mongoose from "mongoose";

import PantryItem from "../../models/PantryItem.js";

const file = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "manual_controls/seeds/pantry_items_backup_2026-10-13.json";
const { items, currentIds } = JSON.parse(fs.readFileSync(file, "utf8"));

await mongoose.connect(process.env.MONGODB_URI);
const wanted = items.filter((item) => currentIds.includes(String(item._id)));
const there = new Set((await PantryItem.find({ _id: { $in: wanted.map((i) => i._id) } }).select("_id").lean()).map((i) => String(i._id)));
const missing = wanted.filter((item) => !there.has(String(item._id)));
// (Written straight to the collection: these are whole documents, ids and all.)
const docs = missing.map((item) => new PantryItem(item).toObject({ depopulate: true }));
if (process.argv.includes("--dry-run")) {
  console.log("dry run; first to put back:", docs[0]);
} else if (docs.length) {
  await PantryItem.collection.insertMany(docs);
}
console.log(`${missing.length} ${process.argv.includes("--dry-run") ? "would be" : ""} put back, ${there.size} were already there (${wanted.length} in the backup).`);
await mongoose.disconnect();
