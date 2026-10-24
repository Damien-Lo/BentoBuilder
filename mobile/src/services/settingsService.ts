import { API_BASE_URL } from "@/src/config/api";
import { EXTENDED_NUTRITION_FIELDS, type ExtendedNutritionField } from "@/src/types/nutrition";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";

// Daily goals for the background-tracked nutrients, in the same absolute
// units as the nutrition values (vitamin A in mcg, vitamin C/calcium/iron in
// mg — even though those display as %DV). Missing/null = no goal set.
export type ExtendedNutrientGoals = Partial<Record<ExtendedNutritionField, number | null>>;

export interface AppSettings {
  displayName: string;
  dailyCalorieLimit: number | null;
  dailyProteinLimit: number | null;
  dailyCarbsLimit: number | null;
  dailyFatsLimit: number | null;
  dailyFiberLimit: number | null;
  dailySodiumLimit: number | null;
  extendedNutrientGoals: ExtendedNutrientGoals;
  // 0 = Sunday … 6 = Saturday, matching JS Date#getDay()
  weekStartDay: number;
  // Waits (in days) for the planner's automatic rating prompt — see
  // utils/ratingPrompt.ts.
  ratingCooldownDays: number;
  ratingSettledCooldownDays: number;
  ratingSkipBackoffDays: number;
  // Custom conversions on top of the app's built-in mass/volume table.
  unitConversions: CustomUnitConversion[];
  // The goal weight, and where this goal started — your weight when it was
  // set, kept by the server (never sent: setting the goal sets it). Goals
  // before this one, when it changed direction, are in pastGoals.
  startingWeight: number | null;
  startingWeightDate: string | null;
  goalWeight: number | null;
  goalDirection: GoalDirection | null;
  pastGoals: PastGoal[];
  // About you (Health → About you): what the health numbers are worked out
  // from. Height in cm; born "YYYY-MM-DD".
  sex: Sex | null;
  birthDate: string | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  // How each Health page shows its measurements (stored the same either
  // way): { weight: "metric", … } — imperial unless said.
  unitPrefs: Partial<Record<string, Units>>;
  // Health → Targets: your pace toward the goal weight, and your own
  // targets beyond the daily nutrition goals (unset: the suggestion).
  targets: TargetPrefs;
}
export interface TargetPrefs {
  losePace?: number; // kg a week
  gainPace?: number; // kg a week
  water?: number; // mL a day
  steps?: number; // a day
  exercise?: number; // minutes a week
  workouts?: number; // a week
  sleep?: number; // minutes a night
}
export type GoalDirection = "lose" | "gain" | "stay";
export interface PastGoal {
  direction: GoalDirection | null;
  goalWeight: number | null;
  startWeight: number | null;
  startDate: string | null;
  endWeight: number | null;
  endDate: string | null;
}
export type Units = "imperial" | "metric";
export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very";

// Also the initial state for screens that show settings before loadSettings
// resolves.
export const DEFAULT_SETTINGS: AppSettings = {
  displayName: "",
  dailyCalorieLimit: null,
  dailyProteinLimit: null,
  dailyCarbsLimit: null,
  dailyFatsLimit: null,
  dailyFiberLimit: null,
  dailySodiumLimit: null,
  extendedNutrientGoals: {},
  weekStartDay: 1,
  ratingCooldownDays: 10,
  ratingSettledCooldownDays: 30,
  ratingSkipBackoffDays: 60,
  unitConversions: [],
  startingWeight: null,
  startingWeightDate: null,
  goalWeight: null,
  goalDirection: null,
  pastGoals: [],
  sex: null,
  birthDate: null,
  heightCm: null,
  activityLevel: null,
  unitPrefs: {},
  targets: {},
};
const DEFAULTS = DEFAULT_SETTINGS;

function parseExtendedNutrientGoals(raw: unknown): ExtendedNutrientGoals {
  const goals: ExtendedNutrientGoals = {};
  if (!raw || typeof raw !== "object") return goals;
  const obj = raw as Record<string, unknown>;
  for (const field of EXTENDED_NUTRITION_FIELDS) {
    const v = obj[field];
    if (typeof v === "number" && Number.isFinite(v)) goals[field] = v;
  }
  return goals;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json() as { success: boolean; message?: string };
  if (!res.ok) throw new Error((json as { message?: string }).message ?? `Request failed: ${res.status}`);
  return json as T;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/profile`);
    const result = await parseResponse<{ success: boolean; data: Record<string, unknown> }>(res);
    const d = result.data;
    // Only pick known AppSettings fields — never let _id / __v etc. into state
    return {
      displayName:       typeof d.displayName       === "string" ? d.displayName       : DEFAULTS.displayName,
      dailyCalorieLimit: typeof d.dailyCalorieLimit === "number" ? d.dailyCalorieLimit : DEFAULTS.dailyCalorieLimit,
      dailyProteinLimit: typeof d.dailyProteinLimit === "number" ? d.dailyProteinLimit : DEFAULTS.dailyProteinLimit,
      dailyCarbsLimit:   typeof d.dailyCarbsLimit   === "number" ? d.dailyCarbsLimit   : DEFAULTS.dailyCarbsLimit,
      dailyFatsLimit:    typeof d.dailyFatsLimit    === "number" ? d.dailyFatsLimit    : DEFAULTS.dailyFatsLimit,
      dailyFiberLimit:   typeof d.dailyFiberLimit   === "number" ? d.dailyFiberLimit   : DEFAULTS.dailyFiberLimit,
      dailySodiumLimit:  typeof d.dailySodiumLimit  === "number" ? d.dailySodiumLimit  : DEFAULTS.dailySodiumLimit,
      extendedNutrientGoals: parseExtendedNutrientGoals(d.extendedNutrientGoals),
      weekStartDay:     typeof d.weekStartDay      === "number" ? d.weekStartDay      : DEFAULTS.weekStartDay,
      ratingCooldownDays:        typeof d.ratingCooldownDays        === "number" ? d.ratingCooldownDays        : DEFAULTS.ratingCooldownDays,
      ratingSettledCooldownDays: typeof d.ratingSettledCooldownDays === "number" ? d.ratingSettledCooldownDays : DEFAULTS.ratingSettledCooldownDays,
      ratingSkipBackoffDays:     typeof d.ratingSkipBackoffDays     === "number" ? d.ratingSkipBackoffDays     : DEFAULTS.ratingSkipBackoffDays,
      unitConversions:   Array.isArray(d.unitConversions)        ? (d.unitConversions as CustomUnitConversion[]) : DEFAULTS.unitConversions,
      startingWeight:     typeof d.startingWeight     === "number" ? d.startingWeight     : DEFAULTS.startingWeight,
      startingWeightDate: typeof d.startingWeightDate === "string" ? d.startingWeightDate : DEFAULTS.startingWeightDate,
      goalWeight:         typeof d.goalWeight         === "number" ? d.goalWeight         : DEFAULTS.goalWeight,
      goalDirection: d.goalDirection === "lose" || d.goalDirection === "gain" || d.goalDirection === "stay" ? d.goalDirection : null,
      pastGoals: Array.isArray(d.pastGoals) ? (d.pastGoals as PastGoal[]) : [],
      sex:           d.sex === "male" || d.sex === "female" ? d.sex : null,
      birthDate:     typeof d.birthDate === "string" ? d.birthDate : null,
      heightCm:      typeof d.heightCm === "number" ? d.heightCm : null,
      unitPrefs:
        d.unitPrefs && typeof d.unitPrefs === "object"
          ? Object.fromEntries(Object.entries(d.unitPrefs as Record<string, unknown>).filter(([, v]) => v === "metric" || v === "imperial")) as Partial<Record<string, Units>>
          : {},
      targets:
        d.targets && typeof d.targets === "object"
          ? (Object.fromEntries(Object.entries(d.targets as Record<string, unknown>).filter(([, v]) => typeof v === "number" && v > 0)) as TargetPrefs)
          : {},
      activityLevel: typeof d.activityLevel === "string" && ["sedentary", "light", "moderate", "active", "very"].includes(d.activityLevel) ? (d.activityLevel as ActivityLevel) : null,
    };
  } catch {
    return { ...DEFAULTS, extendedNutrientGoals: {} };
  }
}

// The server $sets only the fields sent — screens that stay mounted (the
// Nutrition tab) should send just the fields they edit, so their possibly-
// stale copy of everything else can't overwrite a change made elsewhere.
export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  await parseResponse<{ success: boolean }>(res);
}
