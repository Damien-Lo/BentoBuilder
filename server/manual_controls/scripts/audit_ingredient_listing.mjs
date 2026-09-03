// Read-only — dumps every active ingredient grouped by category, for a
// manual eyeball pass (gaps, odd names, category mis-filing) that automated
// checks in audit_data_overview.mjs can't catch. Run with:
//   node manual_controls/scripts/audit_ingredient_listing.mjs
import mongoose from "mongoose";
import dotenv from "dotenv";

import Ingredient from "../../models/Ingredient.js";
import IngredientCategory from "../../models/IngredientCategory.js";
import "../../models/Brand.js";

dotenv.config();

function hasNoNutrition(n) {
  if (!n) return true;
  return n.calories == null && n.protein == null && n.carbs == null && n.fats == null && n.fiber == null && n.sodium == null;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const categories = await IngredientCategory.find().sort({ name: 1 });
  const ingredients = await Ingredient.find({ isArchived: false })
    .populate("category", "name")
    .populate("brand", "name")
    .sort({ name: 1 });

  const byCategory = new Map(categories.map(c => [String(c._id), []]));
  const uncategorized = [];
  for (const i of ingredients) {
    const key = i.category ? String(i.category._id) : null;
    if (key && byCategory.has(key)) byCategory.get(key).push(i);
    else uncategorized.push(i);
  }

  for (const cat of categories) {
    const items = byCategory.get(String(cat._id));
    if (!items.length) continue;
    console.log(`\n── ${cat.name} (${items.length}) ──`);
    for (const i of items) {
      const flags = [];
      if (hasNoNutrition(i.nutrition)) flags.push("no nutrition");
      if (!i.isGeneric && !i.barcode) flags.push("no barcode");
      if (!i.isGeneric && !i.brand) flags.push("no brand, but not generic");
      const kind = i.isGeneric ? "generic" : i.brand ? `specific/${i.brand.name}` : "specific";
      console.log(`  - ${i.name}  [${kind}]${flags.length ? "  ⚑ " + flags.join(", ") : ""}`);
    }
  }
  if (uncategorized.length) {
    console.log(`\n── (no category) (${uncategorized.length}) ──`);
    for (const i of uncategorized) console.log(`  - ${i.name}`);
  }

  console.log(`\n\nCategories with zero ingredients:`);
  for (const cat of categories) {
    if (!byCategory.get(String(cat._id)).length) console.log(`  - ${cat.name}`);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
