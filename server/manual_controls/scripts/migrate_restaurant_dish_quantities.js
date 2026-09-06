// One-time migration: MealPlanEntry.restaurantDishIds (a flat array of dish
// ids, implicitly "1 of each") -> restaurantDishSelections (an array of
// {dish, quantity}, so a visit can record "2 tacos" without touching the
// shared dish's base definition in the RestaurantMeal catalog). Every
// existing entry gets quantity: 1 per dish, which is exactly what the old
// flat-array shape always meant. Uses the raw driver (not the Mongoose
// model) so it reads the old field correctly regardless of whether the
// schema change has already been deployed to this process.
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name}`);

  const coll = mongoose.connection.db.collection("mealplanentries");

  const cursor = coll.find({ restaurantDishIds: { $exists: true, $ne: [] } });
  let migrated = 0;
  for await (const doc of cursor) {
    const selections = doc.restaurantDishIds.map((dishId) => ({ dish: dishId, quantity: 1 }));
    await coll.updateOne(
      { _id: doc._id },
      { $set: { restaurantDishSelections: selections }, $unset: { restaurantDishIds: "" } },
    );
    migrated++;
  }

  console.log(`Migrated ${migrated} entr${migrated === 1 ? "y" : "ies"} from restaurantDishIds -> restaurantDishSelections.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
