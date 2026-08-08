// Dumps every collection needed to re-seed a fresh database — taxonomy
// (categories/brands/tags/storage locations/stores) plus the entity data
// itself (ingredients, recipes, meals, pantry items, meal-plan entries) —
// to individual JSON files. Read-only: never writes to the database.
//
// Run once by hand: node manual_controls/scripts/export_all_data.js
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

import IngredientCategory from "../../models/IngredientCategory.js";
import Brand from "../../models/Brand.js";
import Tag from "../../models/Tag.js";
import StorageLocation from "../../models/StorageLocation.js";
import Store from "../../models/Store.js";
import RecipeCategory from "../../models/RecipeCategory.js";
import Ingredient from "../../models/Ingredient.js";
import Recipe from "../../models/Recipe.js";
import Meal from "../../models/Meal.js";
import PantryItem from "../../models/PantryItem.js";
import MealPlanEntry from "../../models/MealPlanEntry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "seed_data");

// Taxonomy first (nothing else depends on ordering for JSON export, but
// this groups related files together for anyone browsing the output).
const COLLECTIONS = [
  { name: "ingredientCategories", model: IngredientCategory },
  { name: "brands", model: Brand },
  { name: "tags", model: Tag },
  { name: "storageLocations", model: StorageLocation },
  { name: "stores", model: Store },
  { name: "recipeCategories", model: RecipeCategory },
  { name: "ingredients", model: Ingredient },
  { name: "recipes", model: Recipe },
  { name: "meals", model: Meal },
  { name: "pantryItems", model: PantryItem },
  { name: "mealPlanEntries", model: MealPlanEntry },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const { name, model } of COLLECTIONS) {
    const docs = await model.find({}).lean();
    const filePath = path.join(OUTPUT_DIR, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
    console.log(`${name}: ${docs.length} document(s) -> ${filePath}`);
  }

  console.log(`\nDone. Exported to ${OUTPUT_DIR}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
