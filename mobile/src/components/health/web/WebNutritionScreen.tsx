import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { addDays, MONTHS_SHORT, WEEKDAYS_SHORT } from "@/src/components/calendar/calendarUtils";
import { entryName } from "@/src/components/calendar/mealFood";
import { BarChart, Card, CardLink, Empty, GoalBar, LineChart, PageTitle, Planned, Row, Segmented, Stat, WebPage } from "@/src/components/web/ui";
import { getMealPlanRange, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/src/services/settingsService";
import { getWeightEntries, type WeightEntry } from "@/src/services/weightEntryApi";
import { computeDayNutrition, parseLocalDate, SLOTS, todayStr } from "@/src/utils/mealPlan";
import { nutrientColor } from "@/src/theme/nutrients";
import { OrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import { toShown, useUnits } from "@/src/components/health/units";

// Nutrition in a desktop browser: the review page. What was eaten over the
// last week, fortnight or month — a day at a time against the goal, the
// averages, where the calories came from — and the weight trend, with room
// held for the charts still to come. In Orbit's look, in Nutrition's green
// (the route puts it in that section); each nutrient in its own colour.

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
  const [weightUnits] = useUnits("weight");
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const today = todayStr();
  const [range, setRange] = useState<Range>("7");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
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
  // (Kept in kilograms; shown in the Weight page's units.)
  const shownWeight = (kg: number) => Math.round(toShown("weight", kg, weightUnits) * 10) / 10;

  return (
    <OrbitPage>
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
              color={nutrientColor("calories")}
            />
          </View>
        </Card>

        <Card title="Daily averages" subtitle="Against your goals" action={<CardLink label="Edit in Targets" onPress={() => router.push("/health/targets")} />} style={{ flex: 1, minWidth: 320 }}>
          <GoalBar label="Calories" value={avg(total.calories)} goal={settings.dailyCalorieLimit} unit="kcal" color={nutrientColor("calories")} />
          <GoalBar label="Protein" value={avg(total.protein)} goal={settings.dailyProteinLimit} unit="g" color={nutrientColor("protein")} />
          <GoalBar label="Carbs" value={avg(total.carbs)} goal={settings.dailyCarbsLimit} unit="g" color={nutrientColor("carbs")} />
          <GoalBar label="Fats" value={avg(total.fats)} goal={settings.dailyFatsLimit} unit="g" color={nutrientColor("fats")} />
          <GoalBar label="Fiber" value={avg(total.fiber)} goal={settings.dailyFiberLimit} unit="g" color={nutrientColor("fiber")} />
          <GoalBar label="Sodium" value={avg(total.sodium)} goal={settings.dailySodiumLimit} unit="mg" color={nutrientColor("sodium")} />
        </Card>
      </Row>

      <Row>
        <Card title="By meal" subtitle="Average calories a day" style={{ flex: 1, minWidth: 300 }}>
          <View style={{ paddingTop: 14 }}>
            <BarChart data={bySlot} height={150} color={nutrientColor("calories")} />
          </View>
        </Card>

        <Card title="Where the calories came from" subtitle="The foods that added up to the most" style={{ flex: 1.3, minWidth: 360 }}>
          {topFoods.length === 0 ? (
            <Empty icon="restaurant-outline" text="Nothing logged in this period" />
          ) : (
            topFoods.map(([name, info]) => (
              <View key={name} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: "600", color: c.icon }}>
                    {name}
                  </Text>
                  <Text style={{ fontSize: 12, color: c.muted }}>
                    {info.times}× · <Text style={{ fontWeight: "700", color: c.text }}>{Math.round(info.kcal)}</Text> kcal
                  </Text>
                </View>
                <View style={{ marginTop: 4, height: 6, borderRadius: 3, backgroundColor: c.track, overflow: "hidden" }}>
                  <View style={{ width: `${(info.kcal / topKcal) * 100}%`, height: 6, borderRadius: 3, backgroundColor: nutrientColor("calories") }} />
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
                <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>{shownWeight(latest.weight)}</Text>
                {change != null && (
                  <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: "600", color: change <= 0 ? c.success : c.warning }}>
                    {change > 0 ? "+" : ""}
                    {shownWeight(change).toFixed(1)} {weightUnits === "metric" ? "kg" : "lbs"} since start
                  </Text>
                )}
              </View>
              <LineChart points={weightPoints.map((w) => ({ key: w._id, label: shortDay(w.date), value: shownWeight(w.weight) }))} target={settings.goalWeight != null ? shownWeight(settings.goalWeight) : null} height={130} color={c.ink} />
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

    </WebPage>
    </OrbitPage>
  );
}
