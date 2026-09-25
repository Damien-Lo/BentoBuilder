import {
  ALL_NUTRITION_FIELDS,
  NUTRITION_FIELD_META,
  type NutritionField,
  type NutritionInput,
  type PartialNutrition,
} from "@/src/types/nutrition";

// Every nutrient (core and extended) as its own raw text field, as held by
// an editing form — "" means unknown.
export type NutritionFormValues = Record<NutritionField, string>;

export function nutritionToForm(nutrition?: PartialNutrition | null): NutritionFormValues {
  const values = {} as NutritionFormValues;
  for (const field of ALL_NUTRITION_FIELDS) {
    const value = nutrition?.[field];
    values[field] = value != null ? String(value) : "";
  }
  return values;
}

// Fills in whichever fields `incoming` actually reports (e.g. a barcode
// scan); anything it doesn't keeps what was already typed.
export function mergeNutritionForm(
  current: NutritionFormValues,
  incoming?: PartialNutrition | null,
): NutritionFormValues {
  const merged = { ...current };
  for (const field of ALL_NUTRITION_FIELDS) {
    const value = incoming?.[field];
    if (value != null) merged[field] = String(value);
  }
  return merged;
}

// Blank or non-numeric/negative text is omitted (unknown), never sent as 0.
// Every field is included, core and extended — ingredient/restaurant
// updates replace the whole nutrition sub-document server-side, so a form
// that sent back only some fields would silently wipe the rest.
export function nutritionFormToInput(values: NutritionFormValues): NutritionInput {
  const input: NutritionInput = {};
  for (const field of ALL_NUTRITION_FIELDS) {
    const trimmed = values[field].trim();
    if (!trimmed) continue;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 0) input[field] = parsed;
  }
  return input;
}

export function hasAnyNutrition(values: NutritionFormValues): boolean {
  return ALL_NUTRITION_FIELDS.some((field) => values[field].trim() !== "");
}

export function nutritionFieldLabel(field: NutritionField): string {
  const { label, unit } = NUTRITION_FIELD_META[field];
  return unit === "kcal" ? label : `${label} (${unit})`;
}
