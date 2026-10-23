import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DatePickerField } from "@/src/components/forms/DatePickerField";
import { ACTIVITY, ageOn, bmi, bmiCategory, bmr, calorieTarget, cmFrom, feetInches, healthyRange, proteinRange, tdee } from "@/src/components/health/bodyStats";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { loadSettings, saveSettings, type AppSettings, type Sex } from "@/src/services/settingsService";
import { getWeightEntries } from "@/src/services/weightEntryApi";
import { OrbitPage, OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// Health → About you: who you are — sex, birthday, height, how active you
// are — with your weight (from your weigh-ins) and goal weight beside them;
// then the numbers worked out from them: age, BMI and the healthy weights
// for your height, what you burn at rest and in a day, a day's calories
// toward your goal, and protein to aim for — which can become your daily
// goals. Each change is saved as it's made.

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
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadSettings(), getWeightEntries().catch(() => [])]).then(([s, entries]) => {
        setSettings(s);
        const latest = entries[0];
        setWeight(latest ? { value: latest.weight, date: latest.date } : s.startingWeight != null ? { value: s.startingWeight, date: s.startingWeightDate ?? "" } : null);
        if (s.heightCm) {
          const h = feetInches(s.heightCm);
          setFeet(String(h.feet));
          setInches(String(h.inches));
        }
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
    const f = Number(feet);
    const i = Number(inches || 0);
    if (!feet.trim() && !inches.trim()) return void change({ heightCm: null });
    if (!Number.isFinite(f) || !Number.isFinite(i) || f < 2 || f > 8 || i < 0 || i >= 12) return Alert.alert("That height doesn't look right", "Put in feet (2–8) and inches (0–11).");
    const cm = cmFrom(f, i);
    if (cm !== settings?.heightCm) void change({ heightCm: cm });
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
  const target = burn != null && rest != null && w != null ? calorieTarget(burn, rest, w, goal, settings.sex) : null;
  const protein = w != null ? proteinRange(w, goal) : null;
  const missing = [!settings.birthDate && "your birthday", !h && "your height", w == null && "a weigh-in", !settings.activityLevel && "how active you are"].filter(Boolean) as string[];
  const proteinGoal = protein ? round((protein.low + protein.high) / 2, 5) : null;
  const matchesGoals = target && settings.dailyCalorieLimit === target.kcal && settings.dailyProteinLimit === proteinGoal;

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
          <PageHeader title="About you" subtitle="What your health numbers are worked out from" onBack={leave} />

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
                <Text style={{ flex: 1, fontSize: 15, color: c.text }}>Birthday</Text>
                {age != null && <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted }}>{age} years old</Text>}
              </View>
              <DatePickerField value={settings.birthDate ?? ""} onChange={(d) => void change({ birthDate: d || null })} title="Your birthday" placeholder="Pick your birthday" />
            </View>
            <Line colors={c} />
            <Row label="Height" colors={c}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Small value={feet} onChange={setFeet} onDone={saveHeight} unit="ft" label="Height, feet" colors={c} />
                <Small value={inches} onChange={setInches} onDone={saveHeight} unit="in" label="Height, inches" colors={c} />
              </View>
            </Row>
            <Line colors={c} />
            <Row label="Weight" onPress={() => router.push("/health/weight" as Href)} colors={c}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: w != null ? c.text : c.faint }}>{w != null ? `${w} lbs` : "Log a weigh-in"}</Text>
              <Ionicons name="chevron-forward" size={16} color={c.faint} />
            </Row>
            <Line colors={c} />
            <Row label="Goal weight" onPress={() => router.push("/health/goals" as Href)} colors={c}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: goal != null ? c.text : c.faint }}>{goal != null ? `${goal} lbs` : "Set one"}</Text>
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
          <Heading colors={c}>YOUR NUMBERS</Heading>
          {missing.length > 0 && <Text style={{ marginBottom: 10, marginHorizontal: 4, fontSize: 13, lineHeight: 19, color: c.muted }}>Add {missing.join(", ").replace(/, ([^,]*)$/, " and $1")} for all of them.</Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Figure label="BMI" value={bodyMass ? bodyMass.toFixed(1) : "—"} detail={bodyMass ? bmiCategory(bodyMass) : "Needs height and weight"} colors={c} />
            <Figure label="Healthy weight" value={range ? `${round(range.low)}–${round(range.high)}` : "—"} unit={range ? "lbs" : undefined} detail={range ? "For your height (BMI 18.5–25)" : "Needs your height"} colors={c} />
            <Figure label="Burn at rest" value={rest ? round(rest, 10).toLocaleString() : "—"} unit={rest ? "kcal" : undefined} detail={rest ? "A day, doing nothing (BMR)" : "Needs birthday, height, weight"} colors={c} />
            <Figure label="Burn in a day" value={burn ? round(burn, 10).toLocaleString() : "—"} unit={burn ? "kcal" : undefined} detail={burn ? "With how active you are" : "Needs all of the above"} colors={c} />
            <Figure
              label="Calories to aim for"
              value={target ? target.kcal.toLocaleString() : "—"}
              unit={target ? "kcal" : undefined}
              detail={target ? (target.aim === "lose" ? "To lose about 1 lb a week" : target.aim === "gain" ? "To gain slowly" : "To stay where you are") : "Needs all of the above"}
              strong
              colors={c}
            />
            <Figure label="Protein to aim for" value={protein ? `${protein.low}–${protein.high}` : "—"} unit={protein ? "g" : undefined} detail={protein ? `0.7–1 g per lb of ${goal != null ? "goal " : ""}weight` : "Needs a weigh-in"} strong colors={c} />
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
    </SafeAreaView>
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
function Small({ value, onChange, onDone, unit, label, colors: c }: { value: string; onChange: (v: string) => void; onDone: () => void; unit: string; label: string; colors: OrbitColors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, "").slice(0, 2))}
        onBlur={onDone}
        onSubmitEditing={onDone}
        keyboardType="number-pad"
        returnKeyType="done"
        placeholder="—"
        placeholderTextColor={c.faint}
        accessibilityLabel={label}
        selectTextOnFocus
        style={[{ width: 46, height: 38, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.canvas, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.text }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
      />
      <Text style={{ fontSize: 14, color: c.muted }}>{unit}</Text>
    </View>
  );
}
// One of your numbers, in a card half the width. (`strong`: one to aim
// for — in Health's colour.)
function Figure({ label, value, unit, detail, strong, colors: c }: { label: string; value: string; unit?: string; detail: string; strong?: boolean; colors: OrbitColors }) {
  return (
    <View style={{ flexBasis: "47%", flexGrow: 1, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: strong ? c.fill : c.border, backgroundColor: c.surface }}>
      <Text style={{ fontSize: 12.5, color: c.muted }}>{label}</Text>
      <Text style={{ marginTop: 4, fontSize: 22, fontWeight: "800", color: value === "—" ? c.faint : c.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
        {unit && <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}> {unit}</Text>}
      </Text>
      <Text style={{ marginTop: 3, fontSize: 12, lineHeight: 16, color: c.faint }}>{detail}</Text>
    </View>
  );
}
