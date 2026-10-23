import type { GymSessionRecord } from "@/src/services/gymApi";
import type { WeightEntry } from "@/src/services/weightEntryApi";

// A session's calories (burned moving, on top of at rest): your Watch's,
// when it measured them in a workout (heart rate every few seconds) —
// worn without one, it checks every few minutes and counts mostly
// movement, which lifting has little of, so it reads far too low and isn't
// used; nor are the workouts another app (Hevy) saves to Apple Health,
// whose calories are its own formula. Otherwise an estimate — from your own rate,
// learned from the sessions it did measure (calories for each kilo of you,
// each hour), made a little higher or lower by how dense the session was
// (working sets a minute) and how much of it was big lower-body lifts,
// against your usual. With nothing measured yet, a standard rate for
// lifting (about 4.5 METs, so 3.5 above rest). Never from the weight moved:
// the work of lifting a bar is a small part of what a session costs.

const STANDARD_RATE = 3.5; // kcal a kilo an hour, above rest
const BIG = new Set(["quadriceps", "glutes", "hamstrings", "lower back"]);

type Shape = { hours: number; density: number; big: number };

// How long, how dense (working sets a minute), and the share of working
// sets that were big lower-body lifts.
function shape(s: GymSessionRecord): Shape {
  const hours = Math.max(1 / 60, (new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 3_600_000);
  let sets = 0;
  let big = 0;
  for (const e of s.exercises) {
    const working = e.sets.filter((x) => x.type !== "warmup").length;
    sets += working;
    if (e.exercise?.primaryMuscles.some((m) => BIG.has(m))) big += working;
  }
  return { hours, density: sets / (hours * 60), big: sets ? big / sets : 0 };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export interface SessionCalories {
  kcal: number;
  measured: boolean;
  how: string[]; // in your numbers
}

// `all`: your sessions (the measured ones teach the rate); `weightKg`:
// yours; `ratio`: your Watch's correction (Your burn) — a measured session's
// calories are corrected by it, the same as your days are.
export function sessionCalories(session: GymSessionRecord, all: GymSessionRecord[], weightKg: number | null, ratio: number | null = null): SessionCalories | null {
  const v = session.vitals;
  if (v?.watchWorkout && v.kcal != null && v.kcal > 0) {
    const kcal = Math.round(v.kcal * (ratio ?? 1));
    return {
      kcal,
      measured: true,
      how: [
        "Measured by your Watch during the session — a workout was running on it, so your heart rate was taken every few seconds.",
        ratio != null ? `It counted ${Math.round(v.kcal)} kcal; × ${ratio.toFixed(2)}, your Watch's correction from your measured burn (Your burn), = ${kcal}.` : "Not corrected yet — your Watch's correction comes once your burn is measured.",
      ],
    };
  }
  if (weightKg == null) return null;
  const mine = all.filter((s) => s.vitals?.watchWorkout && s.vitals.kcal != null && s.vitals.kcal > 0 && shape(s).hours >= 1 / 6);
  const rates = mine.map((s) => (s.vitals!.kcal! * (ratio ?? 1)) / (weightKg * shape(s).hours));
  const rate = median(rates) ?? STANDARD_RATE;
  const usualDensity = median(mine.map((s) => shape(s).density));
  const usualBig = median(mine.map((s) => shape(s).big));
  const me = shape(session);
  // (Denser than usual: more; looser: less — by the square root, and no
  // more than a quarter either way. Big lifts: up to 15% more or less.)
  const denser = usualDensity ? Math.max(0.8, Math.min(1.25, Math.sqrt(me.density / usualDensity))) : 1;
  const bigger = usualBig != null ? Math.max(0.85, Math.min(1.15, 1 + 0.3 * (me.big - usualBig))) : 1;
  const kcal = Math.round((rate * denser * bigger * weightKg * me.hours) / 5) * 5;
  const how = [
    mine.length
      ? `Your rate: ${rate.toFixed(1)} kcal for each kilo an hour — from ${mine.length} session${mine.length === 1 ? "" : "s"} your Watch measured.`
      : `A standard rate for lifting (${STANDARD_RATE} kcal a kilo an hour) — your own comes once your Watch measures a session (start a strength workout on it while you lift).`,
    `${Math.round(me.hours * 60)} minutes at ${weightKg.toFixed(1)} kg.`,
    ...(denser !== 1 ? [`${me.density.toFixed(2)} working sets a minute against your usual ${usualDensity!.toFixed(2)}: ×${denser.toFixed(2)}.`] : []),
    ...(bigger !== 1 ? [`${Math.round(me.big * 100)}% big lower-body lifts against your usual ${Math.round(usualBig! * 100)}%: ×${bigger.toFixed(2)}.`] : []),
    ...(v?.kcal ? [`Your Watch counted ${Math.round(v.kcal)} kcal, worn without a workout started — it checks your heart rate only every few minutes then and counts mostly movement, so lifting reads far too low.`] : []),
    "An estimate, so it isn't counted in your day's burn — only sessions your Watch measures are.",
  ];
  return { kcal, measured: false, how };
}

// Your weight (kg) on a day: the weigh-in nearest before it (or the first).
export function weightOn(weights: WeightEntry[], when: string) {
  const day = when.slice(0, 10);
  const sorted = [...weights].sort((a, b) => b.date.localeCompare(a.date));
  return (sorted.find((w) => w.date <= day) ?? sorted[sorted.length - 1])?.weight ?? null;
}
