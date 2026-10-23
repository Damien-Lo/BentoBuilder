import type { HealthMetric } from "@/src/services/healthSync";
import type { WeightEntry } from "@/src/services/weightEntryApi";

// Your burn — the calories you use in a day — measured, not guessed: over
// four weeks, what you ate, less what your weight did (a kilo ≈ 7,700
// kcal), is what you burned. That's the source of truth. The Watch (at rest
// + moving) is the live reading, corrected to it by your own ratio — it
// runs high or low by a steady amount for each person — so today's "out"
// is the Watch so far × that ratio. Week by week, so the trend, the
// Watch's mismatch and how well it predicts your weight can be seen (Health
// → Your burn).
//
// To keep water and half-logged days out of it: the weight's change is a
// straight line through all four weeks of weigh-ins (each one point of ~28,
// so a water swing barely moves it, and unlike a running average it
// doesn't lag), only complete days of food count (marked "logged
// everything", or near your usual intake), and the burn moves at most 100
// kcal from one week to the next.

const DAY = 86_400_000;
export const KCAL_PER_KG = 7700;
export const WINDOW_DAYS = 28; // what each week's burn looks back over
export const WEEKS = 8; // weeks shown
const MAX_SHIFT = 100; // kcal a week
const NEED_DAYS = 10; // complete days in the window
const NEED_WEIGH_INS = 8; // weigh-ins in the window
// A day the Watch was worn: some activity, and its at-rest figure near your
// usual (it only adds that up while it's on your wrist).
const WATCH_DAY_MIN_ACTIVE = 100;
const WATCH_DAY_MIN_RESTING = 0.8; // of your usual resting

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (date: string, n: number) => dayOf(new Date(new Date(`${date}T12:00:00`).getTime() + n * DAY));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// The weight's change (kg a day): a straight line through the weigh-ins.
function slope(points: { date: string; weight: number }[]) {
  if (points.length < 4) return null;
  const xs = points.map((p) => new Date(`${p.date}T12:00:00`).getTime() / DAY);
  const mx = mean(xs)!;
  const my = mean(points.map((p) => p.weight))!;
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den ? xs.reduce((s, x, i) => s + (x - mx) * (points[i].weight - my), 0) / den : null;
}
function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

export interface EnergyInputs {
  weights: WeightEntry[]; // kg, any order
  intake: { date: string; calories: number }[]; // what was logged, a day at a time
  metrics: HealthMetric[]; // restingEnergy, activeEnergy, foodComplete
  today: string;
  showWeight?: (kg: number) => string; // "2.0 lbs" — in the page's units
}

// A day: what was eaten (and whether it counts), weighed, and burned by the Watch.
export interface EnergyDay {
  date: string;
  eaten: number | null;
  complete: boolean;
  marked: boolean | null; // you said: logged everything (true), not everything (false), or nothing (null)
  markId: string | null;
  weight: number | null; // the weigh-in (kg)
  watch: number | null; // resting + active, when worn
}

// A week: the burn measured over the four weeks to its end, and the Watch's over the same days.
export interface EnergyWeek {
  end: string;
  measured: number | null; // after the week-to-week limit
  raw: number | null; // before it
  watch: number | null;
  ratio: number | null; // measured ÷ Watch
  completeDays: number;
  weighIns: number;
  ate: number | null; // average on complete days
  trendPerWeek: number | null; // kg
}

export interface Energy {
  days: EnergyDay[]; // newest first, today included
  weeks: EnergyWeek[]; // newest first
  measured: number | null; // your burn, when there's enough to measure it
  watchAverage: number | null; // the Watch's, uncorrected (the last four weeks)
  ratio: number | null; // its correction
  completeDays: number; // in the last four weeks
  weighIns: number;
  usualIntake: number | null; // the median logged day — "near your usual" is 60% of it
  // The week just gone, tested: what your burn said your weight would do, and what it did.
  check: { burnBefore: number; ate: number; days: number; predicted: number; actual: number } | null;
  // Today, live: eaten, the Watch so far (corrected), and a usual day by now.
  today: { eaten: number; out: number | null; usualByNow: number | null; synced: boolean };
  // Why this week's numbers might not line up.
  reasons: string[];
}

export function workOutEnergy({ weights, intake, metrics, today, showWeight = (kg) => `${kg.toFixed(1)} kg` }: EnergyInputs, now = new Date()): Energy {
  const span = WEEKS * 7 + WINDOW_DAYS;
  const first = addDays(today, -span);

  const weighed = new Map(weights.map((w) => [w.date, w.weight]));

  // The days: food (complete or not), weight, the Watch.
  const ate = new Map(intake.map((d) => [d.date, d.calories]));
  const usualIntake = median(intake.filter((d) => d.date >= first && d.date < today && d.calories > 0).map((d) => d.calories));
  const marks = new Map(metrics.filter((m) => m.type === "foodComplete").map((m) => [m.date, m]));
  const of = (type: string) => new Map(metrics.filter((m) => m.type === type).map((m) => [m.date, m.value]));
  const resting = of("restingEnergy");
  const active = of("activeEnergy");
  const usualResting = median([...resting].filter(([d]) => d >= first && d < today).map(([, v]) => v));
  const worn = (r: number | undefined, a: number | undefined) => r != null && a != null && a >= WATCH_DAY_MIN_ACTIVE && (usualResting == null || r >= usualResting * WATCH_DAY_MIN_RESTING);
  const days: EnergyDay[] = [];
  for (let d = today; d >= first; d = addDays(d, -1)) {
    const eaten = ate.get(d) ?? null;
    const mark = marks.get(d);
    const marked = mark ? mark.value > 0 : null;
    const auto = eaten != null && eaten > 0 && usualIntake != null && eaten >= usualIntake * 0.6;
    const r = resting.get(d);
    const a = active.get(d);
    days.push({
      date: d,
      eaten,
      complete: d < today && (marked ?? auto),
      marked,
      markId: mark?._id ?? null,
      weight: weighed.get(d) ?? null,
      watch: worn(r, a) && d < today ? r! + a! : null,
    });
  }
  const byDate = new Map(days.map((d) => [d.date, d]));

  // Each week: the four weeks to its end (yesterday, then a week before…).
  const yesterday = addDays(today, -1);
  const weeks: EnergyWeek[] = [];
  for (let k = WEEKS - 1; k >= 0; k--) {
    const end = addDays(yesterday, -7 * k);
    const from = addDays(end, -(WINDOW_DAYS - 1));
    const inWindow = days.filter((d) => d.date >= from && d.date <= end);
    const complete = inWindow.filter((d) => d.complete && d.eaten != null);
    const weighIns = inWindow.filter((d) => d.weight != null).length;
    const avgAte = mean(complete.map((d) => d.eaten!));
    const perDay = slope(inWindow.filter((d) => d.weight != null).map((d) => ({ date: d.date, weight: d.weight! })));
    const enough = complete.length >= NEED_DAYS && weighIns >= NEED_WEIGH_INS && avgAte != null && perDay != null;
    const raw = enough ? avgAte! - perDay! * KCAL_PER_KG : null;
    const watch = mean(inWindow.filter((d) => d.watch != null).map((d) => d.watch!));
    weeks.unshift({ end, measured: null, raw, watch: inWindow.filter((d) => d.watch != null).length >= 7 ? watch : null, ratio: null, completeDays: complete.length, weighIns, ate: avgAte, trendPerWeek: perDay != null ? perDay * 7 : null });
  }
  // Oldest first: each week's burn at most 100 kcal from the one before.
  let last: number | null = null;
  for (const w of [...weeks].reverse()) {
    if (w.raw == null) continue;
    w.measured = last == null ? w.raw : Math.max(last - MAX_SHIFT, Math.min(last + MAX_SHIFT, w.raw));
    last = w.measured;
    w.ratio = w.watch ? w.measured / w.watch : null;
  }

  const now0 = weeks[0];
  const recent = days.filter((d) => d.date > addDays(today, -WINDOW_DAYS - 1) && d.date < today);
  const watchAverage = mean(recent.filter((d) => d.watch != null).map((d) => d.watch!));
  const measured = weeks.find((w) => w.measured != null)?.measured ?? null;
  const ratio = weeks.find((w) => w.ratio != null)?.ratio ?? null;

  // The week just gone, tested against the burn from before it.
  let check: Energy["check"] = null;
  const before = weeks[1]?.measured;
  const week = days.filter((d) => d.date <= yesterday && d.date > addDays(yesterday, -7));
  const weekComplete = week.filter((d) => d.complete && d.eaten != null);
  const weekSlope = slope(week.filter((d) => d.weight != null).map((d) => ({ date: d.date, weight: d.weight! })));
  if (before != null && weekComplete.length >= 3 && weekSlope != null) {
    const weekAte = mean(weekComplete.map((d) => d.eaten!))!;
    check = { burnBefore: before, ate: weekAte, days: weekComplete.length, predicted: ((weekAte - before) * 7) / KCAL_PER_KG, actual: weekSlope * 7 };
  }

  // Today, live (the Watch as of the last sync).
  const todayDay = byDate.get(today);
  const r = resting.get(today);
  const a = active.get(today);
  const soFar = r != null || a != null ? (r ?? 0) + (a ?? 0) : null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const usual = measured ?? watchAverage;

  // Why this week might not line up.
  const reasons: string[] = [];
  const partial = week.filter((d) => !d.complete);
  if (partial.length) reasons.push(`${partial.length} of the last 7 days ${partial.length === 1 ? "isn't" : "aren't"} counted as fully logged — left out, so they can't pull your burn down.`);
  const weighs = week.filter((d) => d.weight != null).sort((x, y) => x.date.localeCompare(y.date));
  for (let i = 1; i < weighs.length; i++) {
    const jump = weighs[i].weight! - weighs[i - 1].weight!;
    if (Math.abs(jump) >= 0.9) reasons.push(`A ${jump > 0 ? "jump" : "drop"} of ${showWeight(Math.abs(jump))} on ${new Date(`${weighs[i].date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" })} — most likely water (salt, carbs, a hard session); in a line through four weeks of weigh-ins it barely counts.`);
  }
  const noWatch = week.filter((d) => d.watch == null).length;
  if (noWatch) reasons.push(`The Watch has ${noWatch} day${noWatch === 1 ? "" : "s"} without a full reading this week — left out of its correction.`);
  if (weeks[0]?.ratio != null && weeks[1]?.ratio != null && Math.abs(weeks[0].ratio - weeks[1].ratio) >= 0.03) reasons.push(`The Watch's correction moved from ×${weeks[1].ratio.toFixed(2)} to ×${weeks[0].ratio.toFixed(2)} — it's off by different amounts for different things (lifting, walking, running), so a change in what you did moves it.`);
  if (weeks[0]?.raw != null && weeks[0].measured != null && Math.abs(weeks[0].raw - weeks[0].measured) > 1) reasons.push(`This week's figure came to ${Math.round(weeks[0].raw).toLocaleString()}; it's held to ${Math.round(weeks[0].measured).toLocaleString()} (100 kcal from last week's) until more weeks agree.`);

  return {
    days,
    weeks,
    measured,
    watchAverage,
    ratio,
    completeDays: now0?.completeDays ?? 0,
    weighIns: now0?.weighIns ?? 0,
    usualIntake,
    check,
    today: { eaten: todayDay?.eaten ?? 0, out: soFar != null ? soFar * (ratio ?? 1) : null, usualByNow: usual != null ? (usual * minutes) / 1440 : null, synced: soFar != null },
    reasons,
  };
}
