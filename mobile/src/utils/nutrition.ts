import {
  ALL_NUTRITION_FIELDS,
  CORE_NUTRITION_FIELDS,
  EXTENDED_NUTRITION_FIELDS,
  NUTRITION_FIELD_META,
  type NullableNutrition,
  type NutritionInput,
  type NutritionTotals,
  type PartialNutrition,
} from "@/src/types/nutrition";

// Field-list-driven nutrition math — every function here iterates the
// central field lists rather than naming fields individually, so adding a
// nutrient in types/nutrition.ts flows through all of it automatically.
//
// The one real semantic difference between the two groups: a core field
// treats unknown as contributing nothing (a total is always a number, same
// as before extended tracking existed), while an extended field stays
// absent from a total until something with a *known* value contributes —
// so "no data" never gets reported as "0 mg cholesterol."

export function emptyNutritionTotals(): NutritionTotals {
  const totals = {} as NutritionTotals;
  for (const field of CORE_NUTRITION_FIELDS) totals[field] = 0;
  return totals;
}

export function unknownNutrition(): NullableNutrition {
  const nutrition = {} as NullableNutrition;
  for (const field of CORE_NUTRITION_FIELDS) nutrition[field] = null;
  return nutrition;
}

// Every known value times `factor`; unknown stays unknown.
export function scaleNutrition(
  source: PartialNutrition | null | undefined,
  factor: number,
): NullableNutrition {
  const src = source ?? {};
  const scaled = unknownNutrition();
  for (const field of CORE_NUTRITION_FIELDS) {
    const value = src[field];
    scaled[field] = value == null ? null : value * factor;
  }
  for (const field of EXTENDED_NUTRITION_FIELDS) {
    const value = src[field];
    if (value != null) scaled[field] = value * factor;
  }
  return scaled;
}

// A create/update payload: unknown (null) values are omitted rather than
// sent, so the server stores its own null default instead of a value.
export function toNutritionInput(source: PartialNutrition): NutritionInput {
  const input: NutritionInput = {};
  for (const field of ALL_NUTRITION_FIELDS) {
    const value = source[field];
    if (value != null) input[field] = value;
  }
  return input;
}

// Adds `nutrition` into `totals` in place. A known extended 0 (e.g. "0 g
// trans fat" off a real label) still counts as known — only null/absent is
// skipped.
export function addNutrition(totals: NutritionTotals, nutrition: PartialNutrition): void {
  for (const field of CORE_NUTRITION_FIELDS) {
    const value = nutrition[field];
    if (value) totals[field] += value;
  }
  for (const field of EXTENDED_NUTRITION_FIELDS) {
    const value = nutrition[field];
    if (value != null) totals[field] = (totals[field] ?? 0) + value;
  }
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Per-field rounding from NUTRITION_FIELD_META (calories/sodium to whole
// numbers, grams to one decimal, ...).
export function roundNutritionTotals(totals: NutritionTotals): NutritionTotals {
  const rounded = emptyNutritionTotals();
  for (const field of CORE_NUTRITION_FIELDS) {
    rounded[field] = roundTo(totals[field], NUTRITION_FIELD_META[field].decimals);
  }
  for (const field of EXTENDED_NUTRITION_FIELDS) {
    const value = totals[field];
    if (value != null) rounded[field] = roundTo(value, NUTRITION_FIELD_META[field].decimals);
  }
  return rounded;
}

// A totals object scaled down to a per-day average (e.g. a week's totals /
// 7), rounded the same way as a single day. `days` of 0 returns empty
// totals rather than dividing by zero.
export function divideNutritionTotals(totals: NutritionTotals, days: number): NutritionTotals {
  if (days <= 0) return emptyNutritionTotals();
  const divided = emptyNutritionTotals();
  for (const field of CORE_NUTRITION_FIELDS) divided[field] = totals[field] / days;
  for (const field of EXTENDED_NUTRITION_FIELDS) {
    const value = totals[field];
    if (value != null) divided[field] = value / days;
  }
  return roundNutritionTotals(divided);
}
