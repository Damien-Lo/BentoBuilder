// Single source of truth for which nutrients exist — mirrors the server's
// models/nutritionSchema.js field lists exactly. Adding a nutrient means
// adding it here (and there), not hand-editing every interface and math
// function that touches nutrition.

// The "main" 6 — prominent everywhere (goal bars, summary cards, confirm
// screens). Always present in computed totals.
export const CORE_NUTRITION_FIELDS = [
  "calories",
  "protein",
  "carbs",
  "fats",
  "fiber",
  "sodium",
] as const;

// Tracked in the background, surfaced only in a secondary "all nutrients"
// view. Unknown is the normal state for these (most catalog entries have
// no data for them), so a missing/null extended value means "unknown,"
// never "zero" — see the math helpers in utils/nutrition.ts.
export const EXTENDED_NUTRITION_FIELDS = [
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
] as const;

export const ALL_NUTRITION_FIELDS = [...CORE_NUTRITION_FIELDS, ...EXTENDED_NUTRITION_FIELDS] as const;

export type CoreNutritionField = (typeof CORE_NUTRITION_FIELDS)[number];
export type ExtendedNutritionField = (typeof EXTENDED_NUTRITION_FIELDS)[number];
export type NutritionField = CoreNutritionField | ExtendedNutritionField;

// Stored as real absolute amounts in these units (same as the server's
// NUTRITION_FIELD_UNITS) — vitamins/minerals are *not* stored as %DV; any
// %DV display is computed from these at render time. `dailyValue` (FDA
// adult Daily Value, in the field's own unit) marks the fields shown as %DV
// rather than absolute amounts, the way MyFitnessPal shows vitamins/
// minerals. omega3 is EPA + DHA only; vitamin A is mcg RAE, folate mcg DFE,
// niacin mg NE.
export const NUTRITION_FIELD_META: Record<
  NutritionField,
  { label: string; unit: "kcal" | "g" | "mg" | "mcg"; decimals: number; dailyValue?: number }
> = {
  calories:           { label: "Calories",            unit: "kcal", decimals: 0 },
  protein:            { label: "Protein",             unit: "g",    decimals: 1 },
  carbs:              { label: "Carbohydrates",       unit: "g",    decimals: 1 },
  fats:               { label: "Fat",                 unit: "g",    decimals: 1 },
  fiber:              { label: "Fiber",               unit: "g",    decimals: 1 },
  sodium:             { label: "Sodium",              unit: "mg",   decimals: 0 },
  sugar:              { label: "Sugar",               unit: "g",    decimals: 1 },
  addedSugar:         { label: "Added Sugar",         unit: "g",    decimals: 1 },
  saturatedFat:       { label: "Saturated Fat",       unit: "g",    decimals: 1 },
  polyunsaturatedFat: { label: "Polyunsaturated Fat", unit: "g",    decimals: 1 },
  monounsaturatedFat: { label: "Monounsaturated Fat", unit: "g",    decimals: 1 },
  transFat:           { label: "Trans Fat",           unit: "g",    decimals: 1 },
  omega3:             { label: "Omega-3 (EPA + DHA)", unit: "mg",   decimals: 0 },
  cholesterol:        { label: "Cholesterol",         unit: "mg",   decimals: 0 },
  potassium:          { label: "Potassium",           unit: "mg",   decimals: 0 },
  vitaminA:           { label: "Vitamin A",           unit: "mcg",  decimals: 0, dailyValue: 900 },
  vitaminC:           { label: "Vitamin C",           unit: "mg",   decimals: 1, dailyValue: 90 },
  vitaminD:           { label: "Vitamin D",           unit: "mcg",  decimals: 1, dailyValue: 20 },
  vitaminE:           { label: "Vitamin E",           unit: "mg",   decimals: 1, dailyValue: 15 },
  vitaminK:           { label: "Vitamin K",           unit: "mcg",  decimals: 0, dailyValue: 120 },
  thiamin:            { label: "Thiamin (B1)",        unit: "mg",   decimals: 2, dailyValue: 1.2 },
  riboflavin:         { label: "Riboflavin (B2)",     unit: "mg",   decimals: 2, dailyValue: 1.3 },
  niacin:             { label: "Niacin (B3)",         unit: "mg",   decimals: 1, dailyValue: 16 },
  vitaminB6:          { label: "Vitamin B6",          unit: "mg",   decimals: 2, dailyValue: 1.7 },
  folate:             { label: "Folate",              unit: "mcg",  decimals: 0, dailyValue: 400 },
  vitaminB12:         { label: "Vitamin B12",         unit: "mcg",  decimals: 1, dailyValue: 2.4 },
  choline:            { label: "Choline",             unit: "mg",   decimals: 0, dailyValue: 550 },
  calcium:            { label: "Calcium",             unit: "mg",   decimals: 0, dailyValue: 1300 },
  iron:               { label: "Iron",                unit: "mg",   decimals: 1, dailyValue: 18 },
  magnesium:          { label: "Magnesium",           unit: "mg",   decimals: 0, dailyValue: 420 },
  phosphorus:         { label: "Phosphorus",          unit: "mg",   decimals: 0, dailyValue: 1250 },
  zinc:               { label: "Zinc",                unit: "mg",   decimals: 1, dailyValue: 11 },
  selenium:           { label: "Selenium",            unit: "mcg",  decimals: 1, dailyValue: 55 },
  iodine:             { label: "Iodine",              unit: "mcg",  decimals: 0, dailyValue: 150 },
  copper:             { label: "Copper",              unit: "mg",   decimals: 2, dailyValue: 0.9 },
  manganese:          { label: "Manganese",           unit: "mg",   decimals: 2, dailyValue: 2.3 },
  caffeine:           { label: "Caffeine",            unit: "mg",   decimals: 0 },
};

// The extended fields in display groups — shared by every screen that lists
// them (the All Nutrients screen, the nutrition editors, the receipt card)
// so they read in the same order everywhere. Must cover every
// EXTENDED_NUTRITION_FIELDS entry exactly once.
export const EXTENDED_NUTRITION_GROUPS: { title: string; fields: readonly ExtendedNutritionField[] }[] = [
  {
    title: "Sugars & fats",
    fields: ["sugar", "addedSugar", "saturatedFat", "polyunsaturatedFat", "monounsaturatedFat", "transFat", "omega3", "cholesterol"],
  },
  {
    title: "Vitamins",
    fields: ["vitaminA", "vitaminC", "vitaminD", "vitaminE", "vitaminK", "thiamin", "riboflavin", "niacin", "vitaminB6", "folate", "vitaminB12", "choline"],
  },
  {
    title: "Minerals",
    fields: ["potassium", "calcium", "iron", "magnesium", "phosphorus", "zinc", "selenium", "iodine", "copper", "manganese"],
  },
  {
    title: "Other",
    fields: ["caffeine"],
  },
];

type ExtendedPart = { [K in ExtendedNutritionField]?: number | null };

// Every core field present but possibly null (unknown); extended optional.
// e.g. a scaled per-entry value, a receipt row being edited.
export type NullableNutrition = { [K in CoreNutritionField]: number | null } & ExtendedPart;

// Every field optional and nullable — what an API read of a stored
// nutrition sub-document looks like (the server may omit or null any field).
export type PartialNutrition = { [K in NutritionField]?: number | null };

// A computed total: core always a real number (0 when nothing contributed);
// extended present only once something with a known value contributed.
export type NutritionTotals = { [K in CoreNutritionField]: number } & ExtendedPart;

// Create/update payload shape for an ingredient — core optional (omitted
// when unknown, same contract as before), extended optional and nullable.
export type NutritionInput = { [K in CoreNutritionField]?: number } & ExtendedPart;
