import type { ActivityLevel, Sex } from "@/src/services/settingsService";

// Your health numbers, from who you are (Health → About you) and your
// weight: your age, BMI and the healthy weights for your height, the
// calories you burn at rest (BMR, by Mifflin–St Jeor) and in a day (TDEE),
// a calorie target toward your goal weight, and protein to aim for. In
// kilograms and cm, as they're kept.

export const KG_PER_LB = 0.45359237;

export const ACTIVITY: { id: ActivityLevel; label: string; hint: string; factor: number }[] = [
  { id: "sedentary", label: "Mostly sitting", hint: "A desk job, little exercise", factor: 1.2 },
  { id: "light", label: "Lightly active", hint: "Exercise 1–3 days a week", factor: 1.375 },
  { id: "moderate", label: "Active", hint: "Exercise 3–5 days a week", factor: 1.55 },
  { id: "active", label: "Very active", hint: "Hard exercise 6–7 days a week", factor: 1.725 },
  { id: "very", label: "Athlete", hint: "Training twice a day, or a physical job", factor: 1.9 },
];

// Whole years since a "YYYY-MM-DD" date of birth.
export function ageOn(birthDate: string | null, today = new Date()): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

// 180 → 5′ 11″.
export function feetInches(cm: number) {
  const inches = Math.round(cm / 2.54);
  return { feet: Math.floor(inches / 12), inches: inches % 12, text: `${Math.floor(inches / 12)}′ ${inches % 12}″` };
}
export const cmFrom = (feet: number, inches: number) => Math.round((feet * 12 + inches) * 2.54 * 10) / 10;

export function bmi(weightKg: number, heightCm: number) {
  const m = heightCm / 100;
  return weightKg / (m * m);
}
export function bmiCategory(value: number) {
  if (value < 18.5) return "Underweight";
  if (value < 25) return "Healthy";
  if (value < 30) return "Overweight";
  return "Obese";
}
// The weights a BMI of 18.5–24.9 is for this height (kg).
export function healthyRange(heightCm: number) {
  const m2 = (heightCm / 100) ** 2;
  return { low: 18.5 * m2, high: 24.9 * m2 };
}

// Calories a day at rest (Mifflin–St Jeor). Sex unknown: halfway between.
export function bmr(weightKg: number, heightCm: number, age: number, sex: Sex | null) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return base + (sex === "male" ? 5 : sex === "female" ? -161 : -78);
}
export const tdee = (rest: number, level: ActivityLevel) => rest * (ACTIVITY.find((a) => a.id === level)?.factor ?? 1.2);

// A day's calories toward the goal weight, at your pace (Health → Targets;
// half a kilo a week to lose, a quarter to gain, unless you've chosen):
// 1,100 kcal a day for each kilo a week; the same, within a kilo (about 2
// lbs). Never under a floor (1,500 for men, 1,200 for women) or your BMR.
export function calorieTarget(burn: number, rest: number, weightKg: number, goalKg: number | null, sex: Sex | null, pace: { losePace?: number; gainPace?: number } = {}) {
  const diff = goalKg == null ? 0 : goalKg - weightKg;
  const aim = Math.abs(diff) < 0.9 ? "maintain" : diff < 0 ? "lose" : "gain";
  const floor = Math.max(rest, sex === "female" ? 1200 : 1500);
  const kcal = aim === "lose" ? Math.max(floor, burn - (pace.losePace ?? 0.5) * 1100) : aim === "gain" ? burn + (pace.gainPace ?? 0.25) * 1100 : burn;
  return { kcal: Math.round(kcal / 10) * 10, aim } as const;
}

// Protein a day: 1.54–2.2 g for each kilo of your goal weight (or your
// weight, without one) — 0.7–1 g a pound, the range strength training is
// usually given.
export const PROTEIN_PER_KG = { low: 1.5432, high: 2.2046 };
export function proteinRange(weightKg: number, goalKg: number | null) {
  const base = goalKg ?? weightKg;
  return { low: Math.round((base * PROTEIN_PER_KG.low) / 5) * 5, high: Math.round((base * PROTEIN_PER_KG.high) / 5) * 5 };
}
