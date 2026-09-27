import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
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

import { useRouter } from "expo-router";

import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from "@/src/services/settingsService";
import { getUnitSuggestions } from "@/src/services/optionsApi";
import { DAY_ABBREVS } from "@/src/utils/mealPlan";
import { SettingsSectionHeader as SectionHeader, UnitConversionsEditor } from "@/src/components/forms";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";

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
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [units, setUnits] = useState<string[]>([]);

  // Scrolls the focused field into view — see useScrollFocusSection. Only
  // one plain focusable field (Display name) on this page — WeekStartPicker
  // is buttons, not a text field, and UnitConversionsEditor isn't part of
  // this rollout (see the other reference pages, which leave it unwired
  // too). No dropdown fields, so no zIndex is needed.
  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);
  const displayNameSection = useScrollFocusSection(scrollRef, scrollAnchorRef);

  useEffect(() => {
    Promise.all([loadSettings(), getUnitSuggestions()])
      .then(([loadedSettings, loadedUnits]) => {
        setSettings(loadedSettings);
        setUnits(Array.isArray(loadedUnits) ? loadedUnits : []);
      })
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
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={scrollAnchorRef} collapsable={false} />
          {/* ── Profile ── */}
          <SectionHeader title="Profile" />
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <View className="border-b border-slate-100 px-4 py-3.5" {...displayNameSection.wrapperProps}>
              <Text className="mb-1.5 text-xs font-semibold text-slate-400">Display name</Text>
              <TextInput
                value={settings.displayName}
                onChangeText={v => patch({ displayName: v })}
                onFocus={displayNameSection.trigger}
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
                <Text className="mt-0.5 text-sm text-slate-400">How we&apos;ll greet you in the app</Text>
              </View>
            </View>
          </View>

          {/* ── Planner ── */}
          <SectionHeader title="Planner" />
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <View className="border-b border-slate-100 px-4 pt-3.5">
              <Text className="text-xs font-semibold text-slate-400">Week starts on</Text>
            </View>
            <WeekStartPicker
              value={settings.weekStartDay}
              onChange={day => patch({ weekStartDay: day })}
            />
          </View>

          {/* ── Unit conversions ── */}
          <SectionHeader title="Unit Conversions" />
          <Text className="mb-2 text-sm text-slate-500">
            Built-in conversions (g/kg, mL/L, cup/tbsp/tsp, oz/lb, etc.) apply
            automatically. Add your own for anything else, e.g. 1 packet = 340 g.
          </Text>
          <UnitConversionsEditor
            conversions={settings.unitConversions}
            onChange={(conversions) => patch({ unitConversions: conversions })}
            unitOptions={units}
          />

          {/* ── Manage lists ── */}
          <SectionHeader title="Lists" />
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <Pressable
              className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3.5 active:bg-slate-50"
              onPress={() => router.push("/manage-lists")}
            >
              <View className="flex-row items-center">
                <Ionicons name="pricetag-outline" size={18} color="#475569" />
                <Text className="ml-3 text-base text-slate-700">
                  Manage tags, categories, brands &amp; stores
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
            <Pressable
              className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3.5 active:bg-slate-50"
              onPress={() => router.push("/restaurant-meals")}
            >
              <View className="flex-row items-center">
                <Ionicons name="restaurant-outline" size={18} color="#475569" />
                <Text className="ml-3 text-base text-slate-700">
                  Manage eating-out visits
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
            <Pressable
              className="flex-row items-center justify-between px-4 py-3.5 active:bg-slate-50"
              onPress={() => router.push("/archive")}
            >
              <View className="flex-row items-center">
                <Ionicons name="archive-outline" size={18} color="#475569" />
                <Text className="ml-3 text-base text-slate-700">
                  Archived ingredients, recipes &amp; meals
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
          </View>

          {/* ── About ── */}
          <SectionHeader title="About" />
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
