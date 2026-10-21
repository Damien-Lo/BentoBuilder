import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import {
  SettingsNumericInput,
  SettingsRow,
  SettingsSectionHeader as SectionHeader,
  UnitConversionsEditor,
} from "@/src/components/forms";
import { useWideForm } from "@/src/components/forms/wideForm";
import { getIngredients } from "@/src/services/ingredientApi";
import { getRecipes } from "@/src/services/recipeApi";
import { DEFAULT_RATING_PROMPT_TIMING, updateRatingPrompt } from "@/src/utils/ratingPrompt";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { eyebrow, PageHeader, useGoBack } from "@/src/components/settings/AccountParts";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

// (`o`: on the phone, Orbit's colours — the chosen day in ink.)
function WeekStartPicker({
  value,
  onChange,
  o,
}: {
  value: number;
  onChange: (day: number) => void;
  o: OrbitColors | null;
}) {
  return (
    <View className="flex-row gap-1.5 px-4 py-3.5">
      {DAY_ABBREVS.map((label, day) => {
        const isSelected = day === value;
        return (
          <Pressable
            key={day}
            onPress={() => onChange(day)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
            style={o ? { backgroundColor: isSelected ? o.ink : o.pill } : isSelected ? pickerStyles.selectedDay : undefined}
          >
            <Text
              className="text-xs font-semibold text-slate-600"
              style={o ? { color: isSelected ? o.onInk : o.onPill } : isSelected ? pickerStyles.selectedDayText : undefined}
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

// Settings → Kitchen: your name, the planner's week, rating prompts, unit
// conversions, and the Kitchen's lists and archive. On the phone in Orbit's
// look, light or dark (`o`: its colours), in the plain accent; a desktop
// browser keeps the older look.
export default function SettingsScreen() {
  const router = useRouter();
  const back = useGoBack("/settings-section");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const layout = useWideForm();
  const { colors } = useOrbitTheme();
  const o = layout.wide ? null : colors;
  const card = o && { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 };
  const line = o && { borderBottomColor: o.border };
  const note = o && { color: o.muted, lineHeight: 20 };

  const [units, setUnits] = useState<string[]>([]);
  // Recipes/ingredients whose automatic rating prompt was turned off
  // ("Don't ask about this again") — listed so it can be turned back on.
  const [pausedRatings, setPausedRatings] = useState<
    { kind: "recipe" | "ingredient"; id: string; name: string }[]
  >([]);

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

    Promise.all([getRecipes(), getIngredients()])
      .then(([recipes, ingredients]) => {
        setPausedRatings([
          ...recipes
            .filter((r) => r.ratingPrompt?.disabled)
            .map((r) => ({ kind: "recipe" as const, id: r._id, name: r.name })),
          ...ingredients
            .filter((i) => i.ratingPrompt?.disabled)
            .map((i) => ({ kind: "ingredient" as const, id: i._id, name: i.name })),
        ].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {});
  }, []);

  async function resumeRatingPrompt(item: { kind: "recipe" | "ingredient"; id: string; name: string }) {
    try {
      await updateRatingPrompt(item.kind, item.id, "enable");
      setPausedRatings((prev) => prev.filter((p) => p.id !== item.id));
    } catch {
      Alert.alert("Error", `Couldn't turn rating prompts back on for ${item.name}.`);
    }
  }

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

  // A section's heading: an eyebrow on the phone.
  const sectionHeader = (title: string) =>
    o ? <Text style={{ ...eyebrow(o), marginTop: 28, marginBottom: 8, marginLeft: 4 }}>{title}</Text> : <SectionHeader title={title} />;
  // A row of a card: its label, and what sets it on the right.
  const settingsRow = (label: string, children: ReactNode) =>
    o ? (
      <View key={label} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ flexShrink: 1, fontSize: 16, color: o.text }}>{label}</Text>
        <View style={{ marginLeft: 16, flex: 1, alignItems: "flex-end" }}>{children}</View>
      </View>
    ) : (
      <SettingsRow key={label} label={label}>{children}</SettingsRow>
    );
  // A row that opens another page.
  const linkRow = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, last = false) =>
    o ? (
      <Tap key={label} onPress={onPress} accessibilityRole="button" style={[{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }, !last && { borderBottomWidth: 1, borderBottomColor: o.border }]} pressedStyle={{ backgroundColor: o.pill }}>
        <Ionicons name={icon} size={18} color={o.icon} />
        <Text style={{ marginLeft: 12, flex: 1, fontSize: 16, color: o.text }}>{label}</Text>
        <Ionicons name="chevron-forward" size={18} color={o.faint} />
      </Tap>
    ) : (
      <Pressable
        key={label}
        className={`flex-row items-center justify-between px-4 py-3.5 active:bg-slate-50 ${last ? "" : "border-b border-slate-100"}`}
        onPress={onPress}
      >
        <View className="flex-row items-center">
          <Ionicons name={icon} size={18} color="#475569" />
          <Text className="ml-3 text-base text-slate-700">{label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
      </Pressable>
    );
  // Settings' rows (every row but the last is followed by a hairline).
  const ruled = (rows: ReactNode[]) =>
    o ? rows.map((row, i) => (
      <View key={i} style={i < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: o.border } : undefined}>{row}</View>
    )) : rows;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50" style={o && { backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o?.muted ?? "#2563EB"} />
      </SafeAreaView>
    );
  }

  return (
    <OrbitPage on={!layout.wide}>
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={o && { backgroundColor: o.canvas }}>
      <KeyboardAvoidingView
        className="flex-1"
        style={layout.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header: on the phone the way back to Settings over a large title */}
        {o ? (
          <PageHeader title="Kitchen" subtitle="Your name, the planner, ratings, units and lists" onBack={back} style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 }} />
        ) : (
          <View className="border-b border-slate-200 bg-white px-5 py-4">
            <Text className="text-3xl font-bold text-slate-950">Settings</Text>
            <Text className="mt-1 text-base text-slate-500">Personalise your Orbit experience</Text>
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
          {/* In a desktop browser the sections are in two columns, raised
              so a unit dropdown opens over the Save button below them. */}
          <View style={layout.wide ? [layout.columns, { zIndex: 1 }] : undefined}>
          <View style={layout.column}>
          {/* ── Profile ── */}
          {sectionHeader("Profile")}
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={card}>
            <View className="border-b border-slate-100 px-4 py-3.5" {...displayNameSection.wrapperProps} style={[displayNameSection.wrapperProps.style, line]}>
              <Text className="mb-1.5 text-xs font-semibold text-slate-400" style={o && { color: o.faint }}>Display name</Text>
              <TextInput
                value={settings.displayName}
                onChangeText={v => patch({ displayName: v })}
                onFocus={displayNameSection.trigger}
                placeholder="e.g. Alex"
                placeholderTextColor={o?.faint ?? "#94A3B8"}
                autoCapitalize="words"
                returnKeyType="done"
                className="text-base text-slate-900"
                style={o && { color: o.text }}
              />
            </View>

            <View className="flex-row items-center px-4 py-3.5">
              <Ionicons name="person-circle-outline" size={38} color={o?.icon ?? "#2563EB"} />
              <View className="ml-3">
                <Text className="font-semibold text-slate-900" style={o && { color: o.text }}>
                  {settings.displayName || "Your name"}
                </Text>
                <Text className="mt-0.5 text-sm text-slate-400" style={o && { color: o.muted }}>How we&apos;ll greet you in the app</Text>
              </View>
            </View>
          </View>

          {/* ── Planner ── */}
          {sectionHeader("Planner")}
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={card}>
            <View className="border-b border-slate-100 px-4 pt-3.5" style={o && { borderBottomWidth: 0 }}>
              <Text className="text-xs font-semibold text-slate-400" style={o && { color: o.faint }}>Week starts on</Text>
            </View>
            <WeekStartPicker
              value={settings.weekStartDay}
              onChange={day => patch({ weekStartDay: day })}
              o={o}
            />
          </View>

          {/* ── Rating prompts ── */}
          {sectionHeader("Rating prompts")}
          <Text className="mb-2 text-sm text-slate-500" style={o && { ...note, marginHorizontal: 4 }}>
            After you log something as eaten, the planner asks how it was — but only when a new
            rating is useful. Swiping an entry to rate it always works.
          </Text>
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={card}>
            {ruled([
              settingsRow("Ask again after",
                <SettingsNumericInput
                  value={settings.ratingCooldownDays}
                  onChange={(v) => patch({ ratingCooldownDays: v || DEFAULT_RATING_PROMPT_TIMING.cooldownDays })}
                  placeholder={String(DEFAULT_RATING_PROMPT_TIMING.cooldownDays)}
                  unit="days"
                />,
              ),
              settingsRow("Once ratings are steady",
                <SettingsNumericInput
                  value={settings.ratingSettledCooldownDays}
                  onChange={(v) =>
                    patch({ ratingSettledCooldownDays: v || DEFAULT_RATING_PROMPT_TIMING.settledCooldownDays })
                  }
                  placeholder={String(DEFAULT_RATING_PROMPT_TIMING.settledCooldownDays)}
                  unit="days"
                />,
              ),
              settingsRow("After 2 skips in a row",
                <SettingsNumericInput
                  value={settings.ratingSkipBackoffDays}
                  onChange={(v) => patch({ ratingSkipBackoffDays: v || DEFAULT_RATING_PROMPT_TIMING.skipBackoffDays })}
                  placeholder={String(DEFAULT_RATING_PROMPT_TIMING.skipBackoffDays)}
                  unit="days"
                />,
              ),
            ])}
          </View>
          <Text className="mb-2 mt-3 text-sm text-slate-500" style={o && { ...note, marginHorizontal: 4 }}>
            It always asks about something you&apos;ve never rated, or a recipe whose ingredients changed.
            &quot;Steady&quot; means your last 3 ratings are within a point of each other.
          </Text>

          <Text className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400" style={o && { ...eyebrow(o), marginTop: 16, marginBottom: 8, marginLeft: 4 }}>
            Not asking about
          </Text>
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={card}>
            {pausedRatings.length === 0 ? (
              <Text className="px-4 py-3.5 text-sm text-slate-400" style={o && { color: o.muted, lineHeight: 20 }}>
                Nothing — tap &quot;Don&apos;t ask about this again&quot; on a rating prompt to add something here.
              </Text>
            ) : (
              pausedRatings.map((item, i) => (
                <View
                  key={item.id}
                  className="flex-row items-center border-b border-slate-100 px-4 py-3 last:border-b-0"
                  style={o && { borderBottomColor: o.border, borderBottomWidth: i < pausedRatings.length - 1 ? 1 : 0 }}
                >
                  <Ionicons
                    name={item.kind === "recipe" ? "book-outline" : "nutrition-outline"}
                    size={18}
                    color={o?.icon ?? "#475569"}
                  />
                  <Text className="ml-3 flex-1 text-base text-slate-700" style={o && { color: o.text }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {o ? (
                    <Tap onPress={() => void resumeRatingPrompt(item)} accessibilityRole="button" accessibilityLabel={`Ask again about ${item.name}`} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: o.pill }} pressedStyle={{ opacity: 0.7 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: o.onPill }}>Ask again</Text>
                    </Tap>
                  ) : (
                    <Pressable
                      onPress={() => void resumeRatingPrompt(item)}
                      className="rounded-full bg-blue-50 px-3 py-1.5 active:bg-blue-100"
                    >
                      <Text className="text-xs font-semibold text-blue-700">Ask again</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </View>

          </View>

          <View style={layout.column}>
          {/* ── Unit conversions ── */}
          {sectionHeader("Unit Conversions")}
          <Text className="mb-2 text-sm text-slate-500" style={o && { ...note, marginHorizontal: 4 }}>
            Built-in conversions (g/kg, mL/L, cup/tbsp/tsp, oz/lb, etc.) apply
            automatically. Add your own for anything else, e.g. 1 packet = 340 g.
          </Text>
          <UnitConversionsEditor
            conversions={settings.unitConversions}
            onChange={(conversions) => patch({ unitConversions: conversions })}
            unitOptions={units}
          />

          {/* ── Manage lists ── */}
          {sectionHeader("Lists")}
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={card}>
            {linkRow("pricetag-outline", "Manage tags, categories, brands & stores", () => router.push("/manage-lists"))}
            {linkRow("restaurant-outline", "Manage eating-out visits", () => router.push("/restaurant-meals"))}
            {linkRow("archive-outline", "Archived ingredients, recipes & meals", () => router.push("/archive"), true)}
          </View>

          {/* ── About ── */}
          {sectionHeader("About")}
          <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={card}>
            <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3.5" style={line}>
              <Text className="text-base text-slate-700" style={o && { color: o.text }}>App</Text>
              <Text className="text-base text-slate-400" style={o && { color: o.muted }}>Orbit</Text>
            </View>
            <View className="flex-row items-center justify-between px-4 py-3.5">
              <Text className="text-base text-slate-700" style={o && { color: o.text }}>Version</Text>
              <Text className="text-base text-slate-400" style={o && { color: o.muted }}>1.0.0</Text>
            </View>
          </View>

          </View>
          </View>

          {/* Save button */}
          <View style={layout.actions}>
          {o ? (
            <Tap onPress={() => void handleSave()} disabled={isSaving} accessibilityRole="button" style={{ marginTop: 32, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: o.ink, opacity: isSaving ? 0.5 : 1 }} pressedStyle={{ opacity: 0.8 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: o.onInk }}>{isSaving ? "Saving…" : "Save settings"}</Text>
            </Tap>
          ) : (
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
          )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </OrbitPage>
  );
}
