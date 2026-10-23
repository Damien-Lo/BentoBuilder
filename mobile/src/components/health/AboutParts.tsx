import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";

import { ACTIVITY, ageOn, bmi, bmiCategory, bmr, calorieTarget, cmFrom, feetInches, healthyRange, PROTEIN_PER_KG, proteinRange, tdee } from "@/src/components/health/bodyStats";
import { defaultPace } from "@/src/components/health/targets";
import { toShown, useUnits } from "@/src/components/health/units";
import { loadSettings, saveSettings, type AppSettings, type Units } from "@/src/services/settingsService";
import { getWeightEntries } from "@/src/services/weightEntryApi";
import type { OrbitColors } from "@/src/theme/orbit";

// About you's pieces, for its phone page and its desktop one: what you've
// said (loaded, each change saved as it's made, the height typed in feet
// and inches or centimetres), the numbers worked out from it — each with
// what it is and how it was worked out, in your own figures — and the card
// that explains one, over the page.

// What a number is, and how it came to be.
export type Info = { title: string; value: string; what: string; how: string[] };

const round = (n: number, to = 1) => Math.round(n / to) * to;

export function useAboutYou() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [weight, setWeight] = useState<{ value: number; date: string } | null>(null);
  const [units] = useUnits("about");
  const metric = units === "metric";
  const [cmText, setCmText] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadSettings(), getWeightEntries().catch(() => [])]).then(([s, entries]) => {
        setSettings(s);
        const latest = entries[0];
        setWeight(latest ? { value: latest.weight, date: latest.date } : s.startingWeight != null ? { value: s.startingWeight, date: s.startingWeightDate ?? "" } : null);
        // (The boxes from what's saved — empty when there's no height.)
        const h = s.heightCm ? feetInches(s.heightCm) : null;
        setFeet(h ? String(h.feet) : "");
        setCmText(s.heightCm ? String(Math.round(s.heightCm)) : "");
        setInches(h ? String(h.inches) : "");
      });
    }, []),
  );

  // A change: shown at once, then saved (put back if it isn't).
  async function change(fields: Partial<AppSettings>) {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, ...fields });
    try {
      await saveSettings(fields);
    } catch (error) {
      setSettings(before);
      Alert.alert("Couldn't save that", error instanceof Error ? error.message : "Something went wrong.");
    }
  }
  function saveHeight() {
    if (metric) {
      if (!cmText.trim()) return void change({ heightCm: null });
      const cm = Number(cmText);
      if (!Number.isFinite(cm) || cm < 60 || cm > 250) return Alert.alert("That height doesn't look right", "Put in your height in centimetres (60–250).");
      if (cm !== Math.round(settings?.heightCm ?? 0)) void change({ heightCm: cm });
      const h = feetInches(cm);
      setFeet(String(h.feet));
      setInches(String(h.inches));
      return;
    }
    const f = Number(feet);
    const i = Number(inches || 0);
    if (!feet.trim() && !inches.trim()) return void change({ heightCm: null });
    if (!Number.isFinite(f) || !Number.isFinite(i) || f < 2 || f > 8 || i < 0 || i >= 12) return Alert.alert("That height doesn't look right", "Put in feet (2–8) and inches (0–11).");
    const cm = cmFrom(f, i);
    if (cm !== settings?.heightCm) void change({ heightCm: cm });
    setCmText(String(Math.round(cm)));
  }

  return { settings, weight, units, metric, height: { cmText, setCmText, feet, setFeet, inches, setInches }, change, saveHeight };
}

// The numbers, from what's known — each as a card (`strong`: one to aim
// for) with its explanation.
export function aboutNumbers(settings: AppSettings, weight: { value: number } | null, units: Units) {
  const metric = units === "metric";
  // Kilograms (as kept) in the units chosen.
  const W = (kg: number) => toShown("weight", kg, units);
  const U = metric ? "kg" : "lbs";
  const age = ageOn(settings.birthDate);
  const h = settings.heightCm;
  const w = weight?.value ?? null;
  const goal = settings.goalWeight;
  const bodyMass = w != null && h ? bmi(w, h) : null;
  const range = h ? healthyRange(h) : null;
  const rest = w != null && h && age != null ? bmr(w, h, age, settings.sex) : null;
  const burn = rest != null && settings.activityLevel ? tdee(rest, settings.activityLevel) : null;
  const target = burn != null && rest != null && w != null ? calorieTarget(burn, rest, w, goal, settings.sex, { losePace: settings.targets.losePace ?? defaultPace("lose", units), gainPace: settings.targets.gainPace ?? defaultPace("gain", units) }) : null;
  const protein = w != null ? proteinRange(w, goal) : null;
  const missing = [!settings.birthDate && "your date of birth", !h && "your height", w == null && "a weigh-in", !settings.activityLevel && "how active you are"].filter(Boolean) as string[];
  const proteinGoal = protein ? round((protein.low + protein.high) / 2, 5) : null;
  const matchesGoals = !!target && settings.dailyCalorieLimit === target.kcal && settings.dailyProteinLimit === proteinGoal;

  // How each was worked out, in your own figures (or what it still needs).
  const n = (x: number, places = 0) => x.toLocaleString(undefined, { minimumFractionDigits: places, maximumFractionDigits: places });
  const kg = w;
  const m = h ? h / 100 : null;
  const sexPart = settings.sex === "male" ? "+ 5" : settings.sex === "female" ? "− 161" : "− 78";
  const activity = ACTIVITY.find((a) => a.id === settings.activityLevel);
  const floor = rest != null ? Math.max(rest, settings.sex === "female" ? 1200 : 1500) : null;
  const needs = (what: string) => [`Add ${what} to work it out.`];
  // Your pace toward the goal (kg a week), as calories a day.
  const pace = target?.aim === "gain" ? (settings.targets.gainPace ?? defaultPace("gain", units)) : (settings.targets.losePace ?? defaultPace("lose", units));
  const shift = pace * 1100;
  const paceText = `${Number(W(pace).toFixed(2))} ${U}`;
  const infos: Record<string, Info> = {
    bmi: {
      title: "BMI",
      value: bodyMass ? `${bodyMass.toFixed(1)} · ${bmiCategory(bodyMass)}` : "—",
      what: "Body mass index: your weight for your height. Under 18.5 is underweight, 18.5–25 healthy, 25–30 overweight, and over 30 obese. It can't tell muscle from fat, so it reads high for someone muscular.",
      how:
        bodyMass && kg && m && h
          ? ["Your weight in kilograms, divided by your height in metres squared.", ...(metric ? [`${n(kg, 1)} kg`, `${Math.round(h)} cm = ${m.toFixed(2)} m`] : [`${n(W(kg), 1)} lbs = ${n(kg, 1)} kg`, `${feetInches(h).text} = ${m.toFixed(2)} m`]), `${n(kg, 1)} ÷ ${m.toFixed(2)}² = ${bodyMass.toFixed(1)}`]
          : needs("your height and a weigh-in"),
    },
    healthy: {
      title: "Healthy weight",
      value: range ? `${round(W(range.low))}–${round(W(range.high))} ${U}` : "—",
      what: "The weights that give a BMI between 18.5 and 25 at your height — the range counted as healthy.",
      how:
        range && m
          ? [
              `18.5 × ${m.toFixed(2)}² = ${n(range.low, 1)} kg${metric ? "" : ` = ${round(W(range.low))} lbs`}`,
              `24.9 × ${m.toFixed(2)}² = ${n(range.high, 1)} kg${metric ? "" : ` = ${round(W(range.high))} lbs`}`,
              ...(w != null ? [w > range.high ? `You're ${round(W(w - range.high))} ${U} above the top of it.` : w < range.low ? `You're ${round(W(range.low - w))} ${U} below the bottom of it.` : "You're within it."] : []),
            ]
          : needs("your height"),
    },
    rest: {
      title: "Burn at rest",
      value: rest ? `${n(round(rest, 10))} kcal a day` : "—",
      what: "Your basal metabolic rate (BMR): the calories your body burns in a day at complete rest — breathing, keeping warm, your heart beating. Worked out by the Mifflin–St Jeor equation, the one dietitians most use.",
      how:
        rest && kg && h && age != null
          ? [
              `10 × weight (kg) + 6.25 × height (cm) − 5 × age ${sexPart}${settings.sex ? "" : " (between men's + 5 and women's − 161)"}`,
              `10 × ${n(kg, 1)} + 6.25 × ${n(h, 1)} − 5 × ${age} ${sexPart}`,
              `= ${n(10 * kg)} + ${n(6.25 * h)} − ${5 * age} ${sexPart} = ${n(rest)}`,
            ]
          : needs("your date of birth, height and a weigh-in"),
    },
    burn: {
      title: "Burn in a day",
      value: burn ? `${n(round(burn, 10))} kcal` : "—",
      what: "Everything you burn in a day (TDEE): your burn at rest, plus moving about, exercise and digesting food.",
      how:
        burn && rest && activity
          ? ["Burn at rest × how active you are", `${activity.label} (${activity.hint.toLowerCase()}) = × ${activity.factor}`, `${n(rest)} × ${activity.factor} = ${n(burn)}`]
          : needs("how active you are, and what burn at rest needs"),
    },
    target: {
      title: "Calories to aim for",
      value: target ? `${n(target.kcal)} kcal a day` : "—",
      what:
        target?.aim === "lose"
          ? `A day's calories to lose ${paceText} a week, toward your goal weight (your pace, set in Your Targets). A kilo is about 7,700 kcal, so it's ${n(shift)} a day under what you burn.`
          : target?.aim === "gain"
            ? `A day's calories to gain ${paceText} a week, toward your goal weight (your pace, set in Your Targets): ${n(shift)} a day over what you burn.`
            : "A day's calories to stay where you are: what you burn in a day.",
      how:
        target && burn && floor != null
          ? [
              ...(goal != null && w != null ? [`Goal ${Number(W(goal).toFixed(1))} ${U} — ${Number(W(Math.abs(w - goal)).toFixed(1))} ${U} ${goal < w ? "to lose" : goal > w ? "to gain" : "away"}`] : ["No goal weight: to stay where you are"]),
              target.aim === "lose" ? `${n(burn)} − ${n(shift)} = ${n(burn - shift)}` : target.aim === "gain" ? `${n(burn)} + ${n(shift)} = ${n(burn + shift)}` : `${n(burn)}`,
              ...(target.aim === "lose" && burn - shift < floor ? [`Kept at ${n(floor)}: never under ${settings.sex === "female" ? "1,200" : "1,500"} kcal or your burn at rest`] : []),
              `Rounded to ${n(target.kcal)}`,
            ]
          : needs("everything above"),
    },
    protein: {
      title: "Protein to aim for",
      value: protein ? `${protein.low}–${protein.high} g a day` : "—",
      what: "Protein a day to keep and build muscle while you train: 0.7 to 1 gram for each pound — the range usually given for strength training. Your goal weight is used when you have one.",
      how:
        protein && w != null
          ? metric
            ? [`${n(goal ?? w, 1)} kg (${goal != null ? "your goal weight" : "your weight"}) × 1.54 = ${n((goal ?? w) * PROTEIN_PER_KG.low)} g`, `${n(goal ?? w, 1)} kg × 2.2 = ${n((goal ?? w) * PROTEIN_PER_KG.high)} g`, "Each rounded to the nearest 5"]
            : [`${n(W(goal ?? w), 1)} lbs (${goal != null ? "your goal weight" : "your weight"}) × 0.7 = ${n((goal ?? w) * PROTEIN_PER_KG.low)} g`, `${n(W(goal ?? w), 1)} lbs × 1 = ${n((goal ?? w) * PROTEIN_PER_KG.high)} g`, "Each rounded to the nearest 5"]
          : needs("a weigh-in"),
    },
  };

  // The cards, in order: each with what it shows and its explanation.
  const figures: { key: string; label: string; value: string; unit?: string; detail: string; strong?: boolean; info: Info }[] = [
    { key: "bmi", label: "BMI", value: bodyMass ? bodyMass.toFixed(1) : "—", detail: bodyMass ? bmiCategory(bodyMass) : "Needs height and weight", info: infos.bmi },
    { key: "healthy", label: "Healthy weight", value: range ? `${round(W(range.low))}–${round(W(range.high))}` : "—", unit: range ? U : undefined, detail: range ? "For your height (BMI 18.5–25)" : "Needs your height", info: infos.healthy },
    { key: "rest", label: "Burn at rest", value: rest ? round(rest, 10).toLocaleString() : "—", unit: rest ? "kcal" : undefined, detail: rest ? "A day, doing nothing (BMR)" : "Needs date of birth, height, weight", info: infos.rest },
    { key: "burn", label: "Burn in a day", value: burn ? round(burn, 10).toLocaleString() : "—", unit: burn ? "kcal" : undefined, detail: burn ? "With how active you are" : "Needs all of the above", info: infos.burn },
    {
      key: "target",
      label: "Calories to aim for",
      value: target ? target.kcal.toLocaleString() : "—",
      unit: target ? "kcal" : undefined,
      detail: target ? (target.aim === "lose" ? "To lose about 1 lb a week" : target.aim === "gain" ? "To gain slowly" : "To stay where you are") : "Needs all of the above",
      strong: true,
      info: infos.target,
    },
    { key: "protein", label: "Protein to aim for", value: protein ? `${protein.low}–${protein.high}` : "—", unit: protein ? "g" : undefined, detail: protein ? `${metric ? "1.5–2.2 g per kg" : "0.7–1 g per lb"} of ${goal != null ? "goal " : ""}weight` : "Needs a weigh-in", strong: true, info: infos.protein },
  ];

  return { W, U, age, w, goal, target, proteinGoal, matchesGoals, missing, figures };
}

// A number explained, over the page: what it is, then how it was worked out
// — tap anywhere to close.
export function InfoCard({ info, onClose, colors: c }: { info: Info | null; onClose: () => void; colors: OrbitColors }) {
  return (
    <Modal visible={!!info} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.5)" }}>
        {info && (
          <Pressable onPress={onClose} style={{ width: "100%", maxWidth: 420, padding: 20, borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", letterSpacing: 0.8, color: c.ink }}>{info.title.toUpperCase()}</Text>
              <Ionicons name="close" size={20} color={c.faint} />
            </View>
            <Text style={{ marginTop: 4, fontSize: 24, fontWeight: "800", color: c.text }}>{info.value}</Text>
            <Text style={{ marginTop: 10, fontSize: 14.5, lineHeight: 21, color: c.icon }}>{info.what}</Text>
            <Text style={{ marginTop: 16, marginBottom: 6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>HOW IT&apos;S WORKED OUT</Text>
            <View style={{ padding: 12, borderRadius: 14, backgroundColor: c.canvas, gap: 6 }}>
              {info.how.map((line, i) => (
                <Text key={i} style={{ fontSize: 14, lineHeight: 20, fontWeight: i === info.how.length - 1 ? "700" : "500", color: c.text, fontVariant: ["tabular-nums"] }}>
                  {line}
                </Text>
              ))}
            </View>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

// A small number box (the height's), saved when it's left.
export function SmallNumber({ value, onChange, onDone, unit, label, digits = 2, colors: c }: { value: string; onChange: (v: string) => void; onDone: () => void; unit: string; label: string; digits?: number; colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, "").slice(0, digits))}
        onBlur={onDone}
        onSubmitEditing={onDone}
        keyboardType="number-pad"
        returnKeyType="done"
        placeholder="—"
        placeholderTextColor={c.faint}
        accessibilityLabel={label}
        selectTextOnFocus
        style={[{ width: digits > 2 ? 58 : 46, height: 38, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
      />
      <Text style={{ fontSize: 14, color: c.muted }}>{unit}</Text>
    </View>
  );
}
