import type { NutritionLabelScan } from "@/src/services/ingredientApi";
import { ALL_NUTRITION_FIELDS, type PartialNutrition } from "@/src/types/nutrition";
import { convertUnits, type CustomUnitConversion } from "./unitConversion";

// Helpers for turning a photographed nutrition label (see
// parseNutritionLabel) into ingredient form values.

// A Supplement Facts panel has to declare every nutrient the product
// contains, so anything it doesn't list is a real 0 — the same rule the
// supplements backfill used. A food Nutrition Facts label only has to list
// some nutrients, so there a missing one stays unknown.
export function labelNutrition(scan: NutritionLabelScan): PartialNutrition {
  const nutrition: PartialNutrition = {};
  for (const field of ALL_NUTRITION_FIELDS) {
    const value = scan.nutrition[field];
    if (value != null) nutrition[field] = value;
    else if (scan.labelType === "supplement_facts") nutrition[field] = 0;
  }
  return nutrition;
}

// Discrete things a label counts servings in — for these the printed count
// ("2 softgels") is the natural serving, not its weight.
const COUNT_UNITS = new Set([
  "tablet", "capsule", "softgel", "gummy", "gummie", "pill", "caplet", "lozenge", "chew",
  "piece", "bar", "packet", "stick", "scoop", "pouch", "sachet", "egg", "slice", "cookie",
]);

function singular(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u.endsWith("ies")) return u.slice(0, -3) + "y";
  if (u.endsWith("es") && COUNT_UNITS.has(u.slice(0, -2))) return u.slice(0, -2);
  if (u.endsWith("s") && !u.endsWith("ss")) return u.slice(0, -1);
  return u;
}

// Pill-type units are one "unit" each however the label words it — a
// "2 softgels" label on an ingredient counted in tablets is 2 tablets.
const PILL_UNITS = new Set(["tablet", "capsule", "softgel", "caplet", "pill", "gummy", "chew", "lozenge"]);

function sameUnit(a: string, b: string): boolean {
  const sa = singular(a);
  const sb = singular(b);
  return sa === sb || (PILL_UNITS.has(sa) && PILL_UNITS.has(sb));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// The serving to put in the form's serving-size field, expressed in the
// form's current unit (the ingredient's one unit, shared with pantry stock)
// when it already has one — e.g. a "2/3 cup (55 g)" label on an ingredient
// stocked in grams becomes 55 g. With no unit chosen yet, a counted
// serving (softgels, tablets) or a supplement keeps its count; anything
// else prefers the printed metric weight/volume. null when the label's
// serving can't be expressed in the form's unit — the caller should say so
// rather than guess.
export function labelServing(
  scan: NutritionLabelScan,
  currentUnit: string,
  conversions: CustomUnitConversion[],
): { amount: number; unit: string } | null {
  const household =
    scan.servingAmount != null && scan.servingUnit ? { amount: scan.servingAmount, unit: scan.servingUnit } : null;
  const metric =
    scan.servingMetricAmount != null && scan.servingMetricUnit
      ? { amount: scan.servingMetricAmount, unit: scan.servingMetricUnit }
      : null;

  if (!currentUnit.trim()) {
    const counted = household && COUNT_UNITS.has(singular(household.unit));
    const pick = (counted || scan.labelType === "supplement_facts") && household ? household : metric ?? household;
    return pick ? { amount: round(pick.amount), unit: counted ? singular(pick.unit) : pick.unit } : null;
  }

  for (const candidate of [household, metric]) {
    if (!candidate) continue;
    if (sameUnit(candidate.unit, currentUnit)) return { amount: round(candidate.amount), unit: currentUnit };
    const converted = convertUnits(candidate.amount, candidate.unit, currentUnit, conversions);
    if (converted != null) return { amount: round(converted), unit: currentUnit };
  }
  return null;
}

// How many nutrients the scan actually read off the label (not counting the
// zeros labelNutrition fills in for a supplement).
export function countReadNutrients(scan: NutritionLabelScan): number {
  return ALL_NUTRITION_FIELDS.filter((field) => scan.nutrition[field] != null).length;
}
