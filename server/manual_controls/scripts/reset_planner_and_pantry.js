// Full reset of meal-plan history and pantry stock, requested once the
// ingredient/recipe audit confirmed the rest of the data is solid. Hard
// deletes (not archives) — a real reset, not a hide. Ingredients, Recipes,
// Meals, and GroceryItems are left untouched.
//
// Always back up first: node manual_controls/scripts/backup_all_data.js
// Then run:               node manual_controls/scripts/reset_planner_and_pantry.js
import "dotenv/config";
import mongoose from "mongoose";
import MealPlanEntry from "../../models/MealPlanEntry.js";
import PantryItem from "../../models/PantryItem.js";
import GroceryItem from "../../models/GroceryItem.js";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Clear the one dangling reference this would otherwise create: a
  // completed GroceryItem pointing at a pantry item that's about to be
  // deleted. Leaves the item's status/name/etc. alone.
  const clearedRefs = await GroceryItem.updateMany(
    { pantryItem: { $ne: null } },
    { $set: { pantryItem: null } },
  );
  console.log(`Cleared pantryItem reference on ${clearedRefs.modifiedCount} grocery item(s).`);

  const entriesRes = await MealPlanEntry.deleteMany({});
  console.log(`Deleted ${entriesRes.deletedCount} meal-plan entr(y/ies).`);

  const pantryRes = await PantryItem.deleteMany({});
  console.log(`Deleted ${pantryRes.deletedCount} pantry item(s).`);

  console.log("\nDone.");
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
