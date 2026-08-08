// One-time cleanup: hard-deletes archived meal-plan entries whose target
// (recipe/meal/ingredient) is either a deleted document or the all-zero
// placeholder ObjectId — irrecoverable test/history rows with no UI path
// to clean them up otherwise (MealPlanRoutes.js's DELETE is soft-only).
//
// Run once by hand: node manual_controls/scripts/purge_broken_meal_plan_entries.js
import "dotenv/config";
import mongoose from "mongoose";
import MealPlanEntry from "../../models/MealPlanEntry.js";

const IDS = [
  "6a64e55a27a7e0265252d3e2",
  "6a64e85ddb351f36db4362ef",
  "6a64ee59cc28b5e345e4ccbc",
  "6a64ee5acc28b5e345e4ccbd",
  "6a64eeeacc28b5e345e4ccc4",
  "6a64ef1bcc28b5e345e4ccc6",
  "6a650509cc28b5e345e4cd01",
  "6a656b9244c74c50a5ecaee3",
  "6a6c18ca445c832657139610",
  "6a6ccc4c1fb5a37446be3231",
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const result = await MealPlanEntry.deleteMany({ _id: { $in: IDS } });
  console.log(`Deleted ${result.deletedCount} of ${IDS.length} broken meal-plan entries.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
