import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NutritionSummaryCard } from "@/src/components/health/NutritionSummaryCard";
import { SettingsNumericInput, SettingsRow, SettingsSectionHeader } from "@/src/components/forms";
import { getMealPlanForDate, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from "@/src/services/settingsService";
import { computeDayNutrition, todayStr } from "@/src/utils/mealPlan";

interface MoreRow {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

// Weight & Measurements and Goals live here for now — they'll move to a
// dedicated Health section once there's more than nutrition under it (gym
// tracker, etc.), so their routes stay under /health/ rather than /nutrition/.
const MORE_ROWS: MoreRow[] = [
  { id: "nutrients", label: "All Nutrients", icon: "nutrition-outline", route: "/health/nutrients" },
  { id: "goals", label: "Goals", icon: "locate-outline", route: "/health/goals" },
  { id: "weight", label: "Weight & Measurements", icon: "bar-chart-outline", route: "/health/weight" },
  { id: "weekly-report", label: "My Weekly Report", icon: "stats-chart-outline", route: "/health/weekly-report" },
];

export default function NutritionScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Reloaded on every focus, not just mount — this tab stays mounted, and
  // goals/meals can change from the screens pushed on top of it (All
  // Nutrients, the planner).
  useFocusEffect(
    useCallback(() => {
      Promise.all([loadSettings(), getMealPlanForDate(todayStr())])
        .then(([loadedSettings, loadedEntries]) => {
          setSettings(loadedSettings);
          setEntries(loadedEntries);
        })
        .finally(() => setIsLoading(false));
    }, []),
  );

  function patch(partial: Partial<AppSettings>) {
    setSettings(prev => ({ ...prev, ...partial }));
  }

  async function handleSave() {
    try {
      setIsSaving(true);
      await saveSettings({
        dailyCalorieLimit: settings.dailyCalorieLimit,
        dailyProteinLimit: settings.dailyProteinLimit,
        dailyCarbsLimit: settings.dailyCarbsLimit,
        dailyFatsLimit: settings.dailyFatsLimit,
        dailyFiberLimit: settings.dailyFiberLimit,
        dailySodiumLimit: settings.dailySodiumLimit,
      });
      Alert.alert("Saved", "Your nutrition goals have been saved.");
    } catch {
      Alert.alert("Error", "Could not save your goals. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const confirmedNutrition = useMemo(
    () => computeDayNutrition(entries.filter(e => e.status === "confirmed"), settings.unitConversions),
    [entries, settings.unitConversions],
  );
  const plannedNutrition = useMemo(
    () => computeDayNutrition(entries.filter(e => e.status === "planned"), settings.unitConversions),
    [entries, settings.unitConversions],
  );

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="border-b border-slate-200 bg-white px-5 py-4">
          <Text className="text-3xl font-bold text-slate-950">Nutrition</Text>
          <Text className="mt-1 text-base text-slate-500">Today&apos;s intake & daily goals</Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <NutritionSummaryCard
            title="Today"
            confirmed={confirmedNutrition}
            planned={plannedNutrition}
            limits={{
              calories: settings.dailyCalorieLimit,
              protein: settings.dailyProteinLimit,
              carbs: settings.dailyCarbsLimit,
              fats: settings.dailyFatsLimit,
              fiber: settings.dailyFiberLimit,
              sodium: settings.dailySodiumLimit,
            }}
          />

          {/* ── Daily nutrition goals ── */}
          <SettingsSectionHeader title="Daily Nutrition Goals" />
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <SettingsRow label="Calories">
              <SettingsNumericInput
                value={settings.dailyCalorieLimit}
                onChange={v => patch({ dailyCalorieLimit: v })}
                placeholder="2000"
                unit="kcal"
              />
            </SettingsRow>
            <SettingsRow label="Protein">
              <SettingsNumericInput
                value={settings.dailyProteinLimit}
                onChange={v => patch({ dailyProteinLimit: v })}
                placeholder="—"
                unit="g"
              />
            </SettingsRow>
            <SettingsRow label="Carbohydrates">
              <SettingsNumericInput
                value={settings.dailyCarbsLimit}
                onChange={v => patch({ dailyCarbsLimit: v })}
                placeholder="—"
                unit="g"
              />
            </SettingsRow>
            <SettingsRow label="Fats">
              <SettingsNumericInput
                value={settings.dailyFatsLimit}
                onChange={v => patch({ dailyFatsLimit: v })}
                placeholder="—"
                unit="g"
              />
            </SettingsRow>
            <SettingsRow label="Fiber">
              <SettingsNumericInput
                value={settings.dailyFiberLimit}
                onChange={v => patch({ dailyFiberLimit: v })}
                placeholder="—"
                unit="g"
              />
            </SettingsRow>
            <SettingsRow label="Sodium">
              <SettingsNumericInput
                value={settings.dailySodiumLimit}
                onChange={v => patch({ dailySodiumLimit: v })}
                placeholder="—"
                unit="mg"
              />
            </SettingsRow>
          </View>

          {/* Save button */}
          <Pressable
            onPress={() => void handleSave()}
            disabled={isSaving}
            className={`mt-8 items-center rounded-3xl py-4 ${
              isSaving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
            }`}
          >
            <Text className="text-base font-bold text-white">
              {isSaving ? "Saving…" : "Save goals"}
            </Text>
          </Pressable>

          {/* ── More ── */}
          <SettingsSectionHeader title="More" />
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {MORE_ROWS.map((row, i) => (
              <Pressable
                key={row.id}
                className={`flex-row items-center justify-between px-4 py-3.5 active:bg-slate-50 ${
                  i < MORE_ROWS.length - 1 ? "border-b border-slate-100" : ""
                }`}
                onPress={() => router.push(row.route as Parameters<typeof router.push>[0])}
              >
                <View className="flex-row items-center">
                  <Ionicons name={row.icon} size={18} color="#475569" />
                  <Text className="ml-3 text-base text-slate-700">{row.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
