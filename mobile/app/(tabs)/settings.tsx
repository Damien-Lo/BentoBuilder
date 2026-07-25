import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { loadSettings, saveSettings, type AppSettings } from "@/src/services/settingsService";
import { DAY_ABBREVS } from "@/src/utils/mealPlan";

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">
      {title}
    </Text>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3.5 last:border-b-0">
      <Text className="text-base text-slate-700">{label}</Text>
      <View className="ml-4 flex-1 items-end">{children}</View>
    </View>
  );
}

function NumericInput({
  value,
  onChange,
  placeholder,
  unit,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
  unit?: string;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setText(value != null ? String(value) : "");
  }, [value]);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) { onChange(null); return; }
    const n = Number(trimmed);
    onChange(Number.isFinite(n) && n >= 0 ? n : value);
  }

  return (
    <View className="flex-row items-center">
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={() => commit(text)}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType="numeric"
        returnKeyType="done"
        className="min-w-[72px] rounded-xl bg-slate-100 px-3 py-2 text-right text-base font-semibold text-slate-900"
      />
      {unit && (
        <Text className="ml-1.5 text-sm text-slate-400">{unit}</Text>
      )}
    </View>
  );
}

function WeekStartPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (day: number) => void;
}) {
  return (
    <View className="flex-row gap-1.5 px-4 py-3.5">
      {DAY_ABBREVS.map((label, day) => {
        const isSelected = day === value;
        return (
          <Pressable
            key={day}
            onPress={() => onChange(day)}
            className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
            style={isSelected ? pickerStyles.selectedDay : undefined}
          >
            <Text
              className="text-xs font-semibold text-slate-600"
              style={isSelected ? pickerStyles.selectedDayText : undefined}
            >
              {label[0]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  selectedDay: {
    backgroundColor: "#2563EB",
  },
  selectedDayText: {
    color: "#fff",
  },
});

export default function SettingsScreen() {
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
      Alert.alert("Saved", "Your settings have been saved.");
    } catch {
      Alert.alert("Error", "Could not save settings. Please try again.");
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
        <View className="border-b border-slate-200 bg-white px-5 py-4">
          <Text className="text-3xl font-bold text-slate-950">Settings</Text>
          <Text className="mt-1 text-base text-slate-500">Personalise your BentoBuilder experience</Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Profile ── */}
          <SectionHeader title="Profile" />
          <View className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <View className="border-b border-slate-100 px-4 py-3.5">
              <Text className="mb-1.5 text-xs font-semibold text-slate-400">Display name</Text>
              <TextInput
                value={settings.displayName}
                onChangeText={v => patch({ displayName: v })}
                placeholder="e.g. Alex"
                placeholderTextColor="#94A3B8"
                autoCapitalize="words"
                returnKeyType="done"
                className="text-base text-slate-900"
              />
            </View>

            <View className="flex-row items-center px-4 py-3.5">
              <Ionicons name="person-circle-outline" size={38} color="#2563EB" />
              <View className="ml-3">
                <Text className="font-semibold text-slate-900">
                  {settings.displayName || "Your name"}
                </Text>
                <Text className="mt-0.5 text-sm text-slate-400">How we'll greet you in the app</Text>
              </View>
            </View>
          </View>

          {/* ── Planner ── */}
          <SectionHeader title="Planner" />
          <View className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <View className="border-b border-slate-100 px-4 pt-3.5">
              <Text className="text-xs font-semibold text-slate-400">Week starts on</Text>
            </View>
            <WeekStartPicker
              value={settings.weekStartDay}
              onChange={day => patch({ weekStartDay: day })}
            />
          </View>

          {/* ── Daily nutrition goals ── */}
          <SectionHeader title="Daily Nutrition Goals" />
          <View className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <SettingRow label="Calories">
              <NumericInput
                value={settings.dailyCalorieLimit}
                onChange={v => patch({ dailyCalorieLimit: v })}
                placeholder="2000"
                unit="kcal"
              />
            </SettingRow>
            <SettingRow label="Protein">
              <NumericInput
                value={settings.dailyProteinLimit}
                onChange={v => patch({ dailyProteinLimit: v })}
                placeholder="—"
                unit="g"
              />
            </SettingRow>
            <SettingRow label="Carbohydrates">
              <NumericInput
                value={settings.dailyCarbsLimit}
                onChange={v => patch({ dailyCarbsLimit: v })}
                placeholder="—"
                unit="g"
              />
            </SettingRow>
            <SettingRow label="Fats">
              <NumericInput
                value={settings.dailyFatsLimit}
                onChange={v => patch({ dailyFatsLimit: v })}
                placeholder="—"
                unit="g"
              />
            </SettingRow>
            <SettingRow label="Fiber">
              <NumericInput
                value={settings.dailyFiberLimit}
                onChange={v => patch({ dailyFiberLimit: v })}
                placeholder="—"
                unit="g"
              />
            </SettingRow>
            <SettingRow label="Sodium">
              <NumericInput
                value={settings.dailySodiumLimit}
                onChange={v => patch({ dailySodiumLimit: v })}
                placeholder="—"
                unit="mg"
              />
            </SettingRow>
          </View>

          {settings.dailyCalorieLimit != null && (
            <View className="mt-3 flex-row items-center rounded-2xl bg-blue-50 px-4 py-3">
              <Ionicons name="flame-outline" size={18} color="#2563EB" />
              <Text className="ml-2 text-sm text-blue-700">
                Daily target: <Text className="font-bold">{settings.dailyCalorieLimit} kcal</Text>
              </Text>
            </View>
          )}

          {/* ── About ── */}
          <SectionHeader title="About" />
          <View className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3.5">
              <Text className="text-base text-slate-700">App</Text>
              <Text className="text-base text-slate-400">BentoBuilder</Text>
            </View>
            <View className="flex-row items-center justify-between px-4 py-3.5">
              <Text className="text-base text-slate-700">Version</Text>
              <Text className="text-base text-slate-400">1.0.0</Text>
            </View>
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
              {isSaving ? "Saving…" : "Save settings"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
