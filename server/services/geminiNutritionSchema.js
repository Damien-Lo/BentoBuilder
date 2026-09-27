import { z } from "zod";

import {
  ALL_NUTRITION_FIELD_NAMES,
  CORE_NUTRITION_FIELD_NAMES,
  EXTENDED_NUTRITION_FIELD_NAMES,
  NUTRITION_FIELD_UNITS,
} from "../models/nutritionSchema.js";

// Shared by every Gemini call that estimates nutrition (receipt parsing,
// meal-photo estimation) — both used to hand-copy the same 6-field schema.
// Built from the central field lists so a new nutrient is requested
// everywhere at once.

// Extended fields are .optional() as well as nullable purely as defense —
// the responseSchema below requires them, but a stored/replayed older
// response (e.g. /api/receipts/last) predates them.
export const GeminiNutritionSchema = z.object(
  Object.fromEntries([
    ...CORE_NUTRITION_FIELD_NAMES.map((field) => [field, z.number().nullable()]),
    ...EXTENDED_NUTRITION_FIELD_NAMES.map((field) => [field, z.number().nullable().optional()]),
  ]),
);

// Gemini's responseSchema is an OpenAPI-3.0 subset: plain `nullable: true`
// alongside a base type. Every field is required-but-nullable so the model
// has to consider each one explicitly and say null when it can't estimate
// it, rather than silently omitting it.
export const GEMINI_NUTRITION_JSON_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(
    ALL_NUTRITION_FIELD_NAMES.map((field) => [field, { type: "number", nullable: true }]),
  ),
  required: [...ALL_NUTRITION_FIELD_NAMES],
};

// Units must match what the app stores (see models/nutritionSchema.js) —
// spelled out explicitly since nothing else tells the model, and sodium in
// grams vs. milligrams is exactly the kind of silent 1000x error that's
// easy to miss. Generated from NUTRITION_FIELD_UNITS so a new nutrient
// can't be requested without its unit.
const UNIT_NAMES = { kcal: "kcal", g: "grams", mg: "milligrams", mcg: "micrograms" };
const UNIT_NOTES = {
  omega3: "EPA + DHA only, not plant ALA",
  vitaminA: "mcg RAE",
  folate: "mcg DFE",
  niacin: "mg NE",
  vitaminD: "mcg; 1 mcg = 40 IU",
};

function describeUnits() {
  const byUnit = {};
  for (const field of ALL_NUTRITION_FIELD_NAMES) {
    const unit = NUTRITION_FIELD_UNITS[field];
    const note = UNIT_NOTES[field];
    (byUnit[unit] ??= []).push(note ? `${field} (${note})` : field);
  }
  return Object.entries(byUnit)
    .map(([unit, fields]) => `${fields.join(", ")} in ${UNIT_NAMES[unit]}`)
    .join("; ");
}

// Just the units — for callers that transcribe rather than estimate (label
// reading), where the estimation guidance below would be wrong.
export const NUTRITION_UNITS = `Nutrition units: ${describeUnits()}.`;

export const NUTRITION_UNITS_INSTRUCTION = `${NUTRITION_UNITS} The core values (calories, protein, carbs, fats, fiber, sodium) should always be your best estimate. For the others (sugars, the fat breakdown, cholesterol, vitamins, minerals, caffeine), give a value only when you have a reasonable basis (typical label or reference values for that product/dish) — use null rather than a fabricated number when you don't; null is always better than a guess. addedSugar is sugar added during processing (0 for whole foods like plain produce, meat or milk).`;
