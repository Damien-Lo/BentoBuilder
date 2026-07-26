/**
 * Seed: Air Fryer Japanese Fried Chicken (Karaage)
 * Source: https://cjeatsrecipes.com/air-fryer-japanese-fried-chicken-karaage/
 *
 * Run from the server/ directory (server must be running):
 *   node seeds/seed_karaage_recipe.js
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

// Finds the best matching ingredient by name (case-insensitive, partial match).
// Returns { id, name } or null.
function findIngredient(allIngredients, searchName) {
  const query = searchName.toLowerCase();
  const exact = allIngredients.find((i) => i.name.toLowerCase() === query);
  if (exact) return { id: exact._id, name: exact.name };
  const partial = allIngredients.find((i) =>
    i.name.toLowerCase().includes(query),
  );
  if (partial) return { id: partial._id, name: partial.name };
  // Also try searching with the first word only
  const firstWord = query.split(" ")[0];
  const firstWordMatch = allIngredients.find((i) =>
    i.name.toLowerCase().includes(firstWord),
  );
  if (firstWordMatch)
    return { id: firstWordMatch._id, name: firstWordMatch.name };
  return null;
}

async function seed() {
  console.log("\n🍗  Seeding: Air Fryer Japanese Fried Chicken (Karaage)\n");

  const allIngredients = await get("/api/ingredients");
  console.log(`Found ${allIngredients.length} ingredients in database\n`);

  // ingredient name to search for → { quantity, unit }
  const wantedIngredients = [
    { search: "Chicken Thigh", quantity: 450, unit: "g" },
    { search: "Garlic", quantity: 4, unit: "cloves" },
    { search: "Ginger", quantity: 1, unit: "tbsp" },
    { search: "Soy Sauce", quantity: 2, unit: "tbsp" },
    { search: "Sake", quantity: 1, unit: "tbsp" },
    { search: "Sesame Oil", quantity: 1, unit: "tsp" },
    { search: "Black Pepper", quantity: 0.5, unit: "tsp" },
    { search: "Salt", quantity: 0.5, unit: "tsp" },
    { search: "Japanese Mayonnaise", quantity: 4, unit: "tbsp" },
    { search: "Hot Sauce", quantity: 2, unit: "tbsp" },
    { search: "Lemon Juice", quantity: 1, unit: "tbsp" },
  ];

  const ingredientList = [];
  const skipped = [];

  for (const wanted of wantedIngredients) {
    const match = findIngredient(allIngredients, wanted.search);
    if (match) {
      console.log(`  ✓ "${wanted.search}" → matched "${match.name}"`);
      ingredientList.push({
        ingredient: match.id,
        quantity: wanted.quantity,
        unit: wanted.unit,
      });
    } else {
      console.log(`  ⚠ "${wanted.search}" → no match found, skipping`);
      skipped.push(wanted.search);
    }
  }

  console.log();

  const recipe = await post("/api/recipes", {
    name: "Air Fryer Japanese Fried Chicken (Karaage)",
    mealCategory: "dinner",
    description:
      "Crispy, juicy Japanese fried chicken made in the air fryer. The double-fry technique — low heat first, then high heat — gives the signature crunchy exterior while keeping the meat tender inside.",
    servings: 4,
    notes:
      "Marinate for at least 30 min (up to 1 hour). Potato starch (katakuriko) gives the crispiest coating — use cornstarch as a substitute. Serve with lemon wedges.",
    ingredientList,
    instructions: [
      "Combine chicken thighs with grated garlic, grated ginger, soy sauce, sake, sesame oil, white pepper, and salt in a bowl. Cover and refrigerate for 30 minutes to 1 hour.",
      "Pour potato starch onto a tray. Coat each piece of chicken thoroughly, shaking off excess.",
      "Spray the air fryer basket with neutral oil. Arrange chicken in a single layer with space between pieces. Spray chicken generously with oil.",
      "Air fry at 350°F (175°C) for 10 minutes. Flip pieces, spray the other side with oil, then air fry at 400°F (200°C) for 8–10 minutes until golden and crispy.",
      "Mix Japanese mayo, sriracha, grated garlic, lemon juice, salt, and pepper for the dipping sauce.",
      "Squeeze fresh lemon juice over finished chicken before serving with the spicy mayo.",
    ],
  });

  console.log(`✅  Recipe created: "${recipe.name}" (ID: ${recipe._id})`);

  if (skipped.length > 0) {
    console.log(
      `\n⚠️  Skipped ingredients (not found in database):\n  ${skipped.join(", ")}`,
    );
    console.log(
      "   Run the seed script first, or add these manually in the app.",
    );
  }
}

seed().catch((err) => {
  console.error("\n❌  Failed:", err.message);
  process.exit(1);
});
