/**
 * One-time backfill: extended nutrients (sugar, fat breakdown, cholesterol,
 * potassium, vitamins A/C, calcium, iron) for every restaurant dish that
 * existed before extended tracking — the restaurant-side counterpart to
 * backfill_extended_nutrients.js.
 *
 * Values are per dish as logged (the same serving the stored core values
 * describe). Chain items use published nutrition where known (Chick-fil-A
 * sandwich, Chipotle's per-ingredient values); everything else is estimated
 * from the dish's described components with typical composition, kept
 * consistent with the stored core values (fat breakdown within total fat,
 * sugar within carbs).
 *
 * Also fixes Varuni Napoli's pizza: fiber and sodium were swapped (fiber
 * 2000 g / sodium 7 mg -> fiber 7 g / sodium 2000 mg), and "Pixza" -> "Pizza".
 *
 * Only fills extended fields that are still empty. Backs up every restaurant
 * first to manual_controls/seeds/restaurant_meals_extended_nutrients_backup.json
 * (skipped if it already exists).
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/backfill_restaurant_extended_nutrients.js [--dry-run]
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import RestaurantMeal from "../../models/RestaurantMeal.js";
import { EXTENDED_NUTRITION_FIELD_NAMES } from "../../models/nutritionSchema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_PATH = path.join(__dirname, "..", "seeds", "restaurant_meals_extended_nutrients_backup.json");

const dryRun = process.argv.includes("--dry-run");

// dish _id -> [sugar, satFat, polyFat, monoFat, transFat, cholesterol mg,
//              potassium mg, vitamin A mcg, vitamin C mg, calcium mg, iron mg]
const VALUES = {
  "6a98d57a30498deb30c30ecb": [7, 4, 5, 11, 0, 105, 900, 150, 40, 120, 3.5],     // Cava Chicken Bowl
  "6a9a0131a447dd80eb113421": [6, 3.5, 7, 6, 0, 70, 380, 10, 0, 60, 2.7],       // Chick-fil-A Chicken Sandwich
  "6aa8afdce9e4ec39061d7497": [8, 5, 4, 6, 0, 115, 1100, 150, 45, 200, 7],      // Chipotle Chicken Burrito
  "6aa96410e9e4ec39061d752e": [5, 9, 3, 11, 0.8, 120, 900, 150, 20, 120, 6],    // Lanzhou Beef Stew Knife Cut Noodles
  "6a9c679d08dec8a7013fe74c": [2, 7, 2, 9, 0.5, 55, 330, 20, 4, 60, 2.5],       // Little Rey Steak Taco
  "6a9c679d08dec8a7013fe74d": [3.5, 0.1, 0.4, 0.3, 0, 0, 250, 15, 15, 10, 0.5], // Little Rey Salsa Verde
  "6a9c679d08dec8a7013fe74e": [1.2, 0, 0, 0, 0, 0, 110, 20, 8, 8, 0.2],         // Little Rey Pico de Gallo
  "6a99e884eaa4ac3b8f255099": [16, 34, 11, 45, 0.5, 260, 750, 60, 0, 25, 5],    // Ming's 3-Meat Combo
  "6a99e884eaa4ac3b8f25509a": [4, 7, 2, 8, 0.6, 110, 650, 20, 3, 60, 4.5],      // Ming's Beef Brisket Noodle Soup
  "6a98dc37069d5efdd45f5d85": [6, 11, 8, 15, 0.2, 110, 600, 40, 3, 60, 3.5],    // Okiboru Paitan Tsukemen
  "6a98dc37069d5efdd45f5d86": [9, 1.2, 3, 3, 0, 0, 950, 110, 150, 130, 4],      // Okiboru Shoyu Brussels
  "6a98d0ed30498deb30c30eb4": [1, 1.5, 5, 3.5, 0.1, 110, 150, 30, 1, 40, 1],    // Shoyu Izakaya Shrimp Tempura
  "6a98d0ed30498deb30c30eb5": [12, 4, 5, 7, 0, 120, 800, 150, 3, 80, 3],        // Shoyu Izakaya Sushi Assortment
  "6a98d0ed30498deb30c30eb6": [1, 5, 9, 12, 0.2, 130, 400, 30, 1, 20, 1.5],     // Shoyu Izakaya Chicken Karaage
  "6a9b3a05811c74470f660c11": [10, 24, 4, 20, 1, 110, 900, 350, 10, 750, 8],    // Varuni Napoli Mushroom Pizza
  "6aa83c0c39127d92b0c7b78f": [8, 4.5, 4, 11, 0, 150, 700, 600, 6, 40, 1.5],    // Wagaya Eel and Avocado Roll
  "6aa83c0c39127d92b0c7b790": [7, 2, 4, 5, 0, 60, 400, 60, 3, 40, 1.5],         // Wagaya Nigiri Sushi Set
  "6aa83c0c39127d92b0c7b791": [14, 6, 9, 12, 0.1, 130, 850, 120, 5, 80, 3],     // Wagaya Nigiri Set + Yellowtail Roll
};

const PIZZA_DISH_ID = "6a9b3a05811c74470f660c11";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const restaurants = await RestaurantMeal.find({});

  if (!dryRun && !fs.existsSync(BACKUP_PATH)) {
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(restaurants.map((r) => r.toObject()), null, 2));
    console.log(`Backed up ${restaurants.length} restaurant(s) to ${BACKUP_PATH}`);
  }

  let dishesUpdated = 0;
  let fieldsSet = 0;
  const seen = new Set();

  for (const restaurant of restaurants) {
    let changed = false;
    for (const dish of restaurant.dishes) {
      const id = String(dish._id);

      if (id === PIZZA_DISH_ID && dish.nutrition?.fiber === 2000 && dish.nutrition?.sodium === 7) {
        dish.nutrition.fiber = 7;
        dish.nutrition.sodium = 2000;
        dish.name = dish.name.replace("Pixza", "Pizza");
        console.log(`Fixed "${dish.name}": fiber/sodium swap, name typo`);
        changed = true;
      }

      const values = VALUES[id];
      if (!values) continue;
      seen.add(id);
      let dishChanged = false;
      EXTENDED_NUTRITION_FIELD_NAMES.forEach((field, index) => {
        if (dish.nutrition?.[field] != null) return;
        dish.nutrition[field] = values[index];
        fieldsSet++;
        dishChanged = true;
      });
      if (dishChanged) {
        dishesUpdated++;
        changed = true;
      }
    }
    if (changed && !dryRun) await restaurant.save();
  }

  const missing = Object.keys(VALUES).filter((id) => !seen.has(id));
  console.log(`${dishesUpdated} dish(es), ${fieldsSet} field(s)${missing.length ? `; not found: ${missing.join(", ")}` : ""}.`);
  if (dryRun) console.log("Dry run — nothing written.");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
