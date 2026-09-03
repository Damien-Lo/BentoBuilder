import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
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

import { DateTextInput, SettingsNumericInput, SettingsRow, SettingsSectionHeader } from "@/src/components/forms";
import { loadSettings, saveSettings, type AppSettings } from "@/src/services/settingsService";

export default function GoalsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    displayName: "",
    dailyCalorieLimit: null,
    dailyProteinLimit: null,
    dailyCarbsLimit: null,
    dailyFatsLimit: null,
    dailyFiberLimit: null,
    dailySodiumLimit: null,
    weekStartDay: 1,
    unitConversions: [],
    startingWeight: null,
    startingWeightDate: null,
    goalWeight: null,
  });

  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .finally(() => setIsLoading(false));
  }, []);

  function patch(partial: Partial<AppSettings>) {
    setSettings(prev => ({ ...prev, ...partial }));
  }

  async function handleSave() {
    try {
      setIsSaving(true);
      await saveSettings(settings);
      Alert.alert("Saved", "Your goals have been saved.");
    } catch {
      Alert.alert("Error", "Could not save your goals. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

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
        <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-3">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <View className="ml-1">
            <Text className="text-2xl font-bold text-slate-950">Goals</Text>
            <Text className="mt-0.5 text-sm text-slate-500">Your weight targets</Text>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Weight ── */}
          <SettingsSectionHeader title="Weight" />
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <SettingsRow label="Starting weight">
              <SettingsNumericInput
                value={settings.startingWeight}
                onChange={v => patch({ startingWeight: v })}
                placeholder="—"
                unit="lbs"
              />
            </SettingsRow>
            <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3.5 last:border-b-0">
              <Text className="text-base text-slate-700">Starting date</Text>
              <DateTextInput
                value={settings.startingWeightDate ?? ""}
                onChangeText={v => patch({ startingWeightDate: v || null })}
                className="min-w-[110px] rounded-xl bg-slate-100 px-3 py-2 text-right text-base font-semibold text-slate-900"
              />
            </View>
            <SettingsRow label="Goal weight">
              <SettingsNumericInput
                value={settings.goalWeight}
                onChange={v => patch({ goalWeight: v })}
                placeholder="—"
                unit="lbs"
              />
            </SettingsRow>
          </View>

          <Pressable
            className="mt-3 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 active:bg-slate-50"
            onPress={() => router.back()}
          >
            <View className="flex-row items-center">
              <Ionicons name="pie-chart-outline" size={18} color="#2563EB" />
              <Text className="ml-3 text-base text-slate-700">
                Daily calorie & macro goals live on the Nutrition tab
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </Pressable>

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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
