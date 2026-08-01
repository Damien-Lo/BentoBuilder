/**
 * One-time migration: copies every document from the `mealtags` collection
 * into the new shared `tags` collection, preserving `_id`s so existing
 * `Meal.tags` ObjectId references keep resolving once `Meal.tags` is
 * repointed from `MealTag` to `Tag`. Skips documents that already exist in
 * `tags` (by _id), so it's safe to run more than once.
 *
 * Connects directly to MongoDB via MONGODB_URI (server/.env) — the API
 * server does not need to be running.
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/migrate_meal_tags_to_tags.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

import MealTag from "../../models/MealTag.js";
import Tag from "../../models/Tag.js";

dotenv.config();

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from server/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB (${mongoose.connection.name})`);

  const mealTags = await MealTag.find().lean();
  console.log(`Found ${mealTags.length} document(s) in mealtags`);

  let copied = 0;
  let skipped = 0;

  for (const doc of mealTags) {
    const existing = await Tag.findById(doc._id);
    if (existing) {
      skipped += 1;
      continue;
    }

    await Tag.create({
      _id: doc._id,
      name: doc.name,
      normalizedName: doc.normalizedName,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
    copied += 1;
  }

  console.log(`Copied ${copied} document(s), skipped ${skipped} already-present document(s)`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
