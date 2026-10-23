import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DatePickerField } from "@/src/components/forms/DatePickerField";
import { aboutNumbers, InfoCard, SmallNumber, useAboutYou, type Info } from "@/src/components/health/AboutParts";
import { ACTIVITY } from "@/src/components/health/bodyStats";
import { UnitsToggle } from "@/src/components/health/units";
import { WebAboutYou } from "@/src/components/health/web/WebAboutYou";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import type { Sex } from "@/src/services/settingsService";
import { OrbitPage, OrbitSection, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// Health → About you: who you are — sex, date of birth, height, how active you
// are — with your weight (from your weigh-ins) and goal weight beside them;
// then the numbers worked out from them: age, BMI and the healthy weights
// for your height, what you burn at rest and in a day, a day's calories
// toward your goal, and protein to aim for — which can become your daily
// goals — in imperial or metric (the switch, beside the title). Each change is
// saved as it's made. Each number, tapped, says what
// it is and how it was worked out — with your own figures. (A desktop
// browser: what you've said beside the numbers — WebAboutYou.)

export default function AboutYouScreen() {
  const wide = useWideWeb();
  return (
    <OrbitSection section="health">
      <OrbitPage>{wide ? <WebAboutYou /> : <AboutYou />}</OrbitPage>
    </OrbitSection>
  );
}

function AboutYou() {
  const router = useRouter();
  const leave = useGoBack("/health-section");
  const { colors: c } = useOrbitTheme();
  // (What you've said, each change saved, and the height's boxes: AboutParts.)
  const { settings, weight, units, metric, height, change, saveHeight } = useAboutYou();
  const { cmText, setCmText, feet, setFeet, inches, setInches } = height;
  const [info, setInfo] = useState<Info | null>(null);

  if (!settings) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.muted} />
      </SafeAreaView>
    );
  }

  // The numbers, from what's known.
  const { W, U, age, w, goal, target, proteinGoal, matchesGoals, missing, figures } = aboutNumbers(settings, weight, units);

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
                  <SmallNumber value={cmText} onChange={setCmText} onDone={saveHeight} unit="cm" label="Height, centimetres" digits={3} colors={c} />
                ) : (
                  <>
                    <SmallNumber value={feet} onChange={setFeet} onDone={saveHeight} unit="ft" label="Height, feet" colors={c} />
                    <SmallNumber value={inches} onChange={setInches} onDone={saveHeight} unit="in" label="Height, inches" colors={c} />
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
            {figures.map((f) => (
              <Figure key={f.key} onPress={() => setInfo(f.info)} label={f.label} value={f.value} unit={f.unit} detail={f.detail} strong={f.strong} colors={c} />
            ))}
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
