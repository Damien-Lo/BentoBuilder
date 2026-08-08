/**
 * Generic ingredient seed script.
 *
 * Usage (run from the server/ directory):
 *   node seeds/seed_generic_ingredients.js           — seed only (skips nothing, may dupe if re-run)
 *   node seeds/seed_generic_ingredients.js --reset   — permanently deletes all existing Generic ingredients first, then seeds fresh
 *
 * Requires the server to be running on port 5050.
 */

const BASE_URL = "http://localhost:5050";
const RESET = process.argv.includes("--reset");

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(`GET ${path} failed: ${json.message}`);
  return json.data;
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`POST ${path} failed: ${json.message}`);
  return json.data;
}

async function del(path, permanent = false) {
  const url = permanent ? `${BASE_URL}${path}?permanent=true` : `${BASE_URL}${path}`;
  const res = await fetch(url, { method: "DELETE" });
  const json = await res.json();
  if (!json.success) throw new Error(`DELETE ${path} failed: ${json.message}`);
  return json.data;
}

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORY_NAMES = [
  "Protein",
  "Vegetables",
  "Fruits",
  "Grains & Cereals",
  "Noodles & Pasta",
  "Dairy & Eggs",
  "Oils & Fats",
  "Condiments & Sauces",
  "Seasonings & Spices",
  "Nuts & Seeds",
  "Legumes & Pulses",
  "Baked Goods & Pantry",
  "Beverages & Stock",
  "Asian Pantry",
  "Snacks & Confectionery",
];

// ─── Ingredients ──────────────────────────────────────────────────────────────
// Each nutrition object is per one serving (defaultPortionAmount + defaultPortionUnit).

const INGREDIENTS = [

  // ── Protein ────────────────────────────────────────────────────────────────
  { name: "Chicken Breast",         category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 165, protein: 31,  carbs: 0,    fats: 3.6,  fiber: 0,   sodium: 74   } },
  { name: "Chicken Thigh",          category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 209, protein: 26,  carbs: 0,    fats: 11,   fiber: 0,   sodium: 88   } },
  { name: "Ground Beef (80/20)",    category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 254, protein: 17,  carbs: 0,    fats: 20,   fiber: 0,   sodium: 72   } },
  { name: "Ground Beef (93/7)",     category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 152, protein: 21,  carbs: 0,    fats: 7,    fiber: 0,   sodium: 69   } },
  { name: "Beef Sirloin Steak",     category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 207, protein: 26,  carbs: 0,    fats: 11,   fiber: 0,   sodium: 58   } },
  { name: "Pork Belly",             category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 518, protein: 9,   carbs: 0,    fats: 53,   fiber: 0,   sodium: 34   } },
  { name: "Pork Chop",              category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 231, protein: 25,  carbs: 0,    fats: 14,   fiber: 0,   sodium: 53   } },
  { name: "Pork Mince",             category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 263, protein: 18,  carbs: 0,    fats: 21,   fiber: 0,   sodium: 62   } },
  { name: "Salmon Fillet",          category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 208, protein: 20,  carbs: 0,    fats: 13,   fiber: 0,   sodium: 59   } },
  { name: "Tuna (canned)",          category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 116, protein: 26,  carbs: 0,    fats: 1,    fiber: 0,   sodium: 320  } },
  { name: "Prawns / Shrimp",        category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 99,  protein: 24,  carbs: 0.2,  fats: 0.3,  fiber: 0,   sodium: 111  } },
  { name: "Egg",                    category: "Protein",             portion: 1,   unit: "egg",           nutrition: { calories: 72,  protein: 6,   carbs: 0.4,  fats: 5,    fiber: 0,   sodium: 71   } },
  { name: "Bacon",                  category: "Protein",             portion: 2,   unit: "slices",        nutrition: { calories: 87,  protein: 6,   carbs: 0,    fats: 7,    fiber: 0,   sodium: 356  } },
  { name: "Firm Tofu",              category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 76,  protein: 8,   carbs: 2,    fats: 4,    fiber: 0.3, sodium: 7    } },
  { name: "Silken Tofu",            category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 55,  protein: 5.3, carbs: 2.4,  fats: 2.7,  fiber: 0,   sodium: 14   } },
  { name: "Aburaage (Fried Tofu Pocket)", category: "Protein",       portion: 40,  unit: "g (1 piece)",   nutrition: { calories: 132, protein: 7.4, carbs: 1.7,  fats: 11,   fiber: 0,   sodium: 3    } },
  { name: "Tempeh",                 category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 193, protein: 19,  carbs: 9,    fats: 11,   fiber: 0,   sodium: 9    } },
  { name: "Lamb Chop",              category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 294, protein: 25,  carbs: 0,    fats: 21,   fiber: 0,   sodium: 72   } },
  { name: "Duck Breast",            category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 201, protein: 19,  carbs: 0,    fats: 13,   fiber: 0,   sodium: 65   } },
  { name: "Chinese Sausage (Lap Cheong)", category: "Protein",       portion: 40,  unit: "g (1 sausage)", nutrition: { calories: 150, protein: 7,   carbs: 3,    fats: 12,   fiber: 0,   sodium: 320  } },
  { name: "Dried Anchovies (Myeolchi)", category: "Protein",         portion: 15,  unit: "g",             nutrition: { calories: 40,  protein: 8.5, carbs: 0,    fats: 0.6,  fiber: 0,   sodium: 430  } },
  { name: "Bonito Flakes (Katsuobushi)", category: "Protein",        portion: 10,  unit: "g",             nutrition: { calories: 38,  protein: 8.6, carbs: 0,    fats: 0.3,  fiber: 0,   sodium: 115  } },
  { name: "Tofu Skin (Yuba)",       category: "Protein",             portion: 100, unit: "g",             nutrition: { calories: 162, protein: 17,  carbs: 6,    fats: 8,    fiber: 0,   sodium: 8    } },

  // ── Vegetables ─────────────────────────────────────────────────────────────
  { name: "Broccoli",               category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 34,  protein: 2.8, carbs: 7,    fats: 0.4,  fiber: 2.6, sodium: 33   } },
  { name: "Spinach",                category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 23,  protein: 2.9, carbs: 3.6,  fats: 0.4,  fiber: 2.2, sodium: 79   } },
  { name: "Brown Onion",            category: "Vegetables",          portion: 1,   unit: "medium (110g)", nutrition: { calories: 44,  protein: 1.2, carbs: 10,   fats: 0.1,  fiber: 1.9, sodium: 4    } },
  { name: "Garlic",                 category: "Vegetables",          portion: 1,   unit: "clove (3g)",    nutrition: { calories: 4,   protein: 0.2, carbs: 1,    fats: 0,    fiber: 0.1, sodium: 0    } },
  { name: "Carrot",                 category: "Vegetables",          portion: 1,   unit: "medium (61g)",  nutrition: { calories: 25,  protein: 0.6, carbs: 6,    fats: 0.1,  fiber: 1.7, sodium: 42   } },
  { name: "Tomato",                 category: "Vegetables",          portion: 1,   unit: "medium (123g)", nutrition: { calories: 22,  protein: 1.1, carbs: 4.8,  fats: 0.2,  fiber: 1.5, sodium: 6    } },
  { name: "Red Bell Pepper",        category: "Vegetables",          portion: 1,   unit: "medium (119g)", nutrition: { calories: 31,  protein: 1,   carbs: 7.2,  fats: 0.3,  fiber: 2.5, sodium: 4    } },
  { name: "Zucchini",               category: "Vegetables",          portion: 1,   unit: "medium (196g)", nutrition: { calories: 33,  protein: 2.4, carbs: 6.1,  fats: 0.6,  fiber: 2,   sodium: 16   } },
  { name: "Mushrooms",              category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 22,  protein: 3.1, carbs: 3.3,  fats: 0.3,  fiber: 1,   sodium: 5    } },
  { name: "Potato",                 category: "Vegetables",          portion: 1,   unit: "medium (150g)", nutrition: { calories: 130, protein: 3.5, carbs: 30,   fats: 0.1,  fiber: 3.3, sodium: 10   } },
  { name: "Sweet Potato",           category: "Vegetables",          portion: 1,   unit: "medium (130g)", nutrition: { calories: 112, protein: 2,   carbs: 26,   fats: 0.1,  fiber: 3.8, sodium: 72   } },
  { name: "Cabbage",                category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 25,  protein: 1.3, carbs: 5.8,  fats: 0.1,  fiber: 2.5, sodium: 18   } },
  { name: "Kale",                   category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 49,  protein: 4.3, carbs: 9,    fats: 0.9,  fiber: 3.6, sodium: 38   } },
  { name: "Eggplant",               category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 25,  protein: 1,   carbs: 5.9,  fats: 0.2,  fiber: 3,   sodium: 2    } },
  { name: "Green Beans",            category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 31,  protein: 1.8, carbs: 7,    fats: 0.1,  fiber: 2.7, sodium: 6    } },
  { name: "Celery",                 category: "Vegetables",          portion: 1,   unit: "stalk (40g)",   nutrition: { calories: 6,   protein: 0.3, carbs: 1.2,  fats: 0.1,  fiber: 0.6, sodium: 32   } },
  { name: "Corn",                   category: "Vegetables",          portion: 1,   unit: "ear (77g)",     nutrition: { calories: 77,  protein: 2.9, carbs: 17,   fats: 1.1,  fiber: 2.4, sodium: 14   } },
  { name: "Asparagus",              category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 20,  protein: 2.2, carbs: 3.9,  fats: 0.1,  fiber: 2.1, sodium: 2    } },
  { name: "Bok Choy",               category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 13,  protein: 1.5, carbs: 2.2,  fats: 0.2,  fiber: 1,   sodium: 65   } },
  { name: "Bean Sprouts",           category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 30,  protein: 3,   carbs: 5.9,  fats: 0.2,  fiber: 1.8, sodium: 6    } },
  { name: "Leek",                   category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 61,  protein: 1.5, carbs: 14,   fats: 0.3,  fiber: 1.8, sodium: 20   } },
  { name: "Spring Onion",           category: "Vegetables",          portion: 1,   unit: "stalk (15g)",   nutrition: { calories: 5,   protein: 0.3, carbs: 1,    fats: 0,    fiber: 0.4, sodium: 5    } },
  { name: "Cherry Tomatoes",        category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 18,  protein: 0.9, carbs: 3.9,  fats: 0.2,  fiber: 1.2, sodium: 5    } },
  { name: "Ginger (fresh)",         category: "Vegetables",          portion: 1,   unit: "tsp (2g)",      nutrition: { calories: 2,   protein: 0,   carbs: 0.4,  fats: 0,    fiber: 0,   sodium: 0    } },
  { name: "Nori Sheets",            category: "Vegetables",          portion: 1,   unit: "sheet (2.5g)",  nutrition: { calories: 10,  protein: 1,   carbs: 1.3,  fats: 0.1,  fiber: 0.4, sodium: 9    } },
  { name: "Wakame (dried)",         category: "Vegetables",          portion: 10,  unit: "g",             nutrition: { calories: 25,  protein: 1.8, carbs: 4.1,  fats: 0.4,  fiber: 0.5, sodium: 423  } },
  { name: "Kombu",                  category: "Vegetables",          portion: 10,  unit: "g",             nutrition: { calories: 17,  protein: 0.6, carbs: 3.6,  fats: 0.3,  fiber: 0.5, sodium: 233  } },
  { name: "Dried Shiitake Mushrooms", category: "Vegetables",        portion: 10,  unit: "g (dry)",       nutrition: { calories: 25,  protein: 1.8, carbs: 5.5,  fats: 0.2,  fiber: 1.5, sodium: 4    } },
  { name: "Water Chestnuts",        category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 35,  protein: 0.5, carbs: 8.6,  fats: 0,    fiber: 2,   sodium: 11   } },
  { name: "Kimchi",                 category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 23,  protein: 1.7, carbs: 4.1,  fats: 0.5,  fiber: 1.6, sodium: 498  } },
  { name: "Daikon Radish",          category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 18,  protein: 0.6, carbs: 4.1,  fats: 0.1,  fiber: 1.6, sodium: 21   } },
  { name: "Perilla Leaves (Kkaennip)", category: "Vegetables",       portion: 100, unit: "g",             nutrition: { calories: 35,  protein: 3.8, carbs: 7,    fats: 0.7,  fiber: 1.8, sodium: 1    } },
  { name: "Enoki Mushrooms",        category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 37,  protein: 2.7, carbs: 7.6,  fats: 0.3,  fiber: 2.7, sodium: 3    } },
  { name: "Shimeji Mushrooms",      category: "Vegetables",          portion: 100, unit: "g",             nutrition: { calories: 35,  protein: 3.3, carbs: 6.7,  fats: 0.3,  fiber: 2.7, sodium: 3    } },
  { name: "Chilli (fresh red)",     category: "Vegetables",          portion: 1,   unit: "chilli (15g)",  nutrition: { calories: 6,   protein: 0.3, carbs: 1.3,  fats: 0.1,  fiber: 0.5, sodium: 2    } },

  // ── Fruits ─────────────────────────────────────────────────────────────────
  { name: "Lemon",                  category: "Fruits",              portion: 1,   unit: "whole (58g)",   nutrition: { calories: 17,  protein: 0.6, carbs: 5.4,  fats: 0.2,  fiber: 1.6, sodium: 1    } },
  { name: "Lime",                   category: "Fruits",              portion: 1,   unit: "whole (44g)",   nutrition: { calories: 11,  protein: 0.3, carbs: 3.7,  fats: 0.1,  fiber: 1.2, sodium: 1    } },
  { name: "Orange",                 category: "Fruits",              portion: 1,   unit: "medium (131g)", nutrition: { calories: 62,  protein: 1.2, carbs: 15,   fats: 0.2,  fiber: 3.1, sodium: 0    } },
  { name: "Apple",                  category: "Fruits",              portion: 1,   unit: "medium (182g)", nutrition: { calories: 95,  protein: 0.5, carbs: 25,   fats: 0.3,  fiber: 4.4, sodium: 2    } },
  { name: "Banana",                 category: "Fruits",              portion: 1,   unit: "medium (118g)", nutrition: { calories: 105, protein: 1.3, carbs: 27,   fats: 0.4,  fiber: 3.1, sodium: 1    } },
  { name: "Avocado",                category: "Fruits",              portion: 0.5, unit: "avocado (68g)", nutrition: { calories: 114, protein: 1.3, carbs: 6.1,  fats: 10.5, fiber: 4.6, sodium: 5    } },
  { name: "Strawberries",           category: "Fruits",              portion: 100, unit: "g",             nutrition: { calories: 32,  protein: 0.7, carbs: 7.7,  fats: 0.3,  fiber: 2,   sodium: 1    } },
  { name: "Blueberries",            category: "Fruits",              portion: 100, unit: "g",             nutrition: { calories: 57,  protein: 0.7, carbs: 14,   fats: 0.3,  fiber: 2.4, sodium: 1    } },
  { name: "Mango",                  category: "Fruits",              portion: 100, unit: "g",             nutrition: { calories: 60,  protein: 0.8, carbs: 15,   fats: 0.4,  fiber: 1.6, sodium: 1    } },
  { name: "Pineapple",              category: "Fruits",              portion: 100, unit: "g",             nutrition: { calories: 50,  protein: 0.5, carbs: 13,   fats: 0.1,  fiber: 1.4, sodium: 1    } },

  // ── Grains & Cereals ───────────────────────────────────────────────────────
  { name: "White Rice (cooked)",    category: "Grains & Cereals",    portion: 100, unit: "g",             nutrition: { calories: 130, protein: 2.7, carbs: 28,   fats: 0.3,  fiber: 0.4, sodium: 1    } },
  { name: "Sushi Rice (cooked)",    category: "Grains & Cereals",    portion: 100, unit: "g",             nutrition: { calories: 150, protein: 2.5, carbs: 33,   fats: 0.4,  fiber: 0.3, sodium: 3    } },
  { name: "Brown Rice (cooked)",    category: "Grains & Cereals",    portion: 100, unit: "g",             nutrition: { calories: 123, protein: 2.7, carbs: 26,   fats: 1,    fiber: 1.8, sodium: 5    } },
  { name: "Oats (dry)",             category: "Grains & Cereals",    portion: 40,  unit: "g",             nutrition: { calories: 150, protein: 5,   carbs: 27,   fats: 3,    fiber: 4,   sodium: 0    } },
  { name: "Quinoa (cooked)",        category: "Grains & Cereals",    portion: 100, unit: "g",             nutrition: { calories: 120, protein: 4.4, carbs: 22,   fats: 1.9,  fiber: 2.8, sodium: 7    } },
  { name: "Couscous (cooked)",      category: "Grains & Cereals",    portion: 100, unit: "g",             nutrition: { calories: 112, protein: 3.8, carbs: 23,   fats: 0.2,  fiber: 1.4, sodium: 5    } },
  { name: "White Bread",            category: "Grains & Cereals",    portion: 1,   unit: "slice (28g)",   nutrition: { calories: 75,  protein: 2.7, carbs: 14,   fats: 1,    fiber: 0.6, sodium: 146  } },
  { name: "Barley (cooked)",        category: "Grains & Cereals",    portion: 100, unit: "g",             nutrition: { calories: 123, protein: 2.3, carbs: 28,   fats: 0.4,  fiber: 3.8, sodium: 3    } },

  // ── Noodles & Pasta ────────────────────────────────────────────────────────
  { name: "Spaghetti (cooked)",     category: "Noodles & Pasta",     portion: 100, unit: "g",             nutrition: { calories: 158, protein: 5.8, carbs: 31,   fats: 0.9,  fiber: 1.8, sodium: 1    } },
  { name: "Penne (cooked)",         category: "Noodles & Pasta",     portion: 100, unit: "g",             nutrition: { calories: 158, protein: 5.8, carbs: 31,   fats: 0.9,  fiber: 1.8, sodium: 1    } },
  { name: "Rice Noodles (cooked)",  category: "Noodles & Pasta",     portion: 100, unit: "g",             nutrition: { calories: 109, protein: 1.8, carbs: 25,   fats: 0.2,  fiber: 0.9, sodium: 1    } },
  { name: "Egg Noodles (cooked)",   category: "Noodles & Pasta",     portion: 100, unit: "g",             nutrition: { calories: 138, protein: 4.8, carbs: 25,   fats: 2.1,  fiber: 1.2, sodium: 8    } },
  { name: "Udon Noodles (cooked)",  category: "Noodles & Pasta",     portion: 100, unit: "g",             nutrition: { calories: 130, protein: 3.5, carbs: 28,   fats: 0.5,  fiber: 0.8, sodium: 215  } },
  { name: "Soba Noodles (cooked)",  category: "Noodles & Pasta",     portion: 100, unit: "g",             nutrition: { calories: 99,  protein: 5,   carbs: 21,   fats: 0.1,  fiber: 0,   sodium: 60   } },
  { name: "Ramen Noodles (dry)",    category: "Noodles & Pasta",     portion: 85,  unit: "g",             nutrition: { calories: 380, protein: 10,  carbs: 52,   fats: 14,   fiber: 2,   sodium: 1370 } },
  { name: "Glass Noodles (cooked)", category: "Noodles & Pasta",     portion: 100, unit: "g",             nutrition: { calories: 86,  protein: 0,   carbs: 21,   fats: 0,    fiber: 0.5, sodium: 8    } },
  { name: "Somen Noodles (cooked)", category: "Noodles & Pasta",     portion: 100, unit: "g",             nutrition: { calories: 127, protein: 3.5, carbs: 26,   fats: 0.4,  fiber: 0.7, sodium: 115  } },
  { name: "Rice Cake (Tteok)",      category: "Noodles & Pasta",     portion: 100, unit: "g",             nutrition: { calories: 211, protein: 3.8, carbs: 47,   fats: 0.4,  fiber: 0.7, sodium: 2    } },
  { name: "Lasagne Sheets (dry)",   category: "Noodles & Pasta",     portion: 100, unit: "g",             nutrition: { calories: 353, protein: 12,  carbs: 71,   fats: 2.5,  fiber: 2.4, sodium: 10   } },

  // ── Dairy & Eggs ───────────────────────────────────────────────────────────
  { name: "Whole Milk",             category: "Dairy & Eggs",        portion: 240, unit: "ml (1 cup)",    nutrition: { calories: 149, protein: 8,   carbs: 12,   fats: 8,    fiber: 0,   sodium: 105  } },
  { name: "Heavy / Thickened Cream",category: "Dairy & Eggs",        portion: 30,  unit: "ml",            nutrition: { calories: 103, protein: 0.6, carbs: 0.8,  fats: 11,   fiber: 0,   sodium: 11   } },
  { name: "Butter",                 category: "Dairy & Eggs",        portion: 14,  unit: "g (1 tbsp)",    nutrition: { calories: 102, protein: 0.1, carbs: 0,    fats: 11.5, fiber: 0,   sodium: 82   } },
  { name: "Cheddar Cheese",         category: "Dairy & Eggs",        portion: 30,  unit: "g",             nutrition: { calories: 113, protein: 7,   carbs: 0.4,  fats: 9.3,  fiber: 0,   sodium: 174  } },
  { name: "Mozzarella Cheese",      category: "Dairy & Eggs",        portion: 30,  unit: "g",             nutrition: { calories: 85,  protein: 6.3, carbs: 0.6,  fats: 6.3,  fiber: 0,   sodium: 163  } },
  { name: "Parmesan Cheese",        category: "Dairy & Eggs",        portion: 5,   unit: "g (1 tbsp)",    nutrition: { calories: 22,  protein: 2,   carbs: 0.2,  fats: 1.4,  fiber: 0,   sodium: 75   } },
  { name: "Greek Yogurt",           category: "Dairy & Eggs",        portion: 100, unit: "g",             nutrition: { calories: 59,  protein: 10,  carbs: 3.6,  fats: 0.4,  fiber: 0,   sodium: 36   } },
  { name: "Cream Cheese",           category: "Dairy & Eggs",        portion: 30,  unit: "g",             nutrition: { calories: 104, protein: 1.8, carbs: 1.6,  fats: 10,   fiber: 0,   sodium: 100  } },
  { name: "Feta Cheese",            category: "Dairy & Eggs",        portion: 30,  unit: "g",             nutrition: { calories: 75,  protein: 4,   carbs: 1.2,  fats: 6,    fiber: 0,   sodium: 323  } },

  // ── Oils & Fats ────────────────────────────────────────────────────────────
  { name: "Olive Oil",              category: "Oils & Fats",         portion: 14,  unit: "g (1 tbsp)",    nutrition: { calories: 119, protein: 0,   carbs: 0,    fats: 13.5, fiber: 0,   sodium: 0    } },
  { name: "Vegetable Oil",          category: "Oils & Fats",         portion: 14,  unit: "g (1 tbsp)",    nutrition: { calories: 124, protein: 0,   carbs: 0,    fats: 14,   fiber: 0,   sodium: 0    } },
  { name: "Coconut Oil",            category: "Oils & Fats",         portion: 14,  unit: "g (1 tbsp)",    nutrition: { calories: 121, protein: 0,   carbs: 0,    fats: 13.6, fiber: 0,   sodium: 0    } },
  { name: "Sesame Oil",             category: "Oils & Fats",         portion: 14,  unit: "g (1 tbsp)",    nutrition: { calories: 120, protein: 0,   carbs: 0,    fats: 13.6, fiber: 0,   sodium: 0    } },
  { name: "Canola Oil",             category: "Oils & Fats",         portion: 14,  unit: "g (1 tbsp)",    nutrition: { calories: 124, protein: 0,   carbs: 0,    fats: 14,   fiber: 0,   sodium: 0    } },

  // ── Condiments & Sauces ────────────────────────────────────────────────────
  { name: "Soy Sauce",              category: "Condiments & Sauces", portion: 16,  unit: "g (1 tbsp)",    nutrition: { calories: 8,   protein: 1.3, carbs: 0.8,  fats: 0,    fiber: 0,   sodium: 902  } },
  { name: "Dark Soy Sauce",         category: "Condiments & Sauces", portion: 16,  unit: "g (1 tbsp)",    nutrition: { calories: 10,  protein: 1,   carbs: 1.5,  fats: 0,    fiber: 0,   sodium: 800  } },
  { name: "Fish Sauce",             category: "Condiments & Sauces", portion: 18,  unit: "g (1 tbsp)",    nutrition: { calories: 6,   protein: 0.9, carbs: 0.7,  fats: 0,    fiber: 0,   sodium: 1413 } },
  { name: "Oyster Sauce",           category: "Condiments & Sauces", portion: 18,  unit: "g (1 tbsp)",    nutrition: { calories: 9,   protein: 0.2, carbs: 2.2,  fats: 0,    fiber: 0,   sodium: 492  } },
  { name: "Hoisin Sauce",           category: "Condiments & Sauces", portion: 16,  unit: "g (1 tbsp)",    nutrition: { calories: 35,  protein: 0.5, carbs: 7,    fats: 0.5,  fiber: 0.4, sodium: 258  } },
  { name: "Ponzu Sauce",            category: "Condiments & Sauces", portion: 15,  unit: "ml (1 tbsp)",   nutrition: { calories: 14,  protein: 0.7, carbs: 2.8,  fats: 0,    fiber: 0,   sodium: 350  } },
  { name: "Japanese Mayonnaise (Kewpie)", category: "Condiments & Sauces", portion: 15, unit: "g (1 tbsp)", nutrition: { calories: 100, protein: 0.3, carbs: 0.5, fats: 11, fiber: 0, sodium: 115 } },
  { name: "Wasabi Paste",           category: "Condiments & Sauces", portion: 5,   unit: "g (1 tsp)",     nutrition: { calories: 4,   protein: 0.2, carbs: 0.7,  fats: 0.1,  fiber: 0.2, sodium: 20   } },
  { name: "Gochujang",              category: "Condiments & Sauces", portion: 18,  unit: "g (1 tbsp)",    nutrition: { calories: 30,  protein: 0.6, carbs: 7,    fats: 0.2,  fiber: 0.3, sodium: 370  } },
  { name: "Doenjang (Korean Soybean Paste)", category: "Condiments & Sauces", portion: 18, unit: "g (1 tbsp)", nutrition: { calories: 37, protein: 2.3, carbs: 5.2, fats: 1.1, fiber: 0.6, sodium: 485 } },
  { name: "Doubanjiang (Spicy Bean Paste)", category: "Condiments & Sauces", portion: 16, unit: "g (1 tbsp)", nutrition: { calories: 25, protein: 1, carbs: 3, fats: 1, fiber: 0.4, sodium: 590 } },
  { name: "Black Bean Sauce",       category: "Condiments & Sauces", portion: 16,  unit: "g (1 tbsp)",    nutrition: { calories: 30,  protein: 2,   carbs: 4,    fats: 0.5,  fiber: 0.5, sodium: 490  } },
  { name: "Char Siu Sauce",         category: "Condiments & Sauces", portion: 18,  unit: "g (1 tbsp)",    nutrition: { calories: 35,  protein: 0.5, carbs: 8,    fats: 0.1,  fiber: 0.1, sodium: 280  } },
  { name: "Chinkiang Black Vinegar",category: "Condiments & Sauces", portion: 15,  unit: "ml (1 tbsp)",   nutrition: { calories: 10,  protein: 0.5, carbs: 2,    fats: 0,    fiber: 0,   sodium: 60   } },
  { name: "Yuzu Juice",             category: "Condiments & Sauces", portion: 15,  unit: "ml (1 tbsp)",   nutrition: { calories: 3,   protein: 0.1, carbs: 0.9,  fats: 0,    fiber: 0.1, sodium: 0    } },
  { name: "Tomato Paste",           category: "Condiments & Sauces", portion: 33,  unit: "g (2 tbsp)",    nutrition: { calories: 27,  protein: 1.5, carbs: 6.2,  fats: 0.2,  fiber: 1.4, sodium: 259  } },
  { name: "Passata / Tomato Sauce", category: "Condiments & Sauces", portion: 63,  unit: "g (¼ cup)",     nutrition: { calories: 17,  protein: 0.7, carbs: 3.7,  fats: 0.3,  fiber: 0.8, sodium: 136  } },
  { name: "Ketchup",                category: "Condiments & Sauces", portion: 17,  unit: "g (1 tbsp)",    nutrition: { calories: 19,  protein: 0.3, carbs: 4.7,  fats: 0,    fiber: 0.1, sodium: 154  } },
  { name: "Mayonnaise",             category: "Condiments & Sauces", portion: 14,  unit: "g (1 tbsp)",    nutrition: { calories: 94,  protein: 0.1, carbs: 0.1,  fats: 10.4, fiber: 0,   sodium: 89   } },
  { name: "Dijon Mustard",          category: "Condiments & Sauces", portion: 5,   unit: "g (1 tsp)",     nutrition: { calories: 3,   protein: 0.2, carbs: 0.3,  fats: 0.2,  fiber: 0.1, sodium: 120  } },
  { name: "Worcestershire Sauce",   category: "Condiments & Sauces", portion: 5,   unit: "g (1 tsp)",     nutrition: { calories: 4,   protein: 0,   carbs: 1,    fats: 0,    fiber: 0,   sodium: 65   } },
  { name: "Hot Sauce",              category: "Condiments & Sauces", portion: 5,   unit: "g (1 tsp)",     nutrition: { calories: 1,   protein: 0,   carbs: 0.1,  fats: 0,    fiber: 0,   sodium: 95   } },
  { name: "Coconut Milk",           category: "Condiments & Sauces", portion: 60,  unit: "ml (¼ cup)",    nutrition: { calories: 89,  protein: 0.9, carbs: 1.8,  fats: 9.6,  fiber: 0,   sodium: 10   } },
  { name: "White Wine Vinegar",     category: "Condiments & Sauces", portion: 15,  unit: "ml (1 tbsp)",   nutrition: { calories: 3,   protein: 0,   carbs: 0.1,  fats: 0,    fiber: 0,   sodium: 0    } },
  { name: "Apple Cider Vinegar",    category: "Condiments & Sauces", portion: 15,  unit: "ml (1 tbsp)",   nutrition: { calories: 3,   protein: 0,   carbs: 0.1,  fats: 0,    fiber: 0,   sodium: 0    } },
  { name: "Balsamic Vinegar",       category: "Condiments & Sauces", portion: 16,  unit: "g (1 tbsp)",    nutrition: { calories: 14,  protein: 0,   carbs: 2.7,  fats: 0,    fiber: 0,   sodium: 4    } },
  { name: "Rice Vinegar",           category: "Condiments & Sauces", portion: 15,  unit: "ml (1 tbsp)",   nutrition: { calories: 2,   protein: 0,   carbs: 0.1,  fats: 0,    fiber: 0,   sodium: 0    } },
  { name: "Honey",                  category: "Condiments & Sauces", portion: 21,  unit: "g (1 tbsp)",    nutrition: { calories: 64,  protein: 0.1, carbs: 17.3, fats: 0,    fiber: 0,   sodium: 0    } },
  { name: "Maple Syrup",            category: "Condiments & Sauces", portion: 20,  unit: "g (1 tbsp)",    nutrition: { calories: 52,  protein: 0,   carbs: 13.4, fats: 0,    fiber: 0,   sodium: 2    } },
  { name: "Lemon Juice",            category: "Condiments & Sauces", portion: 15,  unit: "ml (1 tbsp)",   nutrition: { calories: 4,   protein: 0.1, carbs: 1.3,  fats: 0,    fiber: 0.1, sodium: 0    } },

  // ── Seasonings & Spices ────────────────────────────────────────────────────
  { name: "Salt",                   category: "Seasonings & Spices", portion: 6,   unit: "g (1 tsp)",     nutrition: { calories: 0,   protein: 0,   carbs: 0,    fats: 0,    fiber: 0,   sodium: 2325 } },
  { name: "Black Pepper",           category: "Seasonings & Spices", portion: 2.3, unit: "g (1 tsp)",     nutrition: { calories: 6,   protein: 0.2, carbs: 1.5,  fats: 0.1,  fiber: 0.6, sodium: 0    } },
  { name: "Garlic Powder",          category: "Seasonings & Spices", portion: 2.8, unit: "g (1 tsp)",     nutrition: { calories: 9,   protein: 0.5, carbs: 2,    fats: 0,    fiber: 0.3, sodium: 1    } },
  { name: "Onion Powder",           category: "Seasonings & Spices", portion: 2.5, unit: "g (1 tsp)",     nutrition: { calories: 8,   protein: 0.2, carbs: 1.9,  fats: 0,    fiber: 0.4, sodium: 1    } },
  { name: "Paprika",                category: "Seasonings & Spices", portion: 2.3, unit: "g (1 tsp)",     nutrition: { calories: 6,   protein: 0.3, carbs: 1.2,  fats: 0.3,  fiber: 0.8, sodium: 2    } },
  { name: "Smoked Paprika",         category: "Seasonings & Spices", portion: 2.3, unit: "g (1 tsp)",     nutrition: { calories: 6,   protein: 0.3, carbs: 1.2,  fats: 0.3,  fiber: 0.8, sodium: 2    } },
  { name: "Cumin",                  category: "Seasonings & Spices", portion: 2.1, unit: "g (1 tsp)",     nutrition: { calories: 8,   protein: 0.4, carbs: 0.9,  fats: 0.5,  fiber: 0.2, sodium: 4    } },
  { name: "Turmeric",               category: "Seasonings & Spices", portion: 3,   unit: "g (1 tsp)",     nutrition: { calories: 8,   protein: 0.2, carbs: 1.4,  fats: 0.3,  fiber: 0.5, sodium: 1    } },
  { name: "Cinnamon",               category: "Seasonings & Spices", portion: 2.6, unit: "g (1 tsp)",     nutrition: { calories: 6,   protein: 0.1, carbs: 2,    fats: 0,    fiber: 1.4, sodium: 0    } },
  { name: "Dried Oregano",          category: "Seasonings & Spices", portion: 1,   unit: "g (1 tsp)",     nutrition: { calories: 3,   protein: 0.1, carbs: 0.6,  fats: 0.1,  fiber: 0.4, sodium: 0    } },
  { name: "Dried Thyme",            category: "Seasonings & Spices", portion: 1,   unit: "g (1 tsp)",     nutrition: { calories: 3,   protein: 0.1, carbs: 0.7,  fats: 0,    fiber: 0.5, sodium: 0    } },
  { name: "Dried Rosemary",         category: "Seasonings & Spices", portion: 1,   unit: "g (1 tsp)",     nutrition: { calories: 2,   protein: 0.1, carbs: 0.5,  fats: 0.1,  fiber: 0.3, sodium: 0    } },
  { name: "Dried Basil",            category: "Seasonings & Spices", portion: 1,   unit: "g (1 tsp)",     nutrition: { calories: 1,   protein: 0.1, carbs: 0.2,  fats: 0,    fiber: 0.2, sodium: 0    } },
  { name: "Chilli Flakes",          category: "Seasonings & Spices", portion: 2.7, unit: "g (1 tsp)",     nutrition: { calories: 8,   protein: 0.4, carbs: 1.4,  fats: 0.4,  fiber: 0.7, sodium: 2    } },
  { name: "Cayenne Pepper",         category: "Seasonings & Spices", portion: 1.8, unit: "g (1 tsp)",     nutrition: { calories: 6,   protein: 0.2, carbs: 1,    fats: 0.3,  fiber: 0.5, sodium: 1    } },
  { name: "Gochugaru (Korean Chilli Flakes)", category: "Seasonings & Spices", portion: 2.7, unit: "g (1 tsp)", nutrition: { calories: 9, protein: 0.4, carbs: 1.8, fats: 0.4, fiber: 0.7, sodium: 3 } },
  { name: "Sichuan Peppercorns",    category: "Seasonings & Spices", portion: 2,   unit: "g (1 tsp)",     nutrition: { calories: 7,   protein: 0.3, carbs: 1.2,  fats: 0.4,  fiber: 0.6, sodium: 2    } },
  { name: "Chinese Five Spice",     category: "Seasonings & Spices", portion: 2,   unit: "g (1 tsp)",     nutrition: { calories: 7,   protein: 0.3, carbs: 1.4,  fats: 0.3,  fiber: 0.6, sodium: 2    } },
  { name: "Shichimi Togarashi",     category: "Seasonings & Spices", portion: 2,   unit: "g (1 tsp)",     nutrition: { calories: 8,   protein: 0.4, carbs: 1.3,  fats: 0.4,  fiber: 0.5, sodium: 5    } },
  { name: "Furikake",               category: "Seasonings & Spices", portion: 5,   unit: "g (1 tsp)",     nutrition: { calories: 14,  protein: 1,   carbs: 2,    fats: 0.3,  fiber: 0.2, sodium: 120  } },
  { name: "Italian Seasoning",      category: "Seasonings & Spices", portion: 1,   unit: "g (1 tsp)",     nutrition: { calories: 4,   protein: 0.1, carbs: 0.8,  fats: 0.1,  fiber: 0.5, sodium: 1    } },
  { name: "Ginger (ground)",        category: "Seasonings & Spices", portion: 1.8, unit: "g (1 tsp)",     nutrition: { calories: 6,   protein: 0.2, carbs: 1.3,  fats: 0.1,  fiber: 0.1, sodium: 1    } },
  { name: "Star Anise",             category: "Seasonings & Spices", portion: 2,   unit: "g (1 pod)",     nutrition: { calories: 7,   protein: 0.3, carbs: 1,    fats: 0.4,  fiber: 0.3, sodium: 0    } },
  { name: "Bay Leaves",             category: "Seasonings & Spices", portion: 0.6, unit: "g (1 leaf)",    nutrition: { calories: 2,   protein: 0,   carbs: 0.4,  fats: 0,    fiber: 0.2, sodium: 0    } },
  { name: "Coriander (ground)",     category: "Seasonings & Spices", portion: 1.8, unit: "g (1 tsp)",     nutrition: { calories: 6,   protein: 0.2, carbs: 1,    fats: 0.4,  fiber: 0.7, sodium: 1    } },
  { name: "White Sugar",            category: "Seasonings & Spices", portion: 4,   unit: "g (1 tsp)",     nutrition: { calories: 16,  protein: 0,   carbs: 4.2,  fats: 0,    fiber: 0,   sodium: 0    } },
  { name: "Brown Sugar",            category: "Seasonings & Spices", portion: 4,   unit: "g (1 tsp)",     nutrition: { calories: 15,  protein: 0,   carbs: 4,    fats: 0,    fiber: 0,   sodium: 1    } },
  { name: "Fresh Parsley",          category: "Seasonings & Spices", portion: 4,   unit: "g (1 tbsp)",    nutrition: { calories: 1,   protein: 0.1, carbs: 0.2,  fats: 0,    fiber: 0.1, sodium: 2    } },
  { name: "Fresh Coriander",        category: "Seasonings & Spices", portion: 4,   unit: "g (1 tbsp)",    nutrition: { calories: 1,   protein: 0.1, carbs: 0.1,  fats: 0,    fiber: 0.1, sodium: 2    } },
  { name: "Fresh Basil",            category: "Seasonings & Spices", portion: 4,   unit: "g (1 tbsp)",    nutrition: { calories: 1,   protein: 0.1, carbs: 0.2,  fats: 0,    fiber: 0.1, sodium: 0    } },
  { name: "Dashi Powder",           category: "Seasonings & Spices", portion: 5,   unit: "g (1 tsp)",     nutrition: { calories: 12,  protein: 1.2, carbs: 0.9,  fats: 0.5,  fiber: 0,   sodium: 980  } },

  // ── Nuts & Seeds ───────────────────────────────────────────────────────────
  { name: "Almonds",                category: "Nuts & Seeds",        portion: 28,  unit: "g (1 oz)",      nutrition: { calories: 164, protein: 6,   carbs: 6,    fats: 14,   fiber: 3.5, sodium: 0    } },
  { name: "Walnuts",                category: "Nuts & Seeds",        portion: 28,  unit: "g (1 oz)",      nutrition: { calories: 185, protein: 4.3, carbs: 3.9,  fats: 18.5, fiber: 1.9, sodium: 1    } },
  { name: "Cashews",                category: "Nuts & Seeds",        portion: 28,  unit: "g (1 oz)",      nutrition: { calories: 157, protein: 5.2, carbs: 8.6,  fats: 12.4, fiber: 0.9, sodium: 3    } },
  { name: "Peanuts",                category: "Nuts & Seeds",        portion: 28,  unit: "g (1 oz)",      nutrition: { calories: 161, protein: 7.3, carbs: 4.6,  fats: 14,   fiber: 2.4, sodium: 5    } },
  { name: "Sesame Seeds",           category: "Nuts & Seeds",        portion: 9,   unit: "g (1 tbsp)",    nutrition: { calories: 52,  protein: 1.6, carbs: 2.1,  fats: 4.5,  fiber: 1.1, sodium: 1    } },
  { name: "Peanut Butter",          category: "Nuts & Seeds",        portion: 32,  unit: "g (2 tbsp)",    nutrition: { calories: 188, protein: 8,   carbs: 6,    fats: 16,   fiber: 2,   sodium: 147  } },
  { name: "Tahini",                 category: "Nuts & Seeds",        portion: 15,  unit: "g (1 tbsp)",    nutrition: { calories: 89,  protein: 2.5, carbs: 3.2,  fats: 8,    fiber: 0.7, sodium: 17   } },

  // ── Legumes & Pulses ───────────────────────────────────────────────────────
  { name: "Chickpeas (cooked)",     category: "Legumes & Pulses",    portion: 100, unit: "g",             nutrition: { calories: 164, protein: 8.9, carbs: 27,   fats: 2.6,  fiber: 7.6, sodium: 7    } },
  { name: "Black Beans (cooked)",   category: "Legumes & Pulses",    portion: 100, unit: "g",             nutrition: { calories: 132, protein: 8.9, carbs: 24,   fats: 0.5,  fiber: 8.7, sodium: 1    } },
  { name: "Red Lentils (cooked)",   category: "Legumes & Pulses",    portion: 100, unit: "g",             nutrition: { calories: 116, protein: 9,   carbs: 20,   fats: 0.4,  fiber: 7.9, sodium: 2    } },
  { name: "Kidney Beans (cooked)",  category: "Legumes & Pulses",    portion: 100, unit: "g",             nutrition: { calories: 127, protein: 8.7, carbs: 23,   fats: 0.5,  fiber: 6.4, sodium: 2    } },
  { name: "Edamame (cooked)",       category: "Legumes & Pulses",    portion: 100, unit: "g",             nutrition: { calories: 121, protein: 11,  carbs: 8.9,  fats: 5.2,  fiber: 5.2, sodium: 6    } },

  // ── Baked Goods & Pantry ───────────────────────────────────────────────────
  { name: "Plain Flour",            category: "Baked Goods & Pantry",portion: 30,  unit: "g (¼ cup)",     nutrition: { calories: 110, protein: 3,   carbs: 23,   fats: 0.3,  fiber: 0.8, sodium: 0    } },
  { name: "Breadcrumbs",            category: "Baked Goods & Pantry",portion: 27,  unit: "g (¼ cup)",     nutrition: { calories: 106, protein: 3.5, carbs: 19,   fats: 1.5,  fiber: 0.9, sodium: 208  } },
  { name: "Panko Breadcrumbs",      category: "Baked Goods & Pantry",portion: 30,  unit: "g (¼ cup)",     nutrition: { calories: 110, protein: 4,   carbs: 21,   fats: 1.5,  fiber: 0.8, sodium: 160  } },
  { name: "Cornstarch",             category: "Baked Goods & Pantry",portion: 8,   unit: "g (1 tbsp)",    nutrition: { calories: 30,  protein: 0,   carbs: 7.3,  fats: 0,    fiber: 0.1, sodium: 0    } },
  { name: "Baking Powder",          category: "Baked Goods & Pantry",portion: 4,   unit: "g (1 tsp)",     nutrition: { calories: 2,   protein: 0,   carbs: 1.2,  fats: 0,    fiber: 0,   sodium: 488  } },
  { name: "Baking Soda",            category: "Baked Goods & Pantry",portion: 4,   unit: "g (1 tsp)",     nutrition: { calories: 0,   protein: 0,   carbs: 0,    fats: 0,    fiber: 0,   sodium: 1259 } },
  { name: "Vanilla Extract",        category: "Baked Goods & Pantry",portion: 4.2, unit: "g (1 tsp)",     nutrition: { calories: 12,  protein: 0,   carbs: 0.5,  fats: 0,    fiber: 0,   sodium: 0    } },
  { name: "Cocoa Powder",           category: "Baked Goods & Pantry",portion: 7,   unit: "g (1 tbsp)",    nutrition: { calories: 12,  protein: 1,   carbs: 3,    fats: 0.7,  fiber: 1.8, sodium: 0    } },
  { name: "Wonton Wrappers",        category: "Baked Goods & Pantry",portion: 70,  unit: "g (10 wrappers)", nutrition: { calories: 160, protein: 5.3, carbs: 32, fats: 1.3, fiber: 1,  sodium: 290  } },
  { name: "Dumpling Wrappers (Gyoza)", category: "Baked Goods & Pantry", portion: 70, unit: "g (10 wrappers)", nutrition: { calories: 160, protein: 5.3, carbs: 32, fats: 1.3, fiber: 1, sodium: 290 } },
  { name: "Spring Roll Wrappers",   category: "Baked Goods & Pantry",portion: 50,  unit: "g (5 sheets)",  nutrition: { calories: 145, protein: 3.5, carbs: 30,   fats: 1,    fiber: 0.8, sodium: 160  } },

  // ── Beverages & Stock ──────────────────────────────────────────────────────
  { name: "Chicken Stock",          category: "Beverages & Stock",   portion: 240, unit: "ml (1 cup)",    nutrition: { calories: 38,  protein: 4.8, carbs: 1.4,  fats: 1.4,  fiber: 0,   sodium: 924  } },
  { name: "Beef Stock",             category: "Beverages & Stock",   portion: 240, unit: "ml (1 cup)",    nutrition: { calories: 17,  protein: 2.9, carbs: 0,    fats: 0.5,  fiber: 0,   sodium: 782  } },
  { name: "Vegetable Stock",        category: "Beverages & Stock",   portion: 240, unit: "ml (1 cup)",    nutrition: { calories: 12,  protein: 0.6, carbs: 2.3,  fats: 0.3,  fiber: 0,   sodium: 550  } },
  { name: "Dashi Stock",            category: "Beverages & Stock",   portion: 240, unit: "ml (1 cup)",    nutrition: { calories: 5,   protein: 0.5, carbs: 0.7,  fats: 0,    fiber: 0,   sodium: 430  } },
  { name: "Anchovy Stock (Myeolchi Yuksu)", category: "Beverages & Stock", portion: 240, unit: "ml (1 cup)", nutrition: { calories: 7, protein: 1, carbs: 0.3, fats: 0.2, fiber: 0, sodium: 350 } },
  { name: "Red Wine",               category: "Beverages & Stock",   portion: 100, unit: "ml",            nutrition: { calories: 85,  protein: 0.1, carbs: 2.5,  fats: 0,    fiber: 0,   sodium: 6    } },
  { name: "White Wine",             category: "Beverages & Stock",   portion: 100, unit: "ml",            nutrition: { calories: 82,  protein: 0.1, carbs: 2.6,  fats: 0,    fiber: 0,   sodium: 5    } },

  // ── Asian Pantry ───────────────────────────────────────────────────────────
  { name: "Miso Paste (White/Shiro)", category: "Asian Pantry",      portion: 17,  unit: "g (1 tbsp)",    nutrition: { calories: 34,  protein: 2,   carbs: 4.7,  fats: 1,    fiber: 0.5, sodium: 634  } },
  { name: "Miso Paste (Red/Aka)",   category: "Asian Pantry",        portion: 17,  unit: "g (1 tbsp)",    nutrition: { calories: 31,  protein: 2,   carbs: 4,    fats: 0.9,  fiber: 0.5, sodium: 760  } },
  { name: "Mirin",                  category: "Asian Pantry",        portion: 15,  unit: "ml (1 tbsp)",   nutrition: { calories: 45,  protein: 0,   carbs: 11,   fats: 0,    fiber: 0,   sodium: 3    } },
  { name: "Sake (cooking)",         category: "Asian Pantry",        portion: 60,  unit: "ml (¼ cup)",    nutrition: { calories: 63,  protein: 0.3, carbs: 2,    fats: 0,    fiber: 0,   sodium: 2    } },
  { name: "Shaoxing Rice Wine",     category: "Asian Pantry",        portion: 30,  unit: "ml (2 tbsp)",   nutrition: { calories: 40,  protein: 0.5, carbs: 3,    fats: 0,    fiber: 0,   sodium: 10   } },
  { name: "Sushi Vinegar (Seasoned Rice Vinegar)", category: "Asian Pantry", portion: 15, unit: "ml (1 tbsp)", nutrition: { calories: 9, protein: 0, carbs: 2.3, fats: 0, fiber: 0, sodium: 240 } },
  { name: "Toasted Sesame Paste",   category: "Asian Pantry",        portion: 15,  unit: "g (1 tbsp)",    nutrition: { calories: 89,  protein: 2.5, carbs: 3.2,  fats: 8,    fiber: 0.7, sodium: 8    } },
  { name: "Tsuyu (Noodle Dipping Sauce)", category: "Asian Pantry",  portion: 30,  unit: "ml (2 tbsp)",   nutrition: { calories: 14,  protein: 1,   carbs: 2.5,  fats: 0,    fiber: 0,   sodium: 580  } },
  { name: "Korean Doenjang Jjigae Base", category: "Asian Pantry",   portion: 18,  unit: "g (1 tbsp)",    nutrition: { calories: 40,  protein: 2.5, carbs: 5.5,  fats: 1.2,  fiber: 0.6, sodium: 510  } },

  // ── Snacks & Confectionery ─────────────────────────────────────────────────
  { name: "Dark Chocolate (70%)",   category: "Snacks & Confectionery", portion: 30, unit: "g",            nutrition: { calories: 170, protein: 2.2, carbs: 13,   fats: 12,   fiber: 3.1, sodium: 6    } },
  { name: "Dark Chocolate Chips",   category: "Snacks & Confectionery", portion: 30, unit: "g",            nutrition: { calories: 170, protein: 1.9, carbs: 18,   fats: 10,   fiber: 2,   sodium: 5    } },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`\n🌱  Generic ingredient seed${RESET ? " (--reset mode)" : ""}\n`);

  // Step 0 — if --reset, archive all existing Generic ingredients
  if (RESET) {
    console.log("🗑️   Deleting existing Generic ingredients...");

    let brandId = null;
    try {
      const genericBrand = await post("/api/brands", { name: "Generic" });
      brandId = genericBrand._id;
    } catch {
      console.log("  No Generic brand found, skipping cleanup.\n");
    }

    if (brandId) {
      const allIngredients = await get("/api/ingredients");
      const genericOnes = allIngredients.filter((ing) => {
        const b = ing.brand;
        if (!b) return false;
        if (typeof b === "string") return b === brandId;
        return b._id === brandId || b.name === "Generic";
      });

      let deleted = 0;
      for (const ing of genericOnes) {
        try {
          await del(`/api/ingredients/${ing._id}`, true);
          deleted++;
        } catch {
          // ignore individual failures
        }
      }
      console.log(`  ✓ Deleted ${deleted} ingredient(s)\n`);
    }
  }

  // Step 1 — create / find the Generic brand
  console.log('Creating "Generic" brand...');
  const brand = await post("/api/brands", { name: "Generic" });
  const brandId = brand._id;
  console.log(`  ✓ Brand ID: ${brandId}\n`);

  // Step 2 — create / find all categories
  console.log("Creating categories...");
  const categoryMap = {};
  for (const name of CATEGORY_NAMES) {
    const cat = await post("/api/categories", { name });
    categoryMap[name] = cat._id;
    console.log(`  ✓ ${name}`);
  }
  console.log();

  // Step 3 — create ingredients
  console.log(`Creating ${INGREDIENTS.length} ingredients...\n`);
  let created = 0;
  let failed = 0;

  for (const ing of INGREDIENTS) {
    try {
      await post("/api/ingredients", {
        name: ing.name,
        brand: brandId,
        category: categoryMap[ing.category],
        defaultPortionAmount: ing.portion,
        defaultPortionUnit: ing.unit,
        nutritionBasis: "per-serving",
        nutrition: ing.nutrition,
      });
      console.log(`  ✓ ${ing.name}`);
      created++;
    } catch (err) {
      console.log(`  ⚠ ${ing.name} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✅  Done — ${created} created, ${failed} failed.`);
}

seed().catch((err) => {
  console.error("\n❌  Seed failed:", err.message);
  process.exit(1);
});
