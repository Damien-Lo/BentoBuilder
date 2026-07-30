/**
 * Full data backup — dumps every Ingredient, PantryItem, Recipe,
 * GroceryItem, Meal, and MealPlanEntry document to JSON files in
 * manual_controls/seeds/, ahead of the pantry-deduction schema changes
 * (new fields on PantryItem/MealPlanEntry, pantry unit-family constraint).
 *
 * Connects directly to MongoDB via MONGODB_URI (server/.env) — the API
 * server does not need to be running.
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/backup_all_data.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Ingredient from "../../models/Ingredient.js";
import "../../models/IngredientCategory.js";
import "../../models/Brand.js";
import "../../models/StorageLocation.js";
import PantryItem from "../../models/PantryItem.js";
import Recipe from "../../models/Recipe.js";
import "../../models/RecipeCategory.js";
import GroceryItem from "../../models/GroceryItem.js";
import Meal from "../../models/Meal.js";
import "../../models/MealTag.js";
import MealPlanEntry from "../../models/MealPlanEntry.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "seeds");

function write(filename, data) {
  const outPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Wrote ${data.length} document(s) to ${outPath}`);
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from server/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB (${mongoose.connection.name})`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const ingredients = await Ingredient.find({})
    .populate("category")
    .populate("brand")
    .populate("genericParent")
    .sort({ name: 1 });
  write("ingredients_backup.json", ingredients);

  const pantryItems = await PantryItem.find({})
    .populate({
      path: "ingredient",
      populate: [{ path: "category" }, { path: "brand" }, { path: "genericParent" }],
    })
    .populate("storageLocation")
    .sort({ createdAt: 1 });
  write("pantry_items_backup.json", pantryItems);

  const recipes = await Recipe.find({})
    .populate("recipeCategory")
    .populate({
      path: "ingredientList.ingredient",
      populate: [{ path: "category" }, { path: "brand" }],
    })
    .sort({ name: 1 });
  write("recipes_backup.json", recipes);

  const groceryItems = await GroceryItem.find({})
    .populate("ingredient")
    .populate("pantryItem")
    .sort({ createdAt: 1 });
  write("grocery_items_backup.json", groceryItems);

  const meals = await Meal.find({})
    .populate("tags")
    .populate("courses.recipe")
    .populate("bentoLayout.sections.recipe")
    .sort({ name: 1 });
  write("meals_backup.json", meals);

  const mealPlanEntries = await MealPlanEntry.find({})
    .populate({
      path: "meal",
      populate: [{ path: "tags" }, { path: "courses.recipe" }],
    })
    .populate("recipe")
    .populate({
      path: "ingredient",
      populate: [{ path: "category" }, { path: "brand" }],
    })
    .sort({ date: 1 });
  write("meal_plan_entries_backup.json", mealPlanEntries);

  console.log("Backup complete.");

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Backup failed:", error);
  process.exit(1);
});
