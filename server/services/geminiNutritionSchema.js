import { z } from "zod";

import {
  ALL_NUTRITION_FIELD_NAMES,
  CORE_NUTRITION_FIELD_NAMES,
  EXTENDED_NUTRITION_FIELD_NAMES,
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
// easy to miss.
export const NUTRITION_UNITS_INSTRUCTION = `Nutrition units: calories in kcal; protein, carbs, fats, fiber, sugar, saturatedFat, polyunsaturatedFat, monounsaturatedFat, transFat in grams; sodium, cholesterol, potassium, vitaminC, calcium, iron in milligrams; vitaminA in micrograms (mcg RAE). The core values (calories, protein, carbs, fats, fiber, sodium) should always be your best estimate. For the others (sugar, the fat breakdown, cholesterol, potassium, vitamins, minerals), give a value only when you have a reasonable basis (typical label values for that product/dish) — use null rather than a fabricated number when you don't; null is always better than a guess.`;
