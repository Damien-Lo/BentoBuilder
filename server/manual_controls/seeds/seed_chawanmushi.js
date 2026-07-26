/**
 * Seed: Chawanmushi (Japanese Savory Steamed Egg Custard)
 * Source: https://www.justonecookbook.com/chawanmushi-savory-steamed-egg-custard/
 *
 * Run from the server/ directory (server must be running):
 *   node seeds/seed_chawanmushi.js
 *
 * Missing ingredients are created automatically as Generic brand.
 */

const BASE_URL = "http://localhost:5050";

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

// Case-insensitive fuzzy match: exact first, then substring, then first word
function fuzzyFind(list, name, key = "name") {
  const q = name.toLowerCase();
  return (
    list.find((i) => i[key].toLowerCase() === q) ||
    list.find((i) => i[key].toLowerCase().includes(q)) ||
    list.find((i) => i[key].toLowerCase().includes(q.split(" ")[0]))
  );
}

// Find category by name, creating it if it doesn't exist
async function ensureCategory(categories, name) {
  let cat = fuzzyFind(categories, name);
  if (!cat) {
    console.log(`  + Creating category "${name}"`);
    cat = await post("/api/categories", { name });
    categories.push(cat);
  }
  return cat;
}

// Find ingredient by name; create it as Generic if missing
async function ensureIngredient(ingredients, categories, { name, categoryName, nutrition }) {
  const existing = fuzzyFind(ingredients, name);
  if (existing) {
    console.log(`  ✓ "${name}" → matched "${existing.name}"`);
    return existing;
  }

  const category = await ensureCategory(categories, categoryName);
  console.log(`  + Creating ingredient "${name}" (${categoryName})`);

  const created = await post("/api/ingredients", {
    name,
    category: category._id,
    brand: null,
    ...(nutrition ? { nutrition, nutritionBasis: "per-serving" } : {}),
  });

  ingredients.push(created);
  return created;
}

async function seed() {
  console.log("\n🥚  Seeding: Chawanmushi (Japanese Savory Steamed Egg Custard)\n");

  const [allIngredients, allCategories] = await Promise.all([
    get("/api/ingredients"),
    get("/api/categories"),
  ]);

  console.log(`Found ${allIngredients.length} ingredients, ${allCategories.length} categories\n`);

  // Ingredients to ensure exist — { name, categoryName, quantity, unit }
  const wantedIngredients = [
    { name: "Egg",              categoryName: "Dairy & Eggs",  quantity: 3,    unit: "large" },
    { name: "Dashi",            categoryName: "Asian Pantry",  quantity: 420,  unit: "ml" },
    { name: "Mirin",            categoryName: "Asian Pantry",  quantity: 1,    unit: "tsp" },
    { name: "Soy Sauce",        categoryName: "Asian Pantry",  quantity: 1,    unit: "tsp" },
    { name: "Salt",             categoryName: "Spices",        quantity: 0.5,  unit: "tsp" },
    { name: "Sake",             categoryName: "Asian Pantry",  quantity: 1,    unit: "tbsp" },
    { name: "Chicken Thigh",    categoryName: "Proteins",      quantity: 60,   unit: "g" },
    { name: "Kamaboko",         categoryName: "Japanese",      quantity: 8,    unit: "slices" },
    { name: "Shimeji Mushrooms",categoryName: "Vegetables",    quantity: 50,   unit: "g" },
    { name: "Mitsuba",          categoryName: "Herbs",         quantity: 4,    unit: "sprigs" },
    { name: "Ginkgo Nuts",      categoryName: "Asian Pantry",  quantity: 8,    unit: "nuts" },
  ];

  const ingredientList = [];

  for (const wanted of wantedIngredients) {
    const ingredient = await ensureIngredient(allIngredients, allCategories, wanted);
    ingredientList.push({
      ingredient: ingredient._id,
      quantity: wanted.quantity,
      unit: wanted.unit,
    });
  }

  console.log("\nCreating recipe...");

  const recipe = await post("/api/recipes", {
    name: "Chawanmushi (Steamed Egg Custard)",
    mealCategory: ["dinner"],
    description:
      "A silky Japanese steamed egg custard with chicken, kamaboko, and mushrooms. The key is the 1:2.5 egg-to-dashi ratio and gentle, low-heat steaming for a smooth, pitted-free texture.",
    servings: 4,
    notes:
      "Use usukuchi (light-colored) soy sauce if possible — it keeps the custard pale. Always strain the egg mixture through a fine-mesh sieve. Maintain water temperature at 80–90°C (176–194°F) throughout steaming; too high creates bubbles and a rough texture. Ginkgo nuts are optional.",
    ingredientList,
    instructions: [
      "Weigh the 3 eggs (without shells). Multiply the weight by 2.5 to get the exact amount of dashi needed (approximately 420 ml / 1¾ cups). Combine eggs and dashi in a bowl and add mirin, soy sauce, and salt. Whisk gently until blended, then strain through a fine-mesh sieve to remove any foam or solids.",
      "Cut chicken into ½-inch (1.5 cm) pieces and marinate in sake for 10 minutes. Slice kamaboko (fish cake) into thin rounds. Trim the root end of shimeji mushrooms and separate into small clusters. Tie mitsuba into loose knots (or thinly slice green onion).",
      "Place 4 chawanmushi cups (or ramekins) in a large pot. Add enough water to reach halfway up the sides of the cups, then remove the cups. Cover the pot and bring the water to a full boil over high heat, then turn off the heat.",
      "Divide the chicken pieces among the cups, then add shimeji mushrooms and ginkgo nuts (if using). Arrange kamaboko slices and knotted mitsuba on top. Pour the egg mixture into each cup until about 80% full. Use a spoon to skim off any air bubbles from the surface.",
      "Bring the water back to a boil over high heat, then reduce to the lowest possible setting to maintain 80–90°C (176–194°F). Carefully lower the filled cups into the pot using tongs. Cover the pot but leave the lid slightly ajar to let steam escape and prevent the temperature from climbing too high. Steam for 20 minutes (or 15 minutes if omitting chicken).",
      "Test doneness by inserting a skewer into the center of a cup — it is ready when only clear liquid (not cloudy egg) runs out. Carefully lift the cups from the water. Replace the lids and serve immediately while hot, with a small spoon on the side.",
    ],
  });

  console.log(`\n✅  Recipe created: "${recipe.name}" (ID: ${recipe._id})`);
  console.log(`    ${ingredientList.length} ingredients · 4 servings · dinner\n`);
}

seed().catch((err) => {
  console.error("\n❌  Failed:", err.message);
  process.exit(1);
});
