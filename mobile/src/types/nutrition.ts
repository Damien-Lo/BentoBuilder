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
] as const;

export const ALL_NUTRITION_FIELDS = [...CORE_NUTRITION_FIELDS, ...EXTENDED_NUTRITION_FIELDS] as const;

export type CoreNutritionField = (typeof CORE_NUTRITION_FIELDS)[number];
export type ExtendedNutritionField = (typeof EXTENDED_NUTRITION_FIELDS)[number];
export type NutritionField = CoreNutritionField | ExtendedNutritionField;

// Stored as real absolute amounts in these units (same as the server) —
// vitamins/minerals are *not* stored as %DV; any %DV display is computed
// from these at render time. `dailyValue` (FDA adult Daily Value, in the
// field's own unit) marks the fields shown as %DV rather than absolute
// amounts, the way MyFitnessPal shows vitamins/minerals.
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
  saturatedFat:       { label: "Saturated Fat",       unit: "g",    decimals: 1 },
  polyunsaturatedFat: { label: "Polyunsaturated Fat", unit: "g",    decimals: 1 },
  monounsaturatedFat: { label: "Monounsaturated Fat", unit: "g",    decimals: 1 },
  transFat:           { label: "Trans Fat",           unit: "g",    decimals: 1 },
  cholesterol:        { label: "Cholesterol",         unit: "mg",   decimals: 0 },
  potassium:          { label: "Potassium",           unit: "mg",   decimals: 0 },
  vitaminA:           { label: "Vitamin A",           unit: "mcg",  decimals: 0, dailyValue: 900 },
  vitaminC:           { label: "Vitamin C",           unit: "mg",   decimals: 1, dailyValue: 90 },
  calcium:            { label: "Calcium",             unit: "mg",   decimals: 0, dailyValue: 1300 },
  iron:               { label: "Iron",                unit: "mg",   decimals: 1, dailyValue: 18 },
};

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
