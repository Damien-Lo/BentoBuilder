import { ACTIVITY, ageOn, bmr, KG_PER_LB, tdee } from "@/src/components/health/bodyStats";
import { workOutEnergy, type Energy } from "@/src/components/health/energy";
import { showMeasure } from "@/src/components/health/units";
import type { HealthMetric } from "@/src/services/healthSync";
import type { ActivityLevel, AppSettings, Sex, Units } from "@/src/services/settingsService";
import type { WeightEntry } from "@/src/services/weightEntryApi";

// Targets — the daily and weekly numbers that get you to your goal — worked
// out from whatever Health knows. Every target always has a number: what's
// missing is filled with a standard value (an adult's usual height, 30 years
// old, lightly active…), and each thing you add — About you, weigh-ins,
// food logs, Apple Health, Gym — takes the place of one, so the targets get
// more yours as you go. Each says what it's based on, which of that is yours
// and which is standard, and where to add the rest. (A first version:
// suggested, not yet kept; see app/health/targets.tsx.)

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const daysAgo = (n: number) => dayOf(new Date(Date.now() - n * DAY));
const to5 = (n: number) => Math.round(n / 5) * 5;
const to10 = (n: number) => Math.round(n / 10) * 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const n0 = (n: number) => Math.round(n).toLocaleString();

// Standard values, for what isn't known yet.
const STANDARD = {
  heightCm: { male: 176, female: 163, unknown: 170 },
  weightKg: { male: 80, female: 65, unknown: 72 },
  age: 30,
  activity: "light" as ActivityLevel,
};
const sexKey = (sex: Sex | null) => sex ?? "unknown";

export interface Inputs {
  settings: AppSettings;
  weights: WeightEntry[]; // kg, newest first
  metrics: HealthMetric[]; // the last four weeks'
  intake: { date: string; calories: number }[]; // days with food logged
  workoutsPerWeek: number[]; // the last four weeks', oldest first
  units: Units; // how weights and heights read
}

// One thing a target is based on: yours, or a standard value for now (and
// where to add yours).
export interface Basis {
  label: string;
  value: string;
  yours: boolean;
  add?: { text: string; href: string };
}

export interface Target {
  key: string;
  label: string;
  value: number;
  unit: string;
  per: "day" | "week" | "night";
  // Where it sits: the Health list's groups, and the page it belongs to.
  group: "Activity & fitness" | "Sleep & mind" | "Nutrition";
  page: string;
  current: number | null; // what's set now, for the targets you can set
  // The same for everyone (sodium's limit) — not worked out from your data.
  guideline?: boolean;
  basis: Basis[];
  how: string[]; // how it was worked out, in your numbers
}

// How personal a target is: all yours, partly, or standard values only
// (or a guideline, the same for everyone).
export function fit(t: Target): "yours" | "partly" | "standard" | "guideline" {
  if (t.guideline) return "guideline";
  const mine = t.basis.filter((b) => b.yours).length;
  return mine === t.basis.length ? "yours" : mine ? "partly" : "standard";
}

const ABOUT = "/health/about";

// How fast toward the goal weight, a week: the choices, in round numbers for
// each (pounds or kilograms), and where it starts. A kilo a week ≈ 1,100
// kcal a day (7,700 a kilo).
export const PACES = {
  lose: { imperial: [0.5, 1, 1.5, 2], metric: [0.25, 0.5, 0.75, 1] },
  gain: { imperial: [0.25, 0.5, 1], metric: [0.1, 0.25, 0.5] },
};
// Where it starts (kg a week): a pound or half a kilo to lose, a quarter
// of either to gain — round in the units you see.
export const defaultPace = (direction: "lose" | "gain", units: Units) => (direction === "lose" ? 1 : 0.25) * (units === "imperial" ? KG_PER_LB : direction === "lose" ? 0.5 : 1);
export const KCAL_PER_KG_WEEK = 1100;

// Where you're headed, and how fast.
export interface Aim {
  direction: "lose" | "gain" | "stay";
  weightKg: number | null; // yours, from the last weigh-in
  goalKg: number | null;
  pace: number; // kg a week, as chosen
  actualPace: number; // after the calorie floor (kg a week)
  weeks: number | null; // to the goal, at that pace
}

export type Burn = { value: number; how: "measured" | "apple" | "formula" };

export function workOutTargets({ settings, weights, metrics, intake, workoutsPerWeek, units }: Inputs): { targets: Target[]; burn: Burn; aim: Aim; energy: Energy } {
  const s = settings;
  const kg = (v: number) => showMeasure("weight", v, units);
  const sk = sexKey(s.sex);
  const ofType = (type: string, days: number) => metrics.filter((m) => m.type === type && m.date >= daysAgo(days));

  // Who you are — yours where it's known, standard where it isn't.
  const age = ageOn(s.birthDate);
  const weightKg = weights[0]?.weight ?? null;
  const w = weightKg ?? STANDARD.weightKg[sk];
  const h = s.heightCm ?? STANDARD.heightCm[sk];
  const a = age ?? STANDARD.age;
  const level = s.activityLevel ?? STANDARD.activity;
  const goal = s.goalWeight;
  const lean = ofType("leanMass", 60).sort((x, y) => y.date.localeCompare(x.date))[0]?.value ?? null;

  const you = {
    sex: { label: "Sex", value: s.sex ? (s.sex === "male" ? "Male" : "Female") : "Not set — halfway between", yours: !!s.sex, add: { text: "Add in About you", href: ABOUT } },
    age: { label: "Age", value: age != null ? `${age}` : `${STANDARD.age} (standard)`, yours: age != null, add: { text: "Add your date of birth", href: ABOUT } },
    height: { label: "Height", value: `${showMeasure("length", h, units, 0)}${s.heightCm ? "" : " (standard)"}`, yours: !!s.heightCm, add: { text: "Add in About you", href: ABOUT } },
    weight: { label: "Weight", value: `${kg(w)}${weightKg != null ? "" : " (standard)"}`, yours: weightKg != null, add: { text: "Log a weigh-in", href: "/health/weight" } },
    activity: { label: "How active", value: `${ACTIVITY.find((x) => x.id === level)?.label}${s.activityLevel ? "" : " (standard)"}`, yours: !!s.activityLevel, add: { text: "Add in About you", href: ABOUT } },
    goal: { label: "Goal weight", value: goal != null ? kg(goal) : "None — staying the same", yours: goal != null },
  } satisfies Record<string, Basis>;
  const yoursOnly = (b: Basis): Basis => (b.yours ? { ...b, add: undefined } : b);

  // Your daily burn, the best way there's data for: measured (what you ate,
  // less what the scale says it did — energy.ts), Apple Watch's (at rest +
  // moving), or the formula (Mifflin–St Jeor × how active).
  const energy = workOutEnergy({ weights, intake, metrics, today: dayOf(new Date()), showWeight: kg });
  const active = ofType("activeEnergy", 14);
  const rest = bmr(w, h, a, s.sex);
  let burn: Burn;
  const burnBasis: Basis[] = [];
  const burnHow: string[] = [];
  const recentWeek = energy.weeks[0];
  if (energy.measured != null) {
    burn = { value: energy.measured, how: "measured" };
    burnBasis.push({ label: "Food logged", value: `${energy.completeDays} complete days in 4 weeks`, yours: true }, { label: "Weigh-ins", value: `${energy.weighIns} in 4 weeks`, yours: true });
    burnHow.push(`You ate ${n0(recentWeek?.ate ?? 0)} kcal a day on average (on fully logged days) while your weight trend moved ${showMeasure("weight", recentWeek?.trendPerWeek ?? 0, units, 2)} a week — so you burn about ${n0(burn.value)} a day (a kilo ≈ 7,700 kcal). The details are in Your burn.`);
  } else if (energy.watchAverage != null) {
    burn = { value: energy.watchAverage, how: "apple" };
    burnBasis.push({ label: "Apple Watch burn", value: "the last 4 weeks", yours: true });
    burnBasis.push({ label: "Food logged + weigh-ins", value: `${energy.completeDays} of 10 complete days, ${energy.weighIns} of 8 weigh-ins`, yours: false, add: { text: "Log food in Kitchen for 4 weeks", href: "/kitchen" } });
    burnHow.push(`Your Watch says you burn ${n0(burn.value)} kcal a day (at rest + moving). Once there are 4 weeks of food logs and weigh-ins, it's measured from those instead — and the Watch corrected to match.`);
  } else {
    burn = { value: tdee(rest, level), how: "formula" };
    burnBasis.push(you.sex, you.age, you.height, you.weight, you.activity);
    burnHow.push(`At rest ≈ ${n0(rest)} kcal (Mifflin–St Jeor, from sex, age, height and weight), × ${ACTIVITY.find((x) => x.id === level)?.factor} for how active you are = ${n0(burn.value)} kcal a day.`);
  }

  const targets: Target[] = [];

  // Calories: toward the goal at your pace.
  const losing = goal != null && goal < w - 0.9;
  const gaining = goal != null && goal > w + 0.9;
  const pace = losing ? (s.targets.losePace ?? defaultPace("lose", units)) : gaining ? (s.targets.gainPace ?? defaultPace("gain", units)) : 0;
  const shift = pace * KCAL_PER_KG_WEEK;
  const floor = Math.max(rest, s.sex === "female" ? 1200 : 1500);
  const raw = losing ? burn.value - shift : gaining ? burn.value + shift : burn.value;
  const kcal = to10(Math.max(floor, raw));
  const actualPace = Math.abs(kcal - burn.value) / KCAL_PER_KG_WEEK;
  const aim: Aim = {
    direction: losing ? "lose" : gaining ? "gain" : "stay",
    weightKg,
    goalKg: goal,
    pace,
    actualPace,
    weeks: goal != null && weightKg != null && (losing || gaining) && actualPace > 0 ? Math.abs(weightKg - goal) / actualPace : null,
  };
  const pacePart = { label: "Pace", value: pace ? `${showMeasure("weight", pace, units, 2)} a week` : "—", yours: true };
  targets.push({
    key: "calories",
    label: "Calories",
    value: kcal,
    unit: "kcal",
    per: "day",
    group: "Nutrition", page: "/health",
    current: s.dailyCalorieLimit,
    basis: [...burnBasis, you.goal, ...(losing || gaining ? [pacePart] : [])],
    how: [
      ...burnHow,
      losing || gaining ? `${losing ? "−" : "+"} ${n0(shift)} kcal a day ≈ ${showMeasure("weight", pace, units, 2)} a week toward ${kg(goal!)} — your pace, set under Goal.` : "The same as you burn, to stay where you are.",
      ...(raw < floor ? [`Kept at ${n0(floor)}: never under your burn at rest or ${s.sex === "female" ? "1,200" : "1,500"} — so about ${showMeasure("weight", actualPace, units, 2)} a week instead.`] : []),
    ],
  });

  // Protein: lean mass where a scale gives it, else goal (or current) weight.
  const proteinBase = lean ?? goal ?? w;
  const protein = to5(proteinBase * (lean != null ? 2.3 : 1.8));
  targets.push({
    key: "protein",
    label: "Protein",
    value: protein,
    unit: "g",
    per: "day",
    group: "Nutrition", page: "/health",
    current: s.dailyProteinLimit,
    basis: lean != null ? [{ label: "Lean mass", value: `${kg(lean)}, from your scale`, yours: true }] : [goal != null ? yoursOnly(you.goal) : you.weight, { label: "Lean mass", value: "Not measured", yours: false, add: { text: "A smart scale adds it via Apple Health", href: "/health/section/body" } }],
    how: lean != null ? [`2.3 g for each kilo of lean mass (${kg(lean)}) — enough to keep muscle while losing fat, and build it while training.`] : [`1.8 g for each kilo of ${goal != null ? "goal " : ""}weight (${kg(proteinBase)}). With lean mass from a scale it's worked out from your muscle instead.`],
  });

  // Fat, then carbs as the rest, then fibre — from the calories you've set
  // (the suggestion, until you set them).
  const aimKcal = s.dailyCalorieLimit ?? kcal;
  const calPart: Basis = { label: s.dailyCalorieLimit != null ? "Your calories" : "Suggested calories", value: `${n0(aimKcal)} kcal`, yours: fit(targets[0]) !== "standard" };
  const fat = to5(Math.max(0.7 * (goal ?? w), (aimKcal * 0.25) / 9));
  targets.push({ key: "fats", label: "Fat", value: fat, unit: "g", per: "day", group: "Nutrition", page: "/health", current: s.dailyFatsLimit, basis: [calPart, goal != null ? yoursOnly(you.goal) : you.weight], how: ["At least 0.7 g a kilo, and a quarter of your calories — for hormones and to absorb vitamins."] });
  const carbs = Math.max(0, to5((aimKcal - protein * 4 - fat * 9) / 4));
  targets.push({ key: "carbs", label: "Carbs", value: carbs, unit: "g", per: "day", group: "Nutrition", page: "/health", current: s.dailyCarbsLimit, basis: [calPart, { label: "Protein and fat", value: `${protein} g, ${fat} g`, yours: true }], how: [`What's left of ${n0(aimKcal)} kcal after protein (${protein} g × 4 kcal) and fat (${fat} g × 9 kcal) — fuel for training.`] });
  targets.push({ key: "fiber", label: "Fibre", value: Math.round((aimKcal / 1000) * 14), unit: "g", per: "day", group: "Nutrition", page: "/health", current: s.dailyFiberLimit, basis: [calPart], how: ["14 g for every 1,000 kcal — the usual guideline."] });

  // Sodium: under the guideline's 2,300 mg.
  targets.push({ key: "sodium", label: "Sodium", value: 2300, unit: "mg", per: "day", group: "Nutrition", page: "/health", current: s.dailySodiumLimit, guideline: true, basis: [], how: ["Under 2,300 mg a day — the limit for adults in the dietary guidelines, the same for everyone (about a teaspoon of salt). Less is better for blood pressure."] });

  // Water: 35 ml a kilo, + 500 ml when you're active.
  const activeAvg = mean(active.map((m) => m.value));
  const ml = Math.round((w * 35 + (activeAvg != null && activeAvg > 500 ? 500 : 0)) / 100) * 100;
  targets.push({
    key: "water",
    label: "Water",
    value: ml,
    unit: "mL",
    per: "day",
    group: "Nutrition", page: "/health/section/drinks",
    current: s.targets.water ?? null,
    basis: [you.weight, activeAvg != null ? { label: "Active calories", value: `${n0(activeAvg)} a day`, yours: true } : { label: "Active calories", value: "Not tracked", yours: false, add: { text: "Connect Apple Health", href: "/health-section" } }],
    how: [`35 ml for each kilo you weigh (${kg(w)})${activeAvg != null && activeAvg > 500 ? `, + 500 ml as you're active (${n0(activeAvg)} active kcal a day)` : ""}.`],
  });

  // Steps: your last four weeks, nudged up — or a starting 8,000.
  const steps = ofType("steps", 28).map((m) => m.value);
  const avgSteps = mean(steps);
  const stepsYours = avgSteps != null && steps.length >= 7;
  targets.push({
    key: "steps",
    label: "Steps",
    value: stepsYours ? Math.min(12000, Math.round((avgSteps! * 1.08) / 500) * 500) : 8000,
    unit: "steps",
    per: "day",
    group: "Activity & fitness", page: "/health/section/activity",
    current: s.targets.steps ?? null,
    basis: [stepsYours ? { label: "Your steps", value: `${n0(avgSteps!)} a day, ${steps.length} days`, yours: true } : { label: "Your steps", value: `${steps.length} of 7 days`, yours: false, add: { text: "Connect Apple Health", href: "/health-section" } }],
    how: stepsYours ? [`You've averaged ${n0(avgSteps!)} a day over ${steps.length} days; about 8% more, rounded — up again once you hit it most days (to 12,000 at most).`] : ["8,000 a day to start, until there's a week of steps from Apple Health."],
  });

  // Exercise: at least 150 minutes a week, more if you already do more.
  const exDays = ofType("exerciseMinutes", 28);
  const exWeek = exDays.reduce((sum, m) => sum + m.value, 0) / 4;
  const exYours = exDays.length >= 7;
  targets.push({
    key: "exercise",
    label: "Exercise",
    value: exYours ? Math.max(150, to10(exWeek * 1.05)) : 150,
    unit: "min",
    per: "week",
    group: "Activity & fitness", page: "/health/section/activity",
    current: s.targets.exercise ?? null,
    basis: [exYours ? { label: "Your exercise", value: `${n0(exWeek)} min a week lately`, yours: true } : { label: "Your exercise", value: "Not tracked yet", yours: false, add: { text: "Connect Apple Health", href: "/health-section" } }],
    how: [`At least 150 minutes a week (the WHO's guideline)${exYours ? `; you've averaged ${n0(exWeek)} lately, so a little more than that` : ""}.`],
  });

  // Workouts: your own pattern, or 3 a week to start.
  const trained = workoutsPerWeek.some(Boolean);
  const perWeek = mean(workoutsPerWeek) ?? 0;
  targets.push({
    key: "workouts",
    label: "Workouts",
    value: trained ? Math.max(2, Math.round(perWeek)) : 3,
    unit: "",
    per: "week",
    group: "Activity & fitness", page: "/health/section/workouts",
    current: s.targets.workouts ?? null,
    basis: [trained ? { label: "Gym sessions", value: `${workoutsPerWeek.join(", ")} in the last 4 weeks`, yours: true } : { label: "Gym sessions", value: "None in 4 weeks", yours: false, add: { text: "Log a workout in Gym", href: "/gym" } }],
    how: trained ? ["Your usual week — to keep the habit, not to add more."] : ["3 a week to start — enough for every muscle twice."],
  });

  // Sleep: 8 hours, the middle of 7–9 (more under 18).
  const nights = ofType("sleep", 28);
  const avgSleep = mean(nights.map((m) => m.value));
  const sleepH = age != null && age < 18 ? 9 : 8;
  targets.push({
    key: "sleep",
    label: "Sleep",
    value: sleepH * 60,
    unit: "min",
    per: "night",
    group: "Sleep & mind", page: "/health/section/sleep",
    current: s.targets.sleep ?? null,
    basis: [yoursOnly(you.age), nights.length >= 7 ? { label: "Nights tracked", value: `${nights.length} in 4 weeks, ${Math.floor(avgSleep! / 60)}h ${Math.round(avgSleep! % 60)}m on average`, yours: true } : { label: "Nights tracked", value: `${nights.length} in 4 weeks`, yours: false, add: { text: "Wear your Watch to bed", href: "/health/section/sleep" } }],
    how: [`${sleepH === 9 ? "8–10" : "7–9"} hours for your age; ${sleepH} to aim for.`, ...(avgSleep != null ? [`You've slept ${Math.floor(avgSleep / 60)}h ${Math.round(avgSleep % 60)}m a night on average${avgSleep < sleepH * 60 - 30 ? " — earlier nights would help recovery and appetite" : ""}.`] : [])],
  });

  // In the usual order (fat's worked out before carbs, which are the rest).
  const ORDER = ["calories", "protein", "carbs", "fats", "fiber", "sodium", "water", "steps", "exercise", "workouts", "sleep"];
  targets.sort((x, y) => ORDER.indexOf(x.key) - ORDER.indexOf(y.key));
  return { targets, burn, aim, energy };
}
