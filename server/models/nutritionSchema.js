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
// Stored as real absolute amounts in the units below (NUTRITION_FIELD_UNITS
// — every writer: Open Food Facts, Gemini, manual entry, backfills — and
// reader has to agree on them), never as %DV: %DV (what a MyFitnessPal-
// style display shows for vitamins/minerals) is computed from these at
// display time, so a stored value stays meaningful regardless of which
// reference the UI compares it against.
export const EXTENDED_NUTRITION_FIELD_NAMES = [
  "sugar",
  "addedSugar",
  "saturatedFat",
  "polyunsaturatedFat",
  "monounsaturatedFat",
  "transFat",
  "omega3",
  "cholesterol",
  "potassium",
  "vitaminA",
  "vitaminC",
  "vitaminD",
  "vitaminE",
  "vitaminK",
  "thiamin",
  "riboflavin",
  "niacin",
  "vitaminB6",
  "folate",
  "vitaminB12",
  "choline",
  "calcium",
  "iron",
  "magnesium",
  "phosphorus",
  "zinc",
  "selenium",
  "iodine",
  "copper",
  "manganese",
  "caffeine",
];

// omega3 is EPA + DHA only (the long-chain ones fish oil labels lead with),
// not plant ALA. vitaminA is mcg RAE; folate is mcg DFE; niacin is mg NE.
export const NUTRITION_FIELD_UNITS = {
  calories: "kcal",
  protein: "g",
  carbs: "g",
  fats: "g",
  fiber: "g",
  sodium: "mg",
  sugar: "g",
  addedSugar: "g",
  saturatedFat: "g",
  polyunsaturatedFat: "g",
  monounsaturatedFat: "g",
  transFat: "g",
  omega3: "mg",
  cholesterol: "mg",
  potassium: "mg",
  vitaminA: "mcg",
  vitaminC: "mg",
  vitaminD: "mcg",
  vitaminE: "mg",
  vitaminK: "mcg",
  thiamin: "mg",
  riboflavin: "mg",
  niacin: "mg",
  vitaminB6: "mg",
  folate: "mcg",
  vitaminB12: "mcg",
  choline: "mg",
  calcium: "mg",
  iron: "mg",
  magnesium: "mg",
  phosphorus: "mg",
  zinc: "mg",
  selenium: "mcg",
  iodine: "mcg",
  copper: "mg",
  manganese: "mg",
  caffeine: "mg",
};

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
