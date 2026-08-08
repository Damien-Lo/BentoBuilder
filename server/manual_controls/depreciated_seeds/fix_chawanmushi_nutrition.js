/**
 * Fix: Chawanmushi nutrition calculation
 *
 * Problems found:
 *  1. Recipe linked to "Dashi Powder" (5g default) instead of "Dashi Stock" (240ml).
 *     420 ÷ 5 = 84× multiplier → 1,008 kcal from dashi alone.
 *  2. Sake defaultPortionAmount = 60ml (¼ cup); recipe uses 1 tbsp → 1÷60 multiplier.
 *  3. Kamaboko / Mitsuba / Ginkgo Nuts have no nutrition data.
 *
 * Run from the server/ directory (server must be running):
 *   node seeds/fix_chawanmushi_nutrition.js
 */

const BASE_URL = "http://localhost:5050";

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(`GET ${path} failed: ${json.message}`);
  return json.data;
}

async function patch(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`PATCH ${path} failed: ${json.message}`);
  return json.data;
}

function findExact(list, name) {
  const q = name.toLowerCase();
  return list.find((i) => i.name.toLowerCase() === q) ?? null;
}

function getId(ref) {
  if (typeof ref === "string") return ref;
  if (ref && typeof ref === "object") return ref._id ?? ref.id ?? "";
  return "";
}

async function fix() {
  console.log("\n🔧  Fixing Chawanmushi nutrition\n");

  const allIngredients = await get("/api/ingredients");
  const allRecipes = await get("/api/recipes");

  // ── 1. Fix ingredient serving sizes / nutrition ──────────────────────────

  const ingredientFixes = [
    {
      // Sake: was 60ml (¼ cup). Recipe uses 1 tbsp → now 1 tbsp = correct multiplier.
      name: "Sake (cooking)",
      update: {
        defaultPortionAmount: 15,
        defaultPortionUnit: "ml (1 tbsp)",
        nutrition: { calories: 16, protein: 0.1, carbs: 0.7, fats: 0, sodium: 1 },
      },
    },
    {
      // Kamaboko: created with no nutrition. Each slice ≈ 14g of fish cake.
      name: "Kamaboko",
      update: {
        defaultPortionAmount: 1,
        defaultPortionUnit: "slice",
        nutrition: { calories: 13, protein: 1.8, carbs: 1.4, fats: 0.2, sodium: 115 },
      },
    },
    {
      // Mitsuba: negligible but worth having a real value.
      name: "Mitsuba",
      update: {
        defaultPortionAmount: 1,
        defaultPortionUnit: "sprig",
        nutrition: { calories: 1, protein: 0.1, carbs: 0.1, fats: 0, sodium: 1 },
      },
    },
    {
      // Ginkgo Nuts: each nut ≈ 1.5g.
      name: "Ginkgo Nuts",
      update: {
        defaultPortionAmount: 1,
        defaultPortionUnit: "nut",
        nutrition: { calories: 6, protein: 0.1, carbs: 1.3, fats: 0.1, sodium: 0 },
      },
    },
  ];

  for (const fix of ingredientFixes) {
    const ing = findExact(allIngredients, fix.name);
    if (!ing) {
      console.log(`  ⚠ "${fix.name}" not found — skipping`);
      continue;
    }
    await patch(`/api/ingredients/${ing._id}`, fix.update);
    console.log(`  ✓ Updated "${ing.name}"`);
  }

  // ── 2. Fix Chawanmushi recipe: swap Dashi Powder → Dashi Stock ───────────

  const recipe = allRecipes.find((r) =>
    r.name.toLowerCase().includes("chawanmushi"),
  );
  if (!recipe) {
    throw new Error('Could not find a recipe containing "chawanmushi"');
  }
  console.log(`\n  Found recipe: "${recipe.name}" (${recipe._id})`);

  // Fetch the full recipe so ingredientList is populated
  const full = await get(`/api/recipes/${recipe._id}`);

  const dashiStock = findExact(allIngredients, "Dashi Stock");
  if (!dashiStock) {
    throw new Error('"Dashi Stock" not found in ingredients — cannot swap');
  }

  let swapped = false;
  const newIngredientList = full.ingredientList.map((entry) => {
    const ingId = getId(entry.ingredient);
    const ingName =
      typeof entry.ingredient === "object"
        ? entry.ingredient.name ?? ""
        : "";

    // Replace any "dashi powder" entry with Dashi Stock
    if (ingName.toLowerCase().includes("dashi powder")) {
      console.log(
        `  ✓ Swapped "${ingName}" → "Dashi Stock" (${entry.quantity} ${entry.unit})`,
      );
      swapped = true;
      return { ingredient: dashiStock._id, quantity: entry.quantity, unit: entry.unit };
    }

    return { ingredient: ingId, quantity: entry.quantity, unit: entry.unit };
  });

  if (!swapped) {
    console.log('  ℹ  No "Dashi Powder" entry found in recipe — checking if already correct');
    const hasDashiStock = full.ingredientList.some((e) => {
      const name =
        typeof e.ingredient === "object" ? e.ingredient.name ?? "" : "";
      return name.toLowerCase().includes("dashi stock");
    });
    if (hasDashiStock) {
      console.log('  ✓ Recipe already uses "Dashi Stock"');
    } else {
      console.log("  ⚠  Could not identify the dashi entry — manual fix needed");
    }
  }

  // PATCH the recipe with the corrected ingredient list; the server will
  // recalculate and store nutrition via calcNutrition().
  const updated = await patch(`/api/recipes/${recipe._id}`, {
    ingredientList: newIngredientList,
  });

  const kcal = updated.nutrition?.calories;
  console.log(
    `\n✅  Recipe updated. Stored nutrition: ${kcal != null ? `${kcal} kcal / serving` : "not calculated (some ingredients may lack nutrition data)"}`,
  );
  console.log(
    "    Expected range for chawanmushi: 100–160 kcal / serving\n",
  );
}

fix().catch((err) => {
  console.error("\n❌  Failed:", err.message);
  process.exit(1);
});
