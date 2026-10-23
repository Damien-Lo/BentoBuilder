import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DateTextInput } from "@/src/components/forms";
import { useWideForm } from "@/src/components/forms/wideForm";
import { deskCard, DeskHeader, NutritionDesk, useNutritionDesk } from "@/src/components/health/web/NutritionDesk";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import { deleteWeightEntry, getWeightEntries, logWeightEntry, type WeightEntry } from "@/src/services/weightEntryApi";
import { formatDateDisplay, todayDateInputString } from "@/src/utils/date";
import { SECTION_PALETTE } from "@/src/theme/orbit";

import { toShown, toStored, useUnits } from "@/src/components/health/units";
import { WeightPhone } from "@/src/components/health/WeightPhone";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Weight: on the phone, Health's page (WeightPhone, below); in a desktop
// browser, in Orbit's look and Nutrition's green, as it was.
export default function WeightScreen() {
  return (
    <NutritionDesk>
      <WeightPage />
    </NutritionDesk>
  );
}

function WeightPage() {
  return useNutritionDesk() ? <WeightDesk /> : <WeightPhone />;
}

function WeightDesk() {
  const router = useRouter();
  // The page's colours in a desktop browser; null on a phone.
  const o = useNutritionDesk();
  // Kept in kilograms; shown and typed in the page's units (the phone's
  // switch — the same choice).
  const [units] = useUnits("weight");
  const W = (kg: number) => round1(toShown("weight", kg, units));
  const U = units === "metric" ? "kg" : "lbs";
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [weightText, setWeightText] = useState("");
  const [dateText, setDateText] = useState(todayDateInputString());
  const layout = useWideForm();

  // Scrolls the log-a-weigh-in row into view on focus — see
  // useScrollFocusSection. Weight and date share one section since they
  // sit in the same visual row; no dropdown fields on this page, so no
  // zIndex is needed.
  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);
  const logSection = useScrollFocusSection(scrollRef, scrollAnchorRef);

  function refresh() {
    return Promise.all([getWeightEntries(), loadSettings()]).then(([loadedEntries, loadedSettings]) => {
      setEntries(loadedEntries);
      setSettings(loadedSettings);
    });
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, []);

  // Entries come back sorted newest-first from the server.
  const current = entries[0]?.weight ?? settings?.startingWeight ?? null;
  const starting = settings?.startingWeight ?? (entries.length ? entries[entries.length - 1].weight : null);
  const goal = settings?.goalWeight ?? null;

  const changeFromStart = current != null && starting != null ? round1(current - starting) : null;
  const toGoal = current != null && goal != null ? round1(goal - current) : null;

  const rows = useMemo(
    () =>
      entries.map((entry, i) => ({
        entry,
        delta: i < entries.length - 1 ? round1(entry.weight - entries[i + 1].weight) : null,
      })),
    [entries],
  );

  async function handleLog() {
    const weight = Number(weightText.trim());
    if (!weightText.trim() || !Number.isFinite(weight) || weight <= 0) {
      Alert.alert("Enter a weight", "Please enter a valid weight before logging.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      Alert.alert("Enter a date", "Please enter a complete date before logging.");
      return;
    }

    try {
      setIsSubmitting(true);
      await logWeightEntry(toStored("weight", weight, units), dateText);
      setWeightText("");
      setDateText(todayDateInputString());
      await refresh();
    } catch {
      Alert.alert("Error", "Could not log this weigh-in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteWeightEntry(id);
      setEntries(prev => prev.filter(e => e._id !== id));
    } catch {
      Alert.alert("Error", "Could not delete this entry. Please try again.");
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={o && { backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o?.ink ?? "#2563EB"} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={o && { backgroundColor: o.canvas }}>
      <KeyboardAvoidingView
        className="flex-1"
        style={layout.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header (in a desktop browser, the title large on the page) */}
        {o ? (
          <DeskHeader o={o} title="Weight & Measurements" subtitle="Your weigh-in history" onBack={() => router.back()} />
        ) : (
        <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-3">
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <View className="ml-1">
            <Text className="text-2xl font-bold text-slate-950">Weight & Measurements</Text>
            <Text className="mt-0.5 text-sm text-slate-500">Your weigh-in history</Text>
          </View>
        </View>
        )}

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={scrollAnchorRef} collapsable={false} />
          {/* ── Progress summary ── */}
          <View className="flex-row overflow-hidden rounded-2xl border border-slate-200 bg-white" style={o && deskCard(o)}>
            <View className="flex-1 items-center border-r border-slate-100 py-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">Starting</Text>
              <Text className="mt-1 text-lg font-bold text-slate-900">{starting != null ? W(starting) : "—"}</Text>
            </View>
            <View className="flex-1 items-center border-r border-slate-100 py-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current</Text>
              <Text className="mt-1 text-lg font-bold text-blue-600" style={o && { color: o.ink }}>{current != null ? W(current) : "—"}</Text>
            </View>
            <View className="flex-1 items-center py-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">Goal</Text>
              <Text className="mt-1 text-lg font-bold text-slate-900">{goal != null ? W(goal) : "—"}</Text>
            </View>
          </View>

          {(changeFromStart != null || toGoal != null) && (
            <View className="mt-3 flex-row items-center justify-center rounded-2xl bg-blue-50 px-4 py-3" style={o && { backgroundColor: SECTION_PALETTE.nutrition.tint, borderRadius: 18 }}>
              <Ionicons
                name={changeFromStart != null && changeFromStart <= 0 ? "trending-down-outline" : "trending-up-outline"}
                size={18}
                color={o?.ink ?? "#2563EB"}
              />
              <Text className="ml-2 text-sm text-blue-700" style={o && { color: o.ink }}>
                {changeFromStart != null && (
                  <Text className="font-bold">
                    {changeFromStart > 0 ? `+${W(changeFromStart)}` : W(changeFromStart)} {U} since start
                  </Text>
                )}
                {changeFromStart != null && toGoal != null ? "  ·  " : ""}
                {toGoal != null && (
                  <Text>
                    {W(Math.abs(toGoal))} {U} {toGoal >= 0 ? "to go" : "past goal"}
                  </Text>
                )}
              </Text>
            </View>
          )}

          {/* In a desktop browser, logging and the history sit side by side. */}
          <View style={layout.columns}>
          <View style={layout.column}>
          {/* ── Log a weigh-in ── */}
          <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">
            Log a weigh-in
          </Text>
          <View
            className="flex-row items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3"
            {...logSection.wrapperProps}
            style={o ? [logSection.wrapperProps.style, deskCard(o)] : logSection.wrapperProps.style}
          >
            <View className="flex-1">
              <Text className="mb-1 text-xs font-semibold text-slate-400">Weight ({U})</Text>
              <TextInput
                value={weightText}
                onChangeText={setWeightText}
                onFocus={logSection.trigger}
                placeholder="e.g. 168.4"
                placeholderTextColor={o?.faint ?? "#94A3B8"}
                keyboardType="numeric"
                returnKeyType="done"
                className="rounded-xl bg-slate-100 px-3 py-2.5 text-base font-semibold text-slate-900"
                style={o && { backgroundColor: o.pill, color: o.text }}
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-xs font-semibold text-slate-400">Date</Text>
              <DateTextInput
                value={dateText}
                onChangeText={setDateText}
                onFocus={logSection.trigger}
                className="rounded-xl bg-slate-100 px-3 py-2.5 text-base font-semibold text-slate-900"
                style={o && { backgroundColor: o.pill }}
              />
            </View>
            <Pressable
              onPress={() => void handleLog()}
              disabled={isSubmitting}
              className={`h-11 w-11 items-center justify-center rounded-full ${
                isSubmitting ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
              }`}
              style={o && { backgroundColor: o.ink, opacity: isSubmitting ? 0.5 : 1 }}
            >
              <Ionicons name="checkmark" size={22} color={o?.onInk ?? "#fff"} />
            </Pressable>
          </View>

          </View>

          <View style={layout.column}>
          {/* ── History ── */}
          <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">
            History
          </Text>
          {rows.length === 0 ? (
            <View className="items-center rounded-2xl border border-slate-200 bg-white py-8" style={o && deskCard(o)}>
              <Ionicons name="bar-chart-outline" size={28} color="#CBD5E1" />
              <Text className="mt-2 text-sm text-slate-400">No weigh-ins logged yet</Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={o && deskCard(o)}>
              {rows.map(({ entry, delta }, i) => (
                <View
                  key={entry._id}
                  className={`flex-row items-center justify-between px-4 py-3.5 ${
                    i < rows.length - 1 ? "border-b border-slate-100" : ""
                  }`}
                >
                  <View>
                    <Text className="text-base font-semibold text-slate-900">{W(entry.weight)} {U}</Text>
                    <Text className="mt-0.5 text-xs text-slate-400">{formatDateDisplay(entry.date)}</Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    {delta != null && (
                      <Text className={`text-xs font-semibold ${delta > 0 ? "text-rose-500" : delta < 0 ? "text-emerald-500" : "text-slate-400"}`}>
                        {delta > 0 ? `+${W(delta)}` : W(delta)}
                      </Text>
                    )}
                    <Pressable
                      onPress={() => void handleDelete(entry._id)}
                      className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100"
                    >
                      <Ionicons name="trash-outline" size={16} color="#94A3B8" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
