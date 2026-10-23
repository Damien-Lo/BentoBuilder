import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { useWideForm } from "@/src/components/forms/wideForm";
import { deskCard, DeskHeader, NutritionDesk, useNutritionDesk } from "@/src/components/health/web/NutritionDesk";
import { Button } from "@/src/components/web/ui";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from "@/src/services/settingsService";
import { SECTION_PALETTE } from "@/src/theme/orbit";
import { toShown, toStored, useUnits } from "@/src/components/health/units";

// (In a desktop browser, in Orbit's look and Nutrition's green.)
export default function GoalsScreen() {
  return (
    <NutritionDesk>
      <GoalsPage />
    </NutritionDesk>
  );
}

function GoalsPage() {
  const router = useRouter();
  // The page's colours in a desktop browser; null on a phone.
  const o = useNutritionDesk();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const layout = useWideForm();
  // Weights kept in kilograms, shown and typed in the Weight page's units.
  const [units] = useUnits("weight");
  const shownWeight = (kg: number | null) => (kg == null ? null : Math.round(toShown("weight", kg, units) * 10) / 10);
  const keptWeight = (v: number | null) => (v == null ? null : toStored("weight", v, units));
  const weightUnit = units === "metric" ? "kg" : "lbs";

  // Scrolls whichever field was just focused into view — see
  // useScrollFocusSection. No dropdown-capable fields on this page, so
  // every section omits zIndex (defaults to 0).
  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);
  const startingWeightSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const startingDateSection = useScrollFocusSection(scrollRef, scrollAnchorRef);
  const goalWeightSection = useScrollFocusSection(scrollRef, scrollAnchorRef);

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
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={o && { backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o?.ink ?? "#2563EB"} />
      </SafeAreaView>
    );
  }

  // The page's two cards, side by side in a desktop browser.
  const weightSection = (
    <>
      {/* ── Weight ── */}
      <SettingsSectionHeader title="Weight" />
      <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={o && deskCard(o)}>
        <View {...startingWeightSection.wrapperProps}>
          <SettingsRow label="Starting weight">
            <SettingsNumericInput
              value={shownWeight(settings.startingWeight)}
              onChange={v => patch({ startingWeight: keptWeight(v) })}
              placeholder="—"
              unit={weightUnit}
              onFocus={startingWeightSection.trigger}
            />
          </SettingsRow>
        </View>
        <View
          className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3.5 last:border-b-0"
          {...startingDateSection.wrapperProps}
        >
          <Text className="text-base text-slate-700">Starting date</Text>
          <DateTextInput
            value={settings.startingWeightDate ?? ""}
            onChangeText={v => patch({ startingWeightDate: v || null })}
            onFocus={startingDateSection.trigger}
            className="min-w-[110px] rounded-xl bg-slate-100 px-3 py-2 text-right text-base font-semibold text-slate-900"
            style={o && { backgroundColor: o.pill }}
          />
        </View>
        <View {...goalWeightSection.wrapperProps}>
          <SettingsRow label="Goal weight">
            <SettingsNumericInput
              value={shownWeight(settings.goalWeight)}
              onChange={v => patch({ goalWeight: keptWeight(v) })}
              placeholder="—"
              unit={weightUnit}
              onFocus={goalWeightSection.trigger}
            />
          </SettingsRow>
        </View>
      </View>
    </>
  );

  const nutritionLink = (
    <Pressable
      className={`${layout.wide ? "" : "mt-3 "}flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 active:bg-slate-50`}
      style={o && deskCard(o)}
      onPress={() => router.back()}
    >
      <View className="mr-2 flex-1 flex-row items-center">
        {/* (In a desktop browser, its icon in a well of Nutrition's green.) */}
        {o ? (
          <View style={{ width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: SECTION_PALETTE.nutrition.tint }}>
            <Ionicons name="pie-chart-outline" size={17} color={o.ink} />
          </View>
        ) : (
          <Ionicons name="pie-chart-outline" size={18} color="#2563EB" />
        )}
        <Text className="ml-3 flex-1 text-base text-slate-700">
          Daily calorie & macro goals live on the Nutrition tab
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={o && { backgroundColor: o.canvas }}>
      <KeyboardAvoidingView
        className="flex-1"
        style={layout.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header (in a desktop browser, the title large on the page) */}
        {o ? (
          <DeskHeader o={o} title="Goals" subtitle="Your weight targets" onBack={() => router.back()} />
        ) : (
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
        )}

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={scrollAnchorRef} collapsable={false} />
          {layout.wide ? (
            <View style={layout.columns}>
              <View style={layout.column}>{weightSection}</View>
              <View style={layout.column}>
                <SettingsSectionHeader title="Calories & macros" />
                {nutritionLink}
              </View>
            </View>
          ) : (
            <>
              {weightSection}
              {nutritionLink}
            </>
          )}

          {/* Save button */}
          {o ? (
            <View style={{ marginTop: 24, flexDirection: "row", justifyContent: "flex-end" }}>
              <Button label={isSaving ? "Saving…" : "Save goals"} kind="primary" onPress={() => !isSaving && void handleSave()} />
            </View>
          ) : (
          <View style={layout.actions}>
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
          </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
