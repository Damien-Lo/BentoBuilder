import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NutritionSummaryCard } from "@/src/components/health/NutritionSummaryCard";
import { getMealPlanForDate, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import { getWeightEntries, type WeightEntry } from "@/src/services/weightEntryApi";
import {
  computeDayNutrition,
  DAY_ABBREVS,
  getWeekDates,
  parseLocalDate,
  todayStr,
  weekRangeLabel,
} from "@/src/utils/mealPlan";

const BAR_MAX_HEIGHT = 90;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export default function WeeklyReportScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [weekEntries, setWeekEntries] = useState<MealPlanEntry[][]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);

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
  const weightChange =
    weightInWeek.length >= 2
      ? round1(weightInWeek[weightInWeek.length - 1].weight - weightInWeek[0].weight)
      : null;

  const today = todayStr();

  if (isLoading || !settings) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      {/* Header */}
      <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-3">
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <View className="ml-1">
          <Text className="text-2xl font-bold text-slate-950">My Weekly Report</Text>
          <Text className="mt-0.5 text-sm text-slate-500">{weekRangeLabel(weekDates)}</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <NutritionSummaryCard
          title="This week"
          subtitle={weekRangeLabel(weekDates)}
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

        {/* ── Daily calories bar chart ── */}
        <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">
          Calories by day
        </Text>
        <View className="rounded-2xl border border-slate-200 bg-white px-4 pb-4 pt-6">
          <View className="flex-row items-end justify-between" style={{ height: BAR_MAX_HEIGHT }}>
            {weekDates.map((date, i) => {
              const cal = dailyCalories[i] ?? 0;
              const height = Math.max((cal / maxCalories) * BAR_MAX_HEIGHT, cal > 0 ? 4 : 0);
              const over = settings.dailyCalorieLimit != null && cal > settings.dailyCalorieLimit;
              const isToday = date === today;
              return (
                <View key={date} className="flex-1 items-center justify-end">
                  <View
                    style={{
                      width: 18,
                      height,
                      borderRadius: 6,
                      backgroundColor: over ? "#F87171" : isToday ? "#2563EB" : "#93C5FD",
                    }}
                  />
                </View>
              );
            })}
          </View>
          <View className="mt-2 flex-row justify-between">
            {weekDates.map(date => (
              <View key={date} className="flex-1 items-center">
                <Text className={`text-xs font-semibold ${date === today ? "text-blue-600" : "text-slate-400"}`}>
                  {DAY_ABBREVS[parseLocalDate(date).getDay()]}
                </Text>
              </View>
            ))}
          </View>
          <View className="mt-4 flex-row items-center justify-center border-t border-slate-100 pt-3">
            <Text className="text-sm text-slate-500">
              Average <Text className="font-bold text-slate-800">{avgCalories} kcal</Text> / logged day
            </Text>
          </View>
        </View>

        {/* ── Weight this week ── */}
        <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">
          Weight
        </Text>
        <View className="flex-row items-center rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <Ionicons
            name={weightChange != null && weightChange <= 0 ? "trending-down-outline" : "trending-up-outline"}
            size={20}
            color="#2563EB"
          />
          <Text className="ml-3 text-sm text-slate-600">
            {weightInWeek.length >= 2 ? (
              <>
                <Text className="font-bold text-slate-900">
                  {weightChange! > 0 ? `+${weightChange}` : weightChange} lbs
                </Text>{" "}
                this week
              </>
            ) : weightInWeek.length === 1 ? (
              <>Logged once this week — {weightInWeek[0].weight} lbs</>
            ) : (
              "No weigh-ins logged this week"
            )}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
