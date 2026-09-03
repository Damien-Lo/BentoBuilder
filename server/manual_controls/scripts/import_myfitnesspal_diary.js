// One-time backfill: replays the Aug 10-30 2026 MyFitnessPal diary into the
// meal planner, now that all the underlying ingredients/recipes/restaurant
// meals it needs have been built. Also clears the grocery list first (per
// explicit request - a fresh start now that real daily use is starting).
//
// Entries are created directly with status "confirmed" (semantically
// correct - these were actually eaten) but WITHOUT going through the
// /confirm endpoint, so stockDeductions stays empty and no real pantry
// stock gets touched for a backdated entry. computeConfirmedRecipeNutrition
// already falls back to the recipe/ingredient snapshot when stockDeductions
// is empty, so nutrition display is unaffected.
//
// Matching policy (deliberately simple, applied uniformly):
//  - Exact/near-exact recipe name match (e.g. "Miso soup" -> Miso Soup) -> recipe entry.
//  - Clear branded restaurant venue (Cava, Chick-fil-A, Shoyu Izakaya, etc.)
//    -> restaurant entry, all dishes eaten in that sitting on one entry via
//    restaurantDishIds. A repeated identical dish (e.g. 2 Chick-fil-A
//    sandwiches) becomes two entries, since the schema has no per-dish
//    quantity.
//  - Everything else -> individual ingredient entry, using the diary's
//    stated quantity/unit as-is (the app's unit conversion handles the rest).
//  - No reasonable catalog match at all -> left out, reported at the end.
//  - Clusters already explicitly skipped per TODO.md (Aug 19 sashimi
//    dinner, Aug 22 sushi lunch, Aug 23-24 HK takeout minus Gejang, Aug 25
//    wasabi, Aug 27 cluster, Aug 28 beans/octopus/bolognese) are skipped
//    here too, matching that earlier decision.

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import Ingredient from "../../models/Ingredient.js";
import Recipe from "../../models/Recipe.js";
import RestaurantMeal from "../../models/RestaurantMeal.js";
import GroceryItem from "../../models/GroceryItem.js";
import MealPlanEntry from "../../models/MealPlanEntry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name}`);

  // ── Delete everything in the grocery list ──────────────────────────────
  const groceryDeleted = await GroceryItem.deleteMany({});
  console.log(`Deleted ${groceryDeleted.deletedCount} grocery list item(s).`);

  // ── Build name -> id lookup maps ────────────────────────────────────────
  const ingredients = await Ingredient.find({ isArchived: { $ne: true } });
  const recipes = await Recipe.find({});
  const restaurants = await RestaurantMeal.find({ isArchived: { $ne: true } });

  function findIngredient(name) {
    const match = ingredients.find(i => i.name === name);
    if (!match) throw new Error(`Ingredient not found: "${name}"`);
    return match._id;
  }
  function findRecipe(name) {
    const match = recipes.find(r => r.name === name);
    if (!match) throw new Error(`Recipe not found: "${name}"`);
    return match._id;
  }
  function findRestaurant(name) {
    const match = restaurants.find(r => r.restaurantName === name);
    if (!match) throw new Error(`Restaurant not found: "${name}"`);
    return match;
  }
  function findDish(restaurant, dishName) {
    const dish = restaurant.dishes.find(d => d.name === dishName);
    if (!dish) throw new Error(`Dish not found: "${dishName}" at "${restaurant.restaurantName}"`);
    return dish._id;
  }

  // ── Entry builders ───────────────────────────────────────────────────────
  function ing(name, quantity, unit) {
    return { ingredient: findIngredient(name), ingredientQuantity: quantity, ingredientUnit: unit };
  }
  function rec(name, servings = 1) {
    return { recipe: findRecipe(name), recipeServings: servings };
  }
  function rest(restaurantName, dishNames) {
    const restaurant = findRestaurant(restaurantName);
    return {
      restaurantMeal: restaurant._id,
      restaurantDishIds: dishNames.map(d => findDish(restaurant, d)),
    };
  }

  // ── Day-by-day diary replay ─────────────────────────────────────────────
  // { date, slot, ...entryFields }
  const days = [];
  function day(date, slot, ...entries) {
    for (const e of entries) days.push({ date, slot, ...e });
  }

  const ITO_EN = "ITO EN Green Tea, Unsweetened";
  const CORE_POWER = "Core Power Milk Shake, High Protein, Strawberry Banana";

  // Aug 10
  day("2026-08-10", "breakfast", ing(ITO_EN, 1, "bottle"), ing(CORE_POWER, 1, "bottle"));
  day("2026-08-10", "lunch", rest("Wagaya", ["Eel and Avocado Roll", "Nigiri Sushi Set"]));
  day("2026-08-10", "dinner", ing("Asparagus", 0.5, "cup"), ing("Filet Mignon", 113, "g"));
  // "Pasta with pesto sauce, 1 cup" (385cal) -- MISSING, no combined dish, flagged below.

  // Aug 11
  day("2026-08-11", "breakfast", ing(ITO_EN, 1, "bottle"), ing(CORE_POWER, 1, "bottle"));
  day("2026-08-11", "lunch", rest("Cava", ["Chicken Bowl (usual order)"]));

  // Aug 12
  day("2026-08-12", "breakfast",
    ing("Smoked Salmon", 85.5, "g"), ing("Mushroom", 1, "cup"), ing("Egg", 3, "egg"), ing(CORE_POWER, 1, "bottle"));
  day("2026-08-12", "lunch", rest("Cava", ["Chicken Bowl (usual order)"]));
  day("2026-08-12", "dinner",
    rest("Shoyu Izakaya", ["Shoya Sushi Assortment Set", "Shrimp Tempura"]));

  // Aug 13
  day("2026-08-13", "breakfast",
    ing("Smoked Salmon", 97, "g"), ing("Everything Bagel", 0.5, "serving"),
    ing("Egg", 3, "egg"), ing(CORE_POWER, 1, "bottle"));
  day("2026-08-13", "lunch", rest("Cava", ["Chicken Bowl (usual order)"]));
  day("2026-08-13", "dinner",
    rec("Chinese Smashed Cucumber Salad", 1),
    ing("Egg", 2, "egg"), ing("Greenland Rice Paper", 7, "sheet"),
    ing("Mushroom", 1, "cup"), ing("Asparagus", 0.5, "cup"), ing("Chicken Thigh", 159, "g"));

  // Aug 14
  day("2026-08-14", "breakfast", ing("Smoked Salmon", 45, "g"), ing("Egg", 3, "egg"), ing(CORE_POWER, 1, "bottle"));
  day("2026-08-14", "lunch",
    rest("Little Rey", ["Steak Tacos (flour tortilla)", "Salsa Verde", "Pico de Gallo"]));
  day("2026-08-14", "dinner",
    rec("Miso Soup", 1),
    rest("Shoyu Izakaya", ["Shoya Sushi Assortment Set", "Shrimp Tempura"]));

  // Aug 15
  day("2026-08-15", "breakfast", ing(CORE_POWER, 1, "bottle"));
  // Starbucks Iced Coffee (15cal), Eurest Fried Brussels Sprouts (362cal),
  // Silverlake Ramen Tsukemen (930cal) -- MISSING, flagged below.
  day("2026-08-15", "dinner",
    rec("Miso Soup", 1), ing("Egg", 1, "egg"), ing("Filet Mignon", 113, "g"), rec("Sushi Rice", 1));

  // Aug 16
  day("2026-08-16", "breakfast", ing(CORE_POWER, 1, "bottle"));
  day("2026-08-16", "lunch",
    ing("Memmi Noodle Soup Base", 4, "tbsp"), rec("Steamed Bok Choy", 1), rec("Miso Soup", 1),
    ing("Salmon Fillet", 126, "g"), ing("Soba Noodles", 100, "g"), ing("Sriracha", 1, "tsp"),
    ing("Honey", 1, "tbsp"), ing("Enoki Mushroom", 100, "g"),
    ing("Surasang Roasted Seaweed (Laver)", 2, "sheet"), ing("Greenland Rice Paper", 2, "sheet"));

  // Aug 17
  day("2026-08-17", "breakfast", ing(CORE_POWER, 1, "bottle"));
  day("2026-08-17", "dinner",
    rec("Miso Soup", 1),
    rest("Shoyu Izakaya", ["Chicken Karaage", "Shoya Sushi Assortment Set"]));

  // Aug 18
  day("2026-08-18", "breakfast", ing(CORE_POWER, 1, "bottle"));
  day("2026-08-18", "lunch",
    rest("Chick-fil-A", ["Chicken Sandwich"]),
    rest("Chick-fil-A", ["Chicken Sandwich", "Chick-fil-A Sauce"]));
  day("2026-08-18", "dinner",
    ing("Sliced Beef Brisket", 85, "g"), rec("Steamed Bok Choy", 1), rec("Miso Soup", 1),
    ing("SANUKIYA UDON", 200, "g"));
  // Shirakiku Fried Fish Cake Bobou Maki (100cal) -- MISSING, flagged below.

  // Aug 19
  day("2026-08-19", "breakfast", ing(CORE_POWER, 1, "bottle"));
  day("2026-08-19", "lunch", ing("Filet Mignon", 227, "g"));
  // "Pasta with pesto sauce, 2 cup" (770cal) -- MISSING, flagged below.
  // Dinner sashimi cluster explicitly skipped per TODO.md.

  // Aug 20
  day("2026-08-20", "breakfast", ing(CORE_POWER, 1, "bottle"));
  day("2026-08-20", "lunch",
    rest("Chick-fil-A", ["Chicken Sandwich"]),
    rest("Chick-fil-A", ["Chicken Sandwich", "Chick-fil-A Sauce"]));

  // Aug 21
  day("2026-08-21", "breakfast", ing(CORE_POWER, 1, "bottle"));
  day("2026-08-21", "lunch",
    rec("Miso Soup", 1), rec("Steamed Bok Choy", 1), ing("Cooked Koshihikari Rice", 0.5, "cup"),
    ing("Vacuum-Sealed Miso Chilean Sea Bass", 1, "bag"));
  day("2026-08-21", "dinner",
    ing("Egg", 4, "egg"), ing("Smoked Salmon", 100, "g"), ing("Everything Bagel", 0.5, "serving"));

  // Aug 22 -- sushi/sashimi cluster explicitly skipped per TODO.md; rest of day kept.
  day("2026-08-22", "breakfast", ing(CORE_POWER, 1, "bottle"));
  day("2026-08-22", "lunch", ing("Udon Noodles", 227, "g"), rec("Miso Soup", 1));
  day("2026-08-22", "dinner",
    ing("Egg", 4, "egg"), ing("Smoked Salmon", 100, "g"), ing("Everything Bagel", 0.5, "serving"));

  // Aug 23 -- HK takeout cluster explicitly skipped per TODO.md.
  day("2026-08-23", "breakfast", ing(CORE_POWER, 1, "bottle"));

  // Aug 24 -- HK takeout cluster skipped, EXCEPT Gejang (turned out home-eaten) and
  // the generic recurring items (Miso Soup, Chinese Tea Egg, rice, Bok Choy, udon).
  day("2026-08-24", "breakfast", ing(CORE_POWER, 1, "bottle"));
  day("2026-08-24", "lunch",
    ing("Gejang (Spicy Raw Crab)", 322, "g"), rec("Miso Soup", 1),
    rec("Chinese Tea Egg", 1), ing("Cooked Koshihikari Rice", 0.5, "cup"));
  day("2026-08-24", "dinner",
    rec("Steamed Bok Choy", 1), ing("SANUKIYA UDON", 200, "g"),
    rec("Chinese Tea Egg", 1), rec("Miso Soup", 1));
  // Shirakiku Fried Fish Cake (100cal) -- MISSING, flagged below.

  // Aug 25
  day("2026-08-25", "breakfast", ing(CORE_POWER, 1, "bottle"));
  day("2026-08-25", "lunch",
    ing("Kite Hill Mushroom & Ricotta Ravioli", 136, "g"), ing("Filet Mignon", 227, "g"),
    ing("Beef Tallow", 1, "tbsp"), ing("Asparagus", 0.5, "cup"));
  day("2026-08-25", "dinner",
    ing("Parmesan Cheese", 43, "g"), ing("Real Good Foods Chicken & Pepper Jack Burrito", 227, "g"));
  day("2026-08-25", "snack",
    ing("Light Soy Sauce", 2, "tbsp"), ing("Squid Sashimi", 97, "g"));
  // Wasabi 1tsp -- explicitly skipped per TODO.md (negligible).

  // Aug 26
  day("2026-08-26", "breakfast",
    ing("Smoked Salmon", 100, "g"), rec("Chinese Tea Egg", 1), ing(CORE_POWER, 1, "bottle"));
  day("2026-08-26", "lunch", rest("Cava", ["Chicken Bowl (usual order)"]));
  day("2026-08-26", "dinner",
    rest("Shoyu Izakaya", ["Shoya Sushi Assortment Set", "Shrimp Tempura"]));

  // Aug 27 -- named cluster items skipped per TODO.md; rest of day kept.
  day("2026-08-27", "breakfast", ing(CORE_POWER, 1, "bottle"));
  // Lunch remainder (salmon/shrimp/tuna nigiri, veg+shrimp tempura, ~472cal) -- MISSING, flagged below.
  day("2026-08-27", "dinner",
    rec("Miso Soup", 1), rec("Chinese Tea Egg", 1), rec("Steamed Bok Choy", 1),
    ing("SANUKIYA UDON", 200, "g"));
  day("2026-08-27", "snack", ing("Squid Sashimi", 45, "g"));
  // Shirakiku Fried Fish Cake (100cal) -- MISSING, flagged below.

  // Aug 28 -- beans/octopus/bolognese explicitly skipped per TODO.md; pesto was not.
  day("2026-08-28", "lunch", ing("Pesto", 60, "g"));
  day("2026-08-28", "dinner", ing("Real Good Foods Chicken & Pepper Jack Burrito", 227, "g"));

  // Aug 29 -- nothing logged in the diary.

  // Aug 30
  day("2026-08-30", "breakfast", ing(CORE_POWER, 1, "bottle"));
  day("2026-08-30", "lunch", ing("Asparagus", 0.5, "cup"), ing("Filet Mignon", 243, "g"));

  // ── Create ────────────────────────────────────────────────────────────
  let created = 0;
  for (const entry of days) {
    await MealPlanEntry.create({ ...entry, status: "confirmed" });
    created++;
  }
  console.log(`Created ${created} meal plan entries across the Aug 10-30 diary.`);

  console.log("\nFlagged as missing (no catalog match, not added):");
  console.log("- Pasta with pesto sauce (combined dish) -- Aug 10 (385cal), Aug 19 (770cal)");
  console.log("- Starbucks Unsweetened Iced Coffee -- Aug 15 (15cal)");
  console.log("- Eurest Fried Brussels Sprouts -- Aug 15 (362cal)");
  console.log("- Silverlake Ramen - The Tsukemen Base -- Aug 15 (930cal), possibly an unbuilt restaurant");
  console.log("- Shirakiku Fried Fish Cake Bobou Maki -- Aug 18, 24, 27 (100cal each)");
  console.log("- Aug 27 lunch remainder (individual salmon/shrimp/tuna nigiri + veg/shrimp tempura, ~472cal)");

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
