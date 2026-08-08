// PantryItem.lowStockThreshold was removed from the schema (dead duplicate
// of Ingredient.lowStockThreshold) earlier this project, but Mongoose
// dropping a field from the schema doesn't retroactively strip it from
// already-stored documents — it just stops the app from reading/writing it.
// This unsets the orphaned field from every pantry item so raw exports/DB
// browsing don't show stale, unused data.
//
// Run once by hand: node manual_controls/scripts/cleanup_orphaned_pantry_fields.js
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const result = await mongoose.connection.db
    .collection("pantryitems")
    .updateMany({ lowStockThreshold: { $exists: true } }, { $unset: { lowStockThreshold: "" } });

  console.log(`Removed orphaned lowStockThreshold from ${result.modifiedCount} pantry item(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
