import type { Ionicons } from "@expo/vector-icons";

import { toShown, UNIT_LABEL, type Measure } from "@/src/components/health/units";
import type { Units } from "@/src/services/settingsService";

// Health's sections — each a page of readings (from Apple Health, or typed
// in): what each reading is, its unit, how it reads, and whether it's a
// day's total (bars) or a figure for the day (a line). Sleep and Workouts
// have pages of their own; the rest are drawn from these.

export interface MetricDef {
  type: string;
  label: string;
  unit: string; // as shown (without a `measure`; with one, by the page's units)
  // What it measures, for imperial or metric: a weight, distance, length,
  // volume or temperature.
  measure?: Measure;
  total?: boolean; // a day's total (steps), not a figure (resting heart rate)
  places?: number;
  // Shown with another reading as one: blood pressure, "120/80".
  pairWith?: string;
  // Can be typed in, as well as come from Apple Health.
  manual?: boolean;
  // Typed in as one of these (a mood), not a number.
  choices?: string[];
  hint?: string;
}

export interface SectionDef {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  metrics: MetricDef[];
}

export const MOODS = ["Awful", "Bad", "Okay", "Good", "Great"];

export const SECTIONS: Record<string, SectionDef> = {
  activity: {
    id: "activity",
    title: "Activity",
    subtitle: "How much you move, day by day",
    icon: "walk",
    metrics: [
      { type: "steps", label: "Steps", unit: "steps", total: true },
      { type: "activeEnergy", label: "Active calories", unit: "kcal", total: true, hint: "Burned moving, on top of at rest" },
      { type: "exerciseMinutes", label: "Exercise", unit: "min", total: true, hint: "Brisk activity or more" },
      { type: "standMinutes", label: "Stand", unit: "min", total: true },
      { type: "distance", label: "Walking & running", unit: "mi", total: true, places: 1, measure: "distance" },
      { type: "flights", label: "Flights climbed", unit: "floors", total: true },
      { type: "restingEnergy", label: "Resting calories", unit: "kcal", total: true, hint: "Burned at rest — Apple's estimate" },
    ],
  },
  body: {
    id: "body",
    title: "Body measurements",
    subtitle: "Body fat, lean mass and waist",
    icon: "body",
    metrics: [
      { type: "bodyFat", label: "Body fat", unit: "%", places: 1, manual: true },
      { type: "leanMass", label: "Lean mass", unit: "lbs", places: 1, manual: true, measure: "weight" },
      { type: "waist", label: "Waist", unit: "in", places: 1, manual: true, hint: "Around your belly button", measure: "length" },
    ],
  },
  heart: {
    id: "heart",
    title: "Heart",
    subtitle: "Resting rate, variability, fitness and pressure",
    icon: "heart",
    metrics: [
      { type: "restingHeartRate", label: "Resting heart rate", unit: "bpm", hint: "Lower usually means fitter" },
      { type: "hrv", label: "Heart rate variability", unit: "ms", hint: "Higher usually means better recovered" },
      { type: "walkingHeartRate", label: "Walking heart rate", unit: "bpm" },
      { type: "vo2max", label: "Cardio fitness (VO₂ max)", unit: "ml/kg/min", places: 1 },
      { type: "systolic", label: "Blood pressure", unit: "mmHg", pairWith: "diastolic", manual: true },
    ],
  },
  vitals: {
    id: "vitals",
    title: "Vitals",
    subtitle: "Blood oxygen, breathing and temperature",
    icon: "pulse",
    metrics: [
      { type: "oxygen", label: "Blood oxygen", unit: "%", places: 0 },
      { type: "respiratoryRate", label: "Breathing rate", unit: "breaths/min", places: 1, hint: "While you sleep" },
      { type: "wristTemp", label: "Wrist temperature", unit: "°F", places: 1, hint: "While you sleep", measure: "temp" },
    ],
  },
  mind: {
    id: "mind",
    title: "Mind",
    subtitle: "Mood and mindful minutes",
    icon: "happy",
    metrics: [
      { type: "mood", label: "Mood", unit: "", manual: true, choices: MOODS, hint: "How you feel, one check-in a day" },
      { type: "mindfulMinutes", label: "Mindful minutes", unit: "min", total: true },
    ],
  },
  drinks: {
    id: "drinks",
    title: "Water & caffeine",
    subtitle: "What you drink",
    icon: "water",
    metrics: [
      { type: "water", label: "Water", unit: "fl oz", total: true, manual: true, measure: "volume" },
      { type: "caffeine", label: "Caffeine", unit: "mg", total: true, manual: true },
    ],
  },
};

// A kept (metric) value as shown, in the units chosen.
export const shownValue = (def: MetricDef, value: number, units: Units) => (def.measure ? toShown(def.measure, value, units) : value);
export const unitLabel = (def: MetricDef, units: Units) => (def.measure ? UNIT_LABEL[units][def.measure] : def.unit);
// Whether a section has anything imperial or metric (so its page offers the
// switch).
export const hasMeasures = (section: SectionDef) => section.metrics.some((m) => m.measure);

// How a reading reads (already in the units shown): "8,412", "7.2", "Good".
export function formatValue(def: MetricDef, value: number) {
  if (def.choices) return def.choices[Math.max(0, Math.min(def.choices.length - 1, Math.round(value) - 1))];
  const places = def.measure === "volume" && value > 100 ? 0 : (def.places ?? 0);
  return value.toLocaleString(undefined, { maximumFractionDigits: places, minimumFractionDigits: places && value % 1 ? 1 : 0 });
}

// The kept unit for a type (what's sent with a typed-in reading).
export const STORED_UNIT: Record<string, string> = { bodyFat: "%", leanMass: "kg", waist: "cm", systolic: "mmHg", diastolic: "mmHg", mood: "", water: "mL", caffeine: "mg" };
