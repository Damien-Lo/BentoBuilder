// Diagnostic (read-only): finds every recipe ingredient line whose unit
// can't be converted into that ingredient's own defaultPortionUnit — those
// silently contribute 0 to the recipe's nutrition total instead of erroring.
import "dotenv/config";
import mongoose from "mongoose";
import Recipe from "../../models/Recipe.js";
import "../../models/Ingredient.js";
import "../../models/IngredientCategory.js";
import "../../models/Brand.js";
import { convertUnits, getIngredientConversions } from "../../services/unitConversion.js";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const recipes = await Recipe.find({}).populate({
    path: "ingredientList.ingredient",
    populate: [{ path: "genericParent" }],
  });

  const gapsByIngredient = new Map();

  for (const recipe of recipes) {
    for (const entry of recipe.ingredientList) {
      const ing = entry.ingredient;
      if (!ing || typeof ing !== "object" || !ing.nutrition) continue;
      const hasNutritionData = Object.values(ing.nutrition).some((v) => v != null);
      if (!hasNutritionData) continue;

      const converted = convertUnits(entry.quantity, entry.unit, ing.defaultPortionUnit, getIngredientConversions(ing, []));
      if (converted == null) {
        console.log(
          `GAP: "${recipe.name}" uses ${entry.quantity} ${entry.unit} of "${ing.name}" but its portion is defined as ${ing.defaultPortionAmount} ${ing.defaultPortionUnit} (no conversion path) -> silently contributes 0 calories`,
        );
        const key = `${ing._id}|${ing.name}`;
        const existing = gapsByIngredient.get(key) ?? new Set();
        existing.add(entry.unit);
        gapsByIngredient.set(key, existing);
      }
    }
  }

  console.log(`\nDistinct ingredients with a conversion gap:`);
  for (const [key, units] of gapsByIngredient.entries()) {
    const [id, name] = key.split("|");
    console.log(`  ${id} | ${name} | recipe units seen: ${[...units].join(", ")}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
