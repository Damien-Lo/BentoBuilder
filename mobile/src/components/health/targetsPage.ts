import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert } from "react-native";

import { differs, SETTING } from "@/src/components/health/TargetParts";
import { dayOf, daysAgo, fit, workOutTargets, type Burn, type Inputs, type Target } from "@/src/components/health/targets";
import { getSessions } from "@/src/services/gymApi";
import { loadHealthInputs } from "@/src/services/healthInputs";
import { saveSettings, type AppSettings, type TargetPrefs, type Units } from "@/src/services/settingsService";

// Your Targets' workings, for its phone page and its desktop one: what
// they're worked out from (loaded each time it's opened), with how far
// along each is; how personal the suggestions are and what would make them
// more so; the changes suggested, to take all at once; and saving a change.

// In the Health list's order; Body is the goal weight and its pace.
export const TARGET_GROUPS: (Target["group"] | "Body")[] = ["Activity & fitness", "Body", "Sleep & mind", "Nutrition"];

// Where your burn, which the calories come from, is from.
export const burnFrom = (burn: Burn) =>
  burn.how === "measured" ? " — measured from your food logs and weigh-ins" : burn.how === "blending" ? ` — calibrating, ${Math.round((burn.share ?? 0) * 100)}% measured so far` : burn.how === "apple" ? " — from your Apple Watch" : " — estimated from About you";

type Loaded = Omit<Inputs, "units"> & { progress: Record<string, number | null> };

export function useTargetsPage(units: Units) {
  const [data, setData] = useState<Loaded | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([loadHealthInputs(), getSessions().catch(() => [])]).then(([{ today, settings, weights, metrics, intake, eaten }, sessions]) => {
      // Workouts in each of the last four weeks (seven days at a time), oldest first.
      const now = Date.now();
      const workoutsPerWeek = [3, 2, 1, 0].map(
        (i) =>
          sessions.filter((s) => {
            const at = new Date(s.startedAt).getTime();
            return at >= now - (i + 1) * 7 * 86_400_000 && at < now - i * 7 * 86_400_000;
          }).length,
      );

      // How far along each is: today (this week for weekly ones, last night for sleep).
      const food = eaten.get(today);
      const on = (type: string, date: string) => metrics.find((m) => m.type === type && m.date === date)?.value ?? null;
      const weekStart = daysAgo((new Date().getDay() + 6) % 7);
      const progress: Record<string, number | null> = {
        calories: food?.calories ?? 0,
        protein: food?.protein ?? 0,
        carbs: food?.carbs ?? 0,
        fats: food?.fats ?? 0,
        fiber: food?.fiber ?? 0,
        sodium: food?.sodium ?? 0,
        water: on("water", today),
        steps: on("steps", today),
        exercise: metrics.filter((m) => m.type === "exerciseMinutes" && m.date >= weekStart).reduce((s, m) => s + m.value, 0),
        workouts: sessions.filter((s) => dayOf(new Date(s.startedAt)) >= weekStart).length,
        sleep: on("sleep", today),
      };
      setData({ settings, weights, metrics, intake, workoutsPerWeek, progress });
    });
  }, []);
  useFocusEffect(load);

  if (!data) return null;

  const { settings, progress } = data;
  const { targets, burn, aim } = workOutTargets({ ...data, units });
  // How personal: the targets worked out from data (not the guidelines).
  const personal = targets.filter((t) => fit(t) !== "guideline");
  const yours = personal.filter((t) => fit(t) === "yours").length;
  // What would make them yours: each missing thing once, with how many it'd help.
  const found = new Map<string, { href: string; label: string; count: number }>();
  for (const t of targets)
    for (const b of t.basis)
      if (!b.yours && b.add) found.set(b.add.text, { href: b.add.href, label: b.label, count: (found.get(b.add.text)?.count ?? 0) + 1 });
  const adds = [...found.entries()].map(([text, add]) => ({ text, ...add })).sort((a, b) => b.count - a.count);
  // The changes to suggest, taken together: with the calories changed too,
  // the macros are worked out from the new calories.
  const cal = targets[0];
  const plan = cal && differs(cal) ? workOutTargets({ ...data, units, settings: { ...settings, dailyCalorieLimit: cal.value } }).targets.map((t) => (t.key === "calories" ? cal : t)) : targets;
  const changes = plan.filter((t) => (SETTING[t.key] || t.current != null) && differs(t));

  // A change: shown at once, then saved (put back if it isn't).
  async function save(fields: Partial<AppSettings>) {
    const before = settings;
    setData((d) => d && { ...d, settings: { ...d.settings, ...fields } });
    try {
      await saveSettings(fields);
    } catch (error) {
      setData((d) => d && { ...d, settings: before });
      Alert.alert("Couldn't save that", error instanceof Error ? error.message : "Something went wrong.");
    }
  }
  // Fields for targets set to these values: Kitchen's goals, or `targets`.
  function fieldsFor(list: { key: string; value: number }[]) {
    const fields: Partial<AppSettings> = {};
    const own: TargetPrefs = { ...settings.targets };
    for (const { key, value } of list) {
      const field = SETTING[key];
      if (field) (fields as Record<string, number>)[field] = value;
      else own[key as keyof TargetPrefs] = value;
    }
    if (list.some((t) => !SETTING[t.key])) fields.targets = own;
    return fields;
  }
  // A target set to a value of your own.
  const setTarget = (key: string, value: number) => save(fieldsFor([{ key, value }]));
  // The suggested changes, all at once.
  async function takeAll() {
    setSaving(true);
    await save(fieldsFor(changes));
    setSaving(false);
  }
  // The goal weight's pace: kilograms a week, losing or gaining.
  const setPace = (dir: "lose" | "gain", kg: number) => save({ targets: { ...settings.targets, [dir === "lose" ? "losePace" : "gainPace"]: kg } });

  return { settings, progress, targets, burn, aim, personal, yours, adds, changes, saving, save, setTarget, takeAll, setPace };
}
