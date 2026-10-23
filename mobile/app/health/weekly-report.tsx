import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useWideForm } from "@/src/components/forms/wideForm";
import { NutritionSummaryCard } from "@/src/components/health/NutritionSummaryCard";
import { toShown, useUnits } from "@/src/components/health/units";
import { deskCard, DeskHeader, NutritionDesk, useNutritionColors, useNutritionDesk } from "@/src/components/health/web/NutritionDesk";
import { PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { nutrientColor } from "@/src/theme/nutrients";
import { getMealPlanForDate, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import { getWeightEntries, type WeightEntry } from "@/src/services/weightEntryApi";
import {
  computeDayNutrition,
  DAY_ABBREVS,
  hexToRgba,
  getWeekDates,
  parseLocalDate,
  todayStr,
  weekRangeLabel,
} from "@/src/utils/mealPlan";

const BAR_MAX_HEIGHT = 90;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// In Orbit's look — Health's colour on a phone, Nutrition's green in a
// desktop browser.
export default function WeeklyReportScreen() {
  return (
    <NutritionDesk>
      <WeeklyReportPage />
    </NutritionDesk>
  );
}

function WeeklyReportPage() {
  const router = useRouter();
  // The page's colours; the desktop's, when it's in a desktop browser.
  const o = useNutritionColors();
  const desk = useNutritionDesk();
  const leave = useGoBack("/health-section");
  const [weightUnits] = useUnits("weight");
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [weekEntries, setWeekEntries] = useState<MealPlanEntry[][]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const layout = useWideForm();

  const weekStartDay = settings?.weekStartDay ?? 1;
  const weekDates = useMemo(() => getWeekDates(todayStr(), weekStartDay), [weekStartDay]);

  useEffect(() => {
    loadSettings().then(loadedSettings => {
      setSettings(loadedSettings);
      const dates = getWeekDates(todayStr(), loadedSettings.weekStartDay);
      Promise.all([
        Promise.all(dates.map(d => getMealPlanForDate(d))),
        getWeightEntries(),
      ])
        .then(([entries, weights]) => {
          setWeekEntries(entries);
          setWeightEntries(weights);
        })
        .finally(() => setIsLoading(false));
    });
  }, []);

  const conversions = useMemo(() => settings?.unitConversions ?? [], [settings]);

  const weeklyConfirmed = useMemo(
    () => computeDayNutrition(weekEntries.flat().filter(e => e.status === "confirmed"), conversions),
    [weekEntries, conversions],
  );
  const weeklyPlanned = useMemo(
    () => computeDayNutrition(weekEntries.flat().filter(e => e.status === "planned"), conversions),
    [weekEntries, conversions],
  );

  const dailyCalories = useMemo(
    () => weekEntries.map(dayEntries => computeDayNutrition(dayEntries.filter(e => e.status === "confirmed"), conversions).calories),
    [weekEntries, conversions],
  );
  const maxCalories = Math.max(...dailyCalories, settings?.dailyCalorieLimit ?? 0, 1);
  const daysLogged = dailyCalories.filter(c => c > 0).length;
  const avgCalories = daysLogged > 0 ? Math.round(weeklyConfirmed.calories / daysLogged) : 0;

  const weightInWeek = weightEntries
    .filter(e => e.date >= weekDates[0] && e.date <= weekDates[weekDates.length - 1])
    .sort((a, b) => a.date.localeCompare(b.date));
  // (Kept in kilograms; shown in the Weight page's units.)
  const shownWeight = (kg: number) => round1(toShown("weight", kg, weightUnits));
  const weightUnit = weightUnits === "metric" ? "kg" : "lbs";
  const weightChange =
    weightInWeek.length >= 2
      ? shownWeight(weightInWeek[weightInWeek.length - 1].weight - weightInWeek[0].weight)
      : null;

  const today = todayStr();

  if (isLoading || !settings) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: o.canvas }}>
        <ActivityIndicator color={o.muted} />
      </SafeAreaView>
    );
  }

  const heading = (text: string) => <Text style={{ marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: o.faint }}>{text.toUpperCase()}</Text>;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[layout.page, { flex: 1, backgroundColor: o.canvas }]}>
      {/* Header (in a desktop browser, the title large on the page) */}
      {desk ? (
        <DeskHeader o={o} title="My Weekly Report" subtitle={weekRangeLabel(weekDates)} onBack={() => router.back()} />
      ) : (
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <PageHeader title="Weekly report" subtitle={weekRangeLabel(weekDates)} onBack={leave} />
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <NutritionSummaryCard
          title="This week"
          subtitle={weekRangeLabel(weekDates)}
          orbit={o}
          confirmed={weeklyConfirmed}
          planned={weeklyPlanned}
          limits={{
            calories: settings.dailyCalorieLimit != null ? settings.dailyCalorieLimit * 7 : null,
            protein: settings.dailyProteinLimit != null ? settings.dailyProteinLimit * 7 : null,
            carbs: settings.dailyCarbsLimit != null ? settings.dailyCarbsLimit * 7 : null,
            fats: settings.dailyFatsLimit != null ? settings.dailyFatsLimit * 7 : null,
            fiber: settings.dailyFiberLimit != null ? settings.dailyFiberLimit * 7 : null,
            sodium: settings.dailySodiumLimit != null ? settings.dailySodiumLimit * 7 : null,
          }}
        />

        {/* In a desktop browser, the chart and the weight sit side by side. */}
        <View style={layout.columns}>
          <View style={layout.wide ? { flex: 1.6, minWidth: 0 } : undefined}>
            {/* Calories a day: the bars in the calories' own colour, today's
                the strongest, with the day's number over each — red, rather
                than the bar, when it's over the goal. */}
            {heading("Calories by day")}
            <View style={{ ...deskCard(o), paddingHorizontal: 16, paddingBottom: 16, paddingTop: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: BAR_MAX_HEIGHT + 18 }}>
                {weekDates.map((date, i) => {
                  const cal = dailyCalories[i] ?? 0;
                  const height = Math.max((cal / maxCalories) * BAR_MAX_HEIGHT, cal > 0 ? 4 : 0);
                  const over = settings.dailyCalorieLimit != null && cal > settings.dailyCalorieLimit;
                  const kcal = nutrientColor("calories");
                  return (
                    <View key={date} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
                      {cal > 0 && <Text style={{ marginBottom: 3, fontSize: 10, fontWeight: over ? "700" : "600", color: over ? o.danger : o.muted }}>{Math.round(cal)}</Text>}
                      <View style={{ width: 18, height, borderRadius: 6, backgroundColor: date === today ? kcal : hexToRgba(kcal, 0.55) }} />
                    </View>
                  );
                })}
              </View>
              <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
                {weekDates.map((date) => (
                  <View key={date} style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: date === today ? o.ink : o.faint }}>{DAY_ABBREVS[parseLocalDate(date).getDay()]}</Text>
                  </View>
                ))}
              </View>
              <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: o.border, alignItems: "center" }}>
                <Text style={{ fontSize: 14, color: o.muted }}>
                  Average <Text style={{ fontWeight: "700", color: o.text }}>{avgCalories} kcal</Text> a logged day
                </Text>
              </View>
            </View>
          </View>

          <View style={layout.column}>
            {heading("Weight")}
            <View style={{ ...deskCard(o), flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16 }}>
              <Ionicons name={weightChange != null && weightChange <= 0 ? "trending-down-outline" : "trending-up-outline"} size={20} color={o.ink} />
              <Text style={{ marginLeft: 12, flex: 1, fontSize: 14, color: o.icon }}>
                {weightInWeek.length >= 2 ? (
                  <>
                    <Text style={{ fontWeight: "700", color: o.text }}>
                      {weightChange! > 0 ? `+${weightChange}` : weightChange} {weightUnit}
                    </Text>{" "}
                    this week
                  </>
                ) : weightInWeek.length === 1 ? (
                  <>Logged once this week — {shownWeight(weightInWeek[0].weight)} {weightUnit}</>
                ) : (
                  "No weigh-ins logged this week"
                )}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
