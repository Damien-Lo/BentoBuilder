/**
 * Read-only diagnostic: find pantry entries whose quantityUnit isn't
 * convertible to their ingredient's own unit — these would be silently
 * excluded from any future family-restricted pantry unit picker and from
 * automatic deduction. Not run automatically; a one-off check.
 *
 * Usage (run from the server/ directory):
 *   node manual_controls/scripts/audit_pantry_units.mjs
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import PantryItem from "../../models/PantryItem.js";
import Ingredient from "../../models/Ingredient.js";
import UserProfile from "../../models/UserProfile.js";
import { convertUnits } from "../../services/unitConversion.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const profile = await UserProfile.findOne().select("unitConversions").lean();
  const customConversions = profile?.unitConversions ?? [];

  const items = await PantryItem.find({}).populate("ingredient");

  const mismatches = [];
  for (const item of items) {
    const ing = item.ingredient;
    if (!ing) continue;
    const ingUnit = ing.defaultPortionUnit || "serving";
    if (!item.quantityUnit) continue;
    const convertible = convertUnits(1, item.quantityUnit, ingUnit, customConversions) != null;
    if (!convertible) {
      mismatches.push({
        ingredient: ing.name,
        ingredientUnit: ingUnit,
        pantryUnit: item.quantityUnit,
        quantity: item.quantityAvailable,
        pantryItemId: item._id.toString(),
      });
    }
  }

  console.log(`Checked ${items.length} pantry items.`);
  console.log(`Found ${mismatches.length} mismatch(es):`);
  console.log(JSON.stringify(mismatches, null, 2));

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Audit failed:", error);
  process.exit(1);
});
