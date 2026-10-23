import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DatePickerField } from "@/src/components/forms/DatePickerField";
import { ACTIVITY, ageOn, bmi, bmiCategory, bmr, calorieTarget, cmFrom, feetInches, healthyRange, PROTEIN_PER_KG, proteinRange, tdee } from "@/src/components/health/bodyStats";
import { defaultPace } from "@/src/components/health/targets";
import { toShown, UnitsToggle, useUnits } from "@/src/components/health/units";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { loadSettings, saveSettings, type AppSettings, type Sex } from "@/src/services/settingsService";
import { getWeightEntries } from "@/src/services/weightEntryApi";
import { OrbitPage, OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Health → About you: who you are — sex, date of birth, height, how active you
// are — with your weight (from your weigh-ins) and goal weight beside them;
// then the numbers worked out from them: age, BMI and the healthy weights
// for your height, what you burn at rest and in a day, a day's calories
// toward your goal, and protein to aim for — which can become your daily
// goals — in imperial or metric (the switch, beside the title). Each change is
// saved as it's made. Each number, tapped, says what
// it is and how it was worked out — with your own figures.

// What a number is, and how it came to be.
type Info = { title: string; value: string; what: string; how: string[] };

export default function AboutYouScreen() {
  return (
    <OrbitSection section="health">
      <OrbitPage>
        <AboutYou />
      </OrbitPage>
    </OrbitSection>
  );
}

const round = (n: number, to = 1) => Math.round(n / to) * to;

function AboutYou() {
  const router = useRouter();
  const leave = useGoBack("/health-section");
  const { colors: c } = useOrbitTheme();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [weight, setWeight] = useState<{ value: number; date: string } | null>(null);
  const [units] = useUnits("about");
  const metric = units === "metric";
  // Kilograms (as kept) in the units chosen.
  const W = (kg: number) => toShown("weight", kg, units);
  const U = metric ? "kg" : "lbs";
  const [cmText, setCmText] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [info, setInfo] = useState<Info | null>(null);

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

  if (!settings) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.muted} />
      </SafeAreaView>
    );
  }

  // The numbers, from what's known.
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
  const matchesGoals = target && settings.dailyCalorieLimit === target.kcal && settings.dailyProteinLimit === proteinGoal;

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
          ? `A day's calories to lose ${paceText} a week, toward your goal weight (your pace, set in Targets). A kilo is about 7,700 kcal, so it's ${n(shift)} a day under what you burn.`
          : target?.aim === "gain"
            ? `A day's calories to gain ${paceText} a week, toward your goal weight (your pace, set in Targets): ${n(shift)} a day over what you burn.`
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

  function applyGoals() {
    if (!target || proteinGoal == null) return;
    Alert.alert("Use these as your daily goals?", `Calories ${target.kcal.toLocaleString()} (now ${settings!.dailyCalorieLimit?.toLocaleString() ?? "not set"}) and protein ${proteinGoal} g (now ${settings!.dailyProteinLimit ?? "not set"}).`, [
      { text: "Cancel", style: "cancel" },
      { text: "Use them", onPress: () => void change({ dailyCalorieLimit: target.kcal, dailyProteinLimit: proteinGoal }) },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <PageHeader title="About you" subtitle="What your health numbers are worked out from" onBack={leave} action={<UnitsToggle page="about" />} />

          {/* You */}
          <Heading colors={c}>YOU</Heading>
          <Card colors={c}>
            <Row label="Sex" colors={c}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {(["male", "female"] as Sex[]).map((s) => {
                  const on = settings.sex === s;
                  return (
                    <Tap key={s} onPress={() => void change({ sex: on ? null : s })} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: on ? c.ink : c.pill }} pressedStyle={{ opacity: 0.75 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{s === "male" ? "Male" : "Female"}</Text>
                    </Tap>
                  );
                })}
              </View>
            </Row>
            <Line colors={c} />
            <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ flex: 1, fontSize: 15, color: c.text }}>Date of birth</Text>
                {age != null && <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted }}>{age} years old</Text>}
              </View>
              <DatePickerField value={settings.birthDate ?? ""} onChange={(d) => void change({ birthDate: d || null })} title="Date of birth" placeholder="Pick your date of birth" />
            </View>
            <Line colors={c} />
            <Row label="Height" colors={c}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {metric ? (
                  <Small value={cmText} onChange={setCmText} onDone={saveHeight} unit="cm" label="Height, centimetres" digits={3} colors={c} />
                ) : (
                  <>
                    <Small value={feet} onChange={setFeet} onDone={saveHeight} unit="ft" label="Height, feet" colors={c} />
                    <Small value={inches} onChange={setInches} onDone={saveHeight} unit="in" label="Height, inches" colors={c} />
                  </>
                )}
              </View>
            </Row>
            <Line colors={c} />
            <Row label="Weight" onPress={() => router.push("/health/weight" as Href)} colors={c}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: w != null ? c.text : c.faint }}>{w != null ? `${Number(W(w).toFixed(1))} ${U}` : "Log a weigh-in"}</Text>
              <Ionicons name="chevron-forward" size={16} color={c.faint} />
            </Row>
            <Line colors={c} />
            <Row label="Goal weight" onPress={() => router.push("/health/targets" as Href)} colors={c}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: goal != null ? c.text : c.faint }}>{goal != null ? `${Number(W(goal).toFixed(1))} ${U}` : "Set one"}</Text>
              <Ionicons name="chevron-forward" size={16} color={c.faint} />
            </Row>
          </Card>

          {/* How active */}
          <Heading colors={c}>HOW ACTIVE YOU ARE</Heading>
          <View style={{ gap: 8 }}>
            {ACTIVITY.map((a) => {
              const on = settings.activityLevel === a.id;
              return (
                <Tap key={a.id} onPress={() => void change({ activityLevel: a.id })} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? c.ink : c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: c.text }}>{a.label}</Text>
                    <Text style={{ marginTop: 1, fontSize: 12.5, color: c.muted }}>{a.hint}</Text>
                  </View>
                  <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? c.ink : c.faint} />
                </Tap>
              );
            })}
          </View>

          {/* Your numbers */}
          <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>
            YOUR NUMBERS <Text style={{ fontWeight: "600", letterSpacing: 0.4 }}>(Click for Info)</Text>
          </Text>
          {missing.length > 0 && <Text style={{ marginBottom: 10, marginHorizontal: 4, fontSize: 13, lineHeight: 19, color: c.muted }}>Add {missing.join(", ").replace(/, ([^,]*)$/, " and $1")} for all of them.</Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Figure onPress={() => setInfo(infos.bmi)} label="BMI" value={bodyMass ? bodyMass.toFixed(1) : "—"} detail={bodyMass ? bmiCategory(bodyMass) : "Needs height and weight"} colors={c} />
            <Figure onPress={() => setInfo(infos.healthy)} label="Healthy weight" value={range ? `${round(W(range.low))}–${round(W(range.high))}` : "—"} unit={range ? U : undefined} detail={range ? "For your height (BMI 18.5–25)" : "Needs your height"} colors={c} />
            <Figure onPress={() => setInfo(infos.rest)} label="Burn at rest" value={rest ? round(rest, 10).toLocaleString() : "—"} unit={rest ? "kcal" : undefined} detail={rest ? "A day, doing nothing (BMR)" : "Needs date of birth, height, weight"} colors={c} />
            <Figure onPress={() => setInfo(infos.burn)} label="Burn in a day" value={burn ? round(burn, 10).toLocaleString() : "—"} unit={burn ? "kcal" : undefined} detail={burn ? "With how active you are" : "Needs all of the above"} colors={c} />
            <Figure
              onPress={() => setInfo(infos.target)}
              label="Calories to aim for"
              value={target ? target.kcal.toLocaleString() : "—"}
              unit={target ? "kcal" : undefined}
              detail={target ? (target.aim === "lose" ? "To lose about 1 lb a week" : target.aim === "gain" ? "To gain slowly" : "To stay where you are") : "Needs all of the above"}
              strong
              colors={c}
            />
            <Figure onPress={() => setInfo(infos.protein)} label="Protein to aim for" value={protein ? `${protein.low}–${protein.high}` : "—"} unit={protein ? "g" : undefined} detail={protein ? `${metric ? "1.5–2.2 g per kg" : "0.7–1 g per lb"} of ${goal != null ? "goal " : ""}weight` : "Needs a weigh-in"} strong colors={c} />
          </View>

          {target && proteinGoal != null && (
            <Tap onPress={applyGoals} disabled={!!matchesGoals} accessibilityRole="button" style={{ marginTop: 14, height: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: matchesGoals ? c.pill : c.ink }} pressedStyle={{ opacity: 0.85 }}>
              <Ionicons name={matchesGoals ? "checkmark-circle" : "flag"} size={18} color={matchesGoals ? c.onPill : c.onInk} />
              <Text style={{ fontSize: 15.5, fontWeight: "700", color: matchesGoals ? c.onPill : c.onInk }}>{matchesGoals ? "These are your daily goals" : "Use as my daily goals"}</Text>
            </Tap>
          )}

          <Text style={{ marginTop: 14, marginHorizontal: 4, fontSize: 12, lineHeight: 18, color: c.faint }}>
            Estimates, not medical advice. Burn at rest is the Mifflin–St Jeor equation; a day&apos;s burn multiplies it by how active you are. BMI doesn&apos;t tell muscle from fat.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <InfoCard info={info} onClose={() => setInfo(null)} colors={c} />
    </SafeAreaView>
  );
}

// A number explained, over the page: what it is, then how it was worked out
// — tap anywhere to close.
function InfoCard({ info, onClose, colors: c }: { info: Info | null; onClose: () => void; colors: OrbitColors }) {
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

function Heading({ children, colors: c }: { children: string; colors: OrbitColors }) {
  return <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: c.faint }}>{children}</Text>;
}
function Card({ children, colors: c }: { children: React.ReactNode; colors: OrbitColors }) {
  return <View style={{ borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: "hidden" }}>{children}</View>;
}
function Line({ colors: c }: { colors: OrbitColors }) {
  return <View style={{ height: 1, marginLeft: 14, backgroundColor: c.border }} />;
}
// A row: its label on the left, what it holds on the right.
function Row({ label, onPress, children, colors: c }: { label: string; onPress?: () => void; children: React.ReactNode; colors: OrbitColors }) {
  return (
    <Tap onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8 }} pressedStyle={{ backgroundColor: c.pill }}>
      <Text style={{ flex: 1, fontSize: 15, color: c.text }}>{label}</Text>
      {children}
    </Tap>
  );
}
function Small({ value, onChange, onDone, unit, label, digits = 2, colors: c }: { value: string; onChange: (v: string) => void; onDone: () => void; unit: string; label: string; digits?: number; colors: OrbitColors }) {
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
// One of your numbers, in a card half the width. (`strong`: one to aim
// for — in Health's colour.)
function Figure({ label, value, unit, detail, strong, onPress, colors: c }: { label: string; value: string; unit?: string; detail: string; strong?: boolean; onPress: () => void; colors: OrbitColors }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityHint="How it's worked out" style={{ flexBasis: "47%", flexGrow: 1, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: strong ? c.fill : c.border, backgroundColor: c.surface }} pressedStyle={{ backgroundColor: c.pill }}>
      <Text style={{ fontSize: 12.5, color: c.muted }}>{label}</Text>
      <Text style={{ marginTop: 4, fontSize: 22, fontWeight: "800", color: value === "—" ? c.faint : c.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
        {unit && <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}> {unit}</Text>}
      </Text>
      <Text style={{ marginTop: 3, fontSize: 12, lineHeight: 16, color: c.faint }}>{detail}</Text>
    </Tap>
  );
}
