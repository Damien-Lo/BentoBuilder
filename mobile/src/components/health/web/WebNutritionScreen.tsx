import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";

import { addDays, MONTHS_SHORT, WEEKDAYS_SHORT } from "@/src/components/calendar/calendarUtils";
import { entryName } from "@/src/components/calendar/mealFood";
import { BarChart, Button, Card, CardLink, Empty, GoalBar, LineChart, PageTitle, Planned, Row, Segmented, Stat, WEB, WebPage } from "@/src/components/web/ui";
import { getMealPlanRange, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { SettingsNumericInput, SettingsRow } from "@/src/components/forms";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from "@/src/services/settingsService";
import { getWeightEntries, type WeightEntry } from "@/src/services/weightEntryApi";
import { computeDayNutrition, parseLocalDate, SLOTS, todayStr } from "@/src/utils/mealPlan";

// Nutrition in a desktop browser: the review page. What was eaten over the
// last week, fortnight or month — a day at a time against the goal, the
// averages, where the calories came from — and the weight trend, with room
// held for the charts still to come.

type Range = "7" | "14" | "30";
const RANGES: { value: Range; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
];

const shortDay = (date: string) => {
  const d = parseLocalDate(date);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

export function WebNutritionScreen() {
  const router = useRouter();
  const today = todayStr();
  const [range, setRange] = useState<Range>("7");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  // The daily goals being edited (the phone edits these on its Nutrition tab).
  const [goals, setGoals] = useState<AppSettings | null>(null);

  async function saveGoals() {
    if (!goals) return;
    try {
      await saveSettings({
        dailyCalorieLimit: goals.dailyCalorieLimit,
        dailyProteinLimit: goals.dailyProteinLimit,
        dailyCarbsLimit: goals.dailyCarbsLimit,
        dailyFatsLimit: goals.dailyFatsLimit,
        dailyFiberLimit: goals.dailyFiberLimit,
        dailySodiumLimit: goals.dailySodiumLimit,
      });
      setSettings(goals);
      setGoals(null);
    } catch {
      Alert.alert("Couldn't save", "Your goals weren't saved. Please try again.");
    }
  }

  const days = useMemo(() => Array.from({ length: Number(range) }, (_, i) => addDays(today, i - Number(range) + 1)), [today, range]);

  const load = useCallback(() => {
    loadSettings().then(setSettings).catch(() => {});
    getWeightEntries().then(setWeights).catch(() => {});
    getMealPlanRange(days[0], days[days.length - 1]).then(setEntries).catch(() => {});
  }, [days]);
  useFocusEffect(load);
  useEffect(load, [load]);

  const conversions = settings.unitConversions;
  // Only what was actually eaten counts on a review page.
  const eaten = entries.filter((e) => e.status === "confirmed" && e.date >= days[0] && e.date <= today);
  const perDay = days.map((day) => ({ day, nutrition: computeDayNutrition(eaten.filter((e) => e.date === day), conversions), any: eaten.some((e) => e.date === day) }));
  const logged = perDay.filter((d) => d.any);
  const n = Math.max(1, logged.length);
  const total = computeDayNutrition(eaten, conversions);
  const avg = (v: number | null | undefined) => (v ?? 0) / n;
  const within = logged.filter((d) => settings.dailyCalorieLimit && (d.nutrition.calories ?? 0) <= settings.dailyCalorieLimit * 1.05).length;

  // Where the calories came from: by meal, and the foods that add up most.
  const bySlot = SLOTS.map((slot) => ({
    key: slot.id,
    label: slot.label,
    value: (computeDayNutrition(eaten.filter((e) => e.slot === slot.id), conversions).calories ?? 0) / n,
  }));
  const byFood = new Map<string, { kcal: number; times: number }>();
  for (const entry of eaten) {
    const name = entryName(entry);
    const kcal = computeDayNutrition([entry], conversions).calories ?? 0;
    const prev = byFood.get(name) ?? { kcal: 0, times: 0 };
    byFood.set(name, { kcal: prev.kcal + kcal, times: prev.times + 1 });
  }
  const topFoods = [...byFood.entries()].sort((a, b) => b[1].kcal - a[1].kcal).slice(0, 7);
  const topKcal = topFoods[0]?.[1].kcal ?? 1;

  const weightPoints = [...weights].sort((a, b) => a.date.localeCompare(b.date)).slice(-40);
  const latest = weightPoints[weightPoints.length - 1];
  const first = weightPoints[0];
  const start = settings.startingWeight ?? first?.weight ?? null;
  const change = latest && start != null ? latest.weight - start : null;

  return (
    <WebPage>
      <PageTitle
        title="Nutrition overview"
        subtitle={`${shortDay(days[0])} – ${shortDay(today)} · what you've logged as eaten`}
        right={<Segmented options={RANGES} value={range} onChange={setRange} />}
      />

      <Row>
        <Stat label="Average calories" value={`${Math.round(avg(total.calories))}`} sub={settings.dailyCalorieLimit ? `goal ${settings.dailyCalorieLimit} kcal a day` : "kcal a day"} icon="flame-outline" />
        <Stat label="Average protein" value={`${Math.round(avg(total.protein))} g`} sub={settings.dailyProteinLimit ? `goal ${settings.dailyProteinLimit} g` : undefined} icon="barbell-outline" />
        <Stat label="Days logged" value={`${logged.length} of ${days.length}`} sub="days with something eaten" icon="calendar-outline" />
        <Stat
          label="On or under goal"
          value={settings.dailyCalorieLimit ? `${within} of ${logged.length}` : "—"}
          sub={settings.dailyCalorieLimit ? "logged days within 5% of the calorie goal" : "Set a calorie goal to track this"}
          tone={settings.dailyCalorieLimit && logged.length && within / logged.length >= 0.7 ? "good" : "default"}
          icon="checkmark-circle-outline"
        />
      </Row>

      <Row>
        <Card title="Calories by day" subtitle="Red is more than 5% over the goal" style={{ flex: 2, minWidth: 520 }}>
          <View style={{ paddingTop: 14 }}>
            <BarChart
              data={perDay.map(({ day, nutrition }) => {
                const d = parseLocalDate(day);
                return {
                  key: day,
                  label: days.length > 14 ? String(d.getDate()) : WEEKDAYS_SHORT[d.getDay()],
                  sub: days.length > 14 ? undefined : String(d.getDate()),
                  value: nutrition.calories ?? 0,
                  highlight: day === today,
                };
              })}
              goal={settings.dailyCalorieLimit}
              height={220}
            />
          </View>
        </Card>

        <Card title="Daily averages" subtitle="Against your goals" action={<CardLink label="Edit goals" onPress={() => setGoals(settings)} />} style={{ flex: 1, minWidth: 320 }}>
          <GoalBar label="Calories" value={avg(total.calories)} goal={settings.dailyCalorieLimit} unit="kcal" />
          <GoalBar label="Protein" value={avg(total.protein)} goal={settings.dailyProteinLimit} unit="g" />
          <GoalBar label="Carbs" value={avg(total.carbs)} goal={settings.dailyCarbsLimit} unit="g" color="#D97706" />
          <GoalBar label="Fats" value={avg(total.fats)} goal={settings.dailyFatsLimit} unit="g" color="#DB2777" />
          <GoalBar label="Fiber" value={avg(total.fiber)} goal={settings.dailyFiberLimit} unit="g" color="#16A34A" />
          <GoalBar label="Sodium" value={avg(total.sodium)} goal={settings.dailySodiumLimit} unit="mg" color="#7C3AED" />
        </Card>
      </Row>

      <Row>
        <Card title="By meal" subtitle="Average calories a day" style={{ flex: 1, minWidth: 300 }}>
          <View style={{ paddingTop: 14 }}>
            <BarChart data={bySlot} height={150} color="#0D9488" />
          </View>
        </Card>

        <Card title="Where the calories came from" subtitle="The foods that added up to the most" style={{ flex: 1.3, minWidth: 360 }}>
          {topFoods.length === 0 ? (
            <Empty icon="restaurant-outline" text="Nothing logged in this period" />
          ) : (
            topFoods.map(([name, info]) => (
              <View key={name} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: "600", color: WEB.body }}>
                    {name}
                  </Text>
                  <Text style={{ fontSize: 12, color: WEB.muted }}>
                    {info.times}× · <Text style={{ fontWeight: "700", color: WEB.text }}>{Math.round(info.kcal)}</Text> kcal
                  </Text>
                </View>
                <View style={{ marginTop: 4, height: 6, borderRadius: 3, backgroundColor: "#EEF2F7", overflow: "hidden" }}>
                  <View style={{ width: `${(info.kcal / topKcal) * 100}%`, height: 6, backgroundColor: WEB.blue }} />
                </View>
              </View>
            ))
          )}
        </Card>

        <Card title="Weight" subtitle={latest ? `Last logged ${shortDay(latest.date)}` : "No weigh-ins yet"} action={<CardLink label="Log weight" onPress={() => router.navigate("/health/weight")} />} style={{ flex: 1.2, minWidth: 340 }}>
          {weightPoints.length === 0 ? (
            <Empty icon="scale-outline" text="Log a weigh-in to see the trend" />
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 14 }}>
                <Text style={{ fontSize: 28, fontWeight: "700", color: WEB.text }}>{latest.weight}</Text>
                {change != null && (
                  <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: "600", color: change <= 0 ? WEB.green : WEB.amber }}>
                    {change > 0 ? "+" : ""}
                    {change.toFixed(1)} since start
                  </Text>
                )}
              </View>
              <LineChart points={weightPoints.map((w) => ({ key: w._id, label: shortDay(w.date), value: w.weight }))} target={settings.goalWeight} height={130} />
            </>
          )}
        </Card>
      </Row>

      <Row>
        <Planned
          icon="grid-outline"
          title="Vitamins and minerals"
          text="How close each of the 37 tracked nutrients came to its goal over the period, as a grid you can scan for gaps."
          minHeight={170}
          style={{ flex: 1, minWidth: 300 }}
        />
        <Planned
          icon="trending-up-outline"
          title="Longer trends"
          text="Month against month and week against week: calories, macros and weight on the same timeline."
          minHeight={170}
          style={{ flex: 1, minWidth: 300 }}
        />
        <Planned
          icon="time-outline"
          title="When you eat"
          text="Meal timing from the calendar's meal blocks set against what was eaten in them."
          minHeight={170}
          style={{ flex: 1, minWidth: 300 }}
        />
      </Row>

      {/* Daily goals */}
      <Modal visible={!!goals} transparent animationType="fade" onRequestClose={() => setGoals(null)}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.4)", padding: 24 }}>
          <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onPress={() => setGoals(null)} />
          {goals && (
            <View style={{ width: "100%", maxWidth: 440, borderRadius: 20, backgroundColor: "#FFFFFF", padding: 22, boxShadow: "0 16px 40px rgba(15,23,42,0.25)" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: WEB.text }}>Daily nutrition goals</Text>
              <Text style={{ marginTop: 2, marginBottom: 14, fontSize: 13, color: WEB.muted }}>Leave one empty to stop tracking it.</Text>
              <View style={{ borderWidth: 1, borderColor: WEB.border, borderRadius: 14, overflow: "hidden" }}>
                {(
                  [
                    ["Calories", "dailyCalorieLimit", "kcal"],
                    ["Protein", "dailyProteinLimit", "g"],
                    ["Carbohydrates", "dailyCarbsLimit", "g"],
                    ["Fats", "dailyFatsLimit", "g"],
                    ["Fiber", "dailyFiberLimit", "g"],
                    ["Sodium", "dailySodiumLimit", "mg"],
                  ] as const
                ).map(([label, key, unit]) => (
                  <SettingsRow key={key} label={label}>
                    <SettingsNumericInput value={goals[key]} onChange={(v) => setGoals((prev) => prev && { ...prev, [key]: v })} placeholder="—" unit={unit} />
                  </SettingsRow>
                ))}
              </View>
              <View style={{ marginTop: 18, flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                <Button label="Cancel" onPress={() => setGoals(null)} />
                <Button label="Save goals" kind="primary" onPress={() => void saveGoals()} />
              </View>
            </View>
          )}
        </View>
      </Modal>
    </WebPage>
  );
}
