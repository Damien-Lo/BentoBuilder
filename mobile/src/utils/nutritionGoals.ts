import type { AppSettings } from "@/src/services/settingsService";
import {
  NUTRITION_FIELD_META,
  type CoreNutritionField,
  type NutritionField,
} from "@/src/types/nutrition";

// The core 6's goals predate extended tracking and live as flat
// dailyXLimit fields on the profile; the extended ones live together under
// extendedNutrientGoals. This hides that split from anything that just
// wants "the goal for nutrient X".
const CORE_GOAL_SETTING = {
  calories: "dailyCalorieLimit",
  protein: "dailyProteinLimit",
  carbs: "dailyCarbsLimit",
  fats: "dailyFatsLimit",
  fiber: "dailyFiberLimit",
  sodium: "dailySodiumLimit",
} as const satisfies Record<CoreNutritionField, keyof AppSettings>;

function isCoreField(field: NutritionField): field is CoreNutritionField {
  return field in CORE_GOAL_SETTING;
}

// The goal the user explicitly set, in the field's own unit — null when
// unset.
export function getSetNutrientGoal(settings: AppSettings, field: NutritionField): number | null {
  if (isCoreField(field)) return settings[CORE_GOAL_SETTING[field]];
  return settings.extendedNutrientGoals[field] ?? null;
}

// The goal to measure against: what the user set, or — for the %DV
// nutrients (vitamins/minerals) — the standard Daily Value when nothing is
// set, the same way MyFitnessPal always shows those against 100%.
export function getEffectiveNutrientGoal(settings: AppSettings, field: NutritionField): number | null {
  return getSetNutrientGoal(settings, field) ?? NUTRITION_FIELD_META[field].dailyValue ?? null;
}

export function withNutrientGoal(
  settings: AppSettings,
  field: NutritionField,
  goal: number | null,
): AppSettings {
  if (isCoreField(field)) return { ...settings, [CORE_GOAL_SETTING[field]]: goal };
  return { ...settings, extendedNutrientGoals: { ...settings.extendedNutrientGoals, [field]: goal } };
}
