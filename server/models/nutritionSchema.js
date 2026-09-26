import mongoose from "mongoose";

// The "main" 6 — shown prominently everywhere nutrition appears (goal bars,
// summary cards, confirm screens). Every one of these was, until now,
// hand-copied into 5 separate schemas (Ingredient, Recipe, RestaurantMeal's
// dish, MealPlanEntry's confirmedNutrition, plus UserProfile's flat goal
// fields) — this module is the single source of truth going forward.
export const CORE_NUTRITION_FIELD_NAMES = [
  "calories",
  "protein",
  "carbs",
  "fats",
  "fiber",
  "sodium",
];

// Tracked in the background, not front-and-center — surfaced only in a
// secondary "all nutrients" view (mirrors MyFitnessPal's Nutrients tab).
// Units, for every writer (Open Food Facts, Gemini, manual entry) and
// reader to agree on: sugar/saturatedFat/polyunsaturatedFat/
// monounsaturatedFat/transFat in grams, cholesterol/potassium/vitaminC/
// calcium/iron in milligrams, vitaminA in micrograms (mcg RAE, the modern
// nutrition-label unit — not the older IU). Stored as real absolute
// amounts, not %DV — %DV (what a MyFitnessPal-style display shows for
// vitamins/minerals, where the goal is always 100%) is a presentation
// choice computed from these at display time, not how the data itself is
// kept, so a stored value stays meaningful regardless of which RDA
// reference the UI happens to compare it against.
export const EXTENDED_NUTRITION_FIELD_NAMES = [
  "sugar",
  "saturatedFat",
  "polyunsaturatedFat",
  "monounsaturatedFat",
  "transFat",
  "cholesterol",
  "potassium",
  "vitaminA",
  "vitaminC",
  "calcium",
  "iron",
];

export const ALL_NUTRITION_FIELD_NAMES = [
  ...CORE_NUTRITION_FIELD_NAMES,
  ...EXTENDED_NUTRITION_FIELD_NAMES,
];

function optionalNumberField() {
  return { type: Number, min: 0, default: null };
}

// Ingredient.nutrition / Recipe.nutrition / RestaurantMeal's dish nutrition
// all use this — every field optional/nullable throughout (core and
// extended alike), since "unknown" is always a valid state for any of them
// (e.g. a manually-added ingredient with only calories/protein filled in).
export function createNutritionSchema() {
  const fields = {};
  for (const name of ALL_NUTRITION_FIELD_NAMES) {
    fields[name] = optionalNumberField();
  }
  return new mongoose.Schema(fields, { _id: false });
}

// UserProfile.extendedNutrientGoals — a daily goal per extended nutrient,
// in the same absolute units as the nutrition values themselves (vitamins/
// minerals included, even though the app displays those as %DV — the goal
// is stored in mcg/mg and converted at display time, same as the totals).
// null = no goal set. The core 6's goals stay as UserProfile's existing flat
// dailyXLimit fields.
export function createExtendedNutrientGoalsSchema() {
  const fields = {};
  for (const name of EXTENDED_NUTRITION_FIELD_NAMES) {
    fields[name] = optionalNumberField();
  }
  return new mongoose.Schema(fields, { _id: false });
}

// MealPlanEntry.confirmedNutrition is a snapshot computed once, client-side,
// at confirm time (see mobile's computeConfirmNutrition) — the core 6 are
// always computed and stored (`required: true`, matching the pre-existing
// schema this replaces), but extended fields stay optional: an ingredient
// on file before extended tracking existed (or one that was never given
// extended values) simply won't contribute them, and an entry confirmed
// against it shouldn't be blocked by that.
export function createConfirmedNutritionSchema() {
  const fields = {};
  for (const name of CORE_NUTRITION_FIELD_NAMES) {
    fields[name] = { type: Number, required: true };
  }
  for (const name of EXTENDED_NUTRITION_FIELD_NAMES) {
    fields[name] = { type: Number, default: null };
  }
  return new mongoose.Schema(fields, { _id: false });
}
