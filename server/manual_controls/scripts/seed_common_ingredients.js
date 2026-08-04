/**
 * One-time additive seed: common Western + Eastern pantry staples, as
 * generic ingredients. Purely additive — for each staple, an existing
 * ingredient with the same name (case-insensitive) is left untouched and
 * skipped; nothing already in the catalog is modified or deleted.
 * Categories are found-or-created by name, reusing whatever category
 * already exists under that name.
 *
 * Connects directly to MongoDB via MONGODB_URI (server/.env) — the API
 * server does not need to be running.
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/seed_common_ingredients.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

import Ingredient from "../../models/Ingredient.js";
import IngredientCategory from "../../models/IngredientCategory.js";

dotenv.config();

// [name, category, defaultPortionAmount, defaultPortionUnit]
const STAPLES = [
  // Baking
  ["Sugar", "Baking", 1, "cup"],
  ["Brown Sugar", "Baking", 1, "cup"],
  ["Baking Soda", "Baking", 1, "tsp"],
  ["Vanilla Extract", "Baking", 1, "tsp"],
  ["Honey", "Baking", 1, "tbsp"],

  // Dairy & Eggs
  ["Butter", "Dairy & Eggs", 1, "tbsp"],
  ["Milk", "Dairy & Eggs", 1, "cup"],
  ["Heavy Cream", "Dairy & Eggs", 1, "cup"],
  ["Yogurt", "Dairy & Eggs", 1, "cup"],

  // Cheese
  ["Cheddar Cheese", "Cheese", 1, "cup"],
  ["Mozzarella Cheese", "Cheese", 1, "cup"],

  // Vegetables
  ["Carrot", "Vegetables", 1, "item"],
  ["Potato", "Vegetables", 1, "item"],
  ["Bell Pepper", "Vegetables", 1, "item"],
  ["Tomato", "Vegetables", 1, "item"],
  ["Broccoli", "Vegetables", 1, "cup"],
  ["Spinach", "Vegetables", 1, "cup"],
  ["Mushroom", "Vegetables", 1, "cup"],
  ["Green Onion", "Vegetables", 1, "stalk"],

  // Fruits
  ["Lemon", "Fruits", 1, "item"],
  ["Lime", "Fruits", 1, "item"],

  // Protein
  ["Chicken Breast", "Protein", 1, "lb"],
  ["Chicken Thigh", "Protein", 1, "lb"],
  ["Ground Beef", "Protein", 1, "lb"],
  ["Bacon", "Protein", 4, "slice"],
  ["Salmon", "Protein", 1, "fillet"],
  ["Shrimp", "Protein", 1, "lb"],
  ["Tofu", "Protein", 1, "block"],

  // Grains & Cereals
  ["White Rice", "Grains & Cereals", 1, "cup"],
  ["Brown Rice", "Grains & Cereals", 1, "cup"],

  // Legumes & Pulses
  ["Black Beans", "Legumes & Pulses", 1, "cup"],
  ["Chickpeas", "Legumes & Pulses", 1, "cup"],
  ["Lentils", "Legumes & Pulses", 1, "cup"],

  // Noodles & Pasta
  ["Spaghetti", "Noodles & Pasta", 1, "lb"],
  ["Udon Noodles", "Noodles & Pasta", 1, "package"],
  ["Soba Noodles", "Noodles & Pasta", 1, "package"],
  ["Ramen Noodles", "Noodles & Pasta", 1, "package"],

  // Oils & Fats
  ["Olive Oil", "Oils & Fats", 1, "tbsp"],
  ["Vegetable Oil", "Oils & Fats", 1, "tbsp"],
  ["Sesame Oil", "Oils & Fats", 1, "tsp"],

  // Condiments & Sauces
  ["Ketchup", "Condiments & Sauces", 1, "tbsp"],
  ["Mayonnaise", "Condiments & Sauces", 1, "tbsp"],
  ["Mustard", "Condiments & Sauces", 1, "tbsp"],
  ["Oyster Sauce", "Condiments & Sauces", 1, "tbsp"],
  ["Hoisin Sauce", "Condiments & Sauces", 1, "tbsp"],
  ["Rice Vinegar", "Condiments & Sauces", 1, "tbsp"],
  ["Fish Sauce", "Condiments & Sauces", 1, "tbsp"],
  ["Miso Paste", "Condiments & Sauces", 1, "tbsp"],

  // Seasonings & Spices
  ["Black Pepper", "Seasonings & Spices", 1, "tsp"],
  ["Salt", "Seasonings & Spices", 1, "tsp"],
  ["Cumin", "Seasonings & Spices", 1, "tsp"],
  ["Paprika", "Seasonings & Spices", 1, "tsp"],
  ["Chili Powder", "Seasonings & Spices", 1, "tsp"],
  ["Garlic Powder", "Seasonings & Spices", 1, "tsp"],
  ["Sesame Seeds", "Seasonings & Spices", 1, "tbsp"],
  ["Cinnamon", "Seasonings & Spices", 1, "tsp"],

  // Nuts & Seeds
  ["Peanuts", "Nuts & Seeds", 1, "cup"],
  ["Almonds", "Nuts & Seeds", 1, "cup"],

  // Stock & Soups
  ["Chicken Stock", "Stock & Soups", 1, "cup"],

  // Herbs
  ["Basil", "Herbs", 1, "tbsp"],
  ["Cilantro", "Herbs", 1, "tbsp"],
  ["Parsley", "Herbs", 1, "tbsp"],

  // Asian Pantry
  ["Nori", "Asian Pantry", 1, "sheet"],
  ["Bonito Flakes", "Asian Pantry", 1, "cup"],
  ["Furikake", "Asian Pantry", 1, "tbsp"],
  ["Curry Roux", "Asian Pantry", 1, "block"],
];

async function findOrCreateCategory(name, cache) {
  const normalizedName = name.toLowerCase();
  if (cache.has(normalizedName)) return cache.get(normalizedName);

  let category = await IngredientCategory.findOne({ normalizedName });
  if (!category) {
    category = await IngredientCategory.create({ name, normalizedName });
    console.log(`  created category "${name}"`);
  }
  cache.set(normalizedName, category);
  return category;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from server/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB (${mongoose.connection.name})`);

  const categoryCache = new Map();
  let created = 0;
  let skipped = 0;

  for (const [name, categoryName, defaultPortionAmount, defaultPortionUnit] of STAPLES) {
    const existing = await Ingredient.findOne({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    const category = await findOrCreateCategory(categoryName, categoryCache);

    await Ingredient.create({
      name,
      category: category._id,
      isGeneric: true,
      defaultPortionAmount,
      defaultPortionUnit,
    });
    created += 1;
  }

  console.log(`Created ${created} ingredient(s), skipped ${skipped} already-present.`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
