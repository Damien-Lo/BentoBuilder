import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
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

import { SettingsNumericInput } from "@/src/components/forms";
import { useScrollFocusSection } from "@/src/hooks/useScrollFocusSection";
import { getMealPlanForDate, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from "@/src/services/settingsService";
import { CORE_NUTRITION_FIELDS, NUTRITION_FIELD_META, type NutritionField } from "@/src/types/nutrition";
import {
  computeDayNutrition,
  friendlyDayLabel,
  parseLocalDate,
  pct,
  toDateStr,
  todayStr,
} from "@/src/utils/mealPlan";
import { getEffectiveNutrientGoal, getSetNutrientGoal, withNutrientGoal } from "@/src/utils/nutritionGoals";

// Nutrition-label order, same as MyFitnessPal's Nutrients tab — sub-nutrients
// indented under their parent (fiber/sugar under carbs, the fat breakdown
// under fat).
const ROWS: { field: NutritionField; indent?: boolean }[] = [
  { field: "calories" },
  { field: "protein" },
  { field: "carbs" },
  { field: "fiber", indent: true },
  { field: "sugar", indent: true },
  { field: "fats" },
  { field: "saturatedFat", indent: true },
  { field: "polyunsaturatedFat", indent: true },
  { field: "monounsaturatedFat", indent: true },
  { field: "transFat", indent: true },
  { field: "cholesterol" },
  { field: "sodium" },
  { field: "potassium" },
  { field: "vitaminA" },
  { field: "vitaminC" },
  { field: "calcium" },
  { field: "iron" },
];

function shiftDate(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

// Vitamins/minerals (the fields with a dailyValue) display as %DV; the
// rest in their own unit.
function toDisplay(field: NutritionField, value: number): number {
  const dv = NUTRITION_FIELD_META[field].dailyValue;
  return dv ? (value / dv) * 100 : value;
}

function fromDisplay(field: NutritionField, value: number): number {
  const dv = NUTRITION_FIELD_META[field].dailyValue;
  return dv ? (value * dv) / 100 : value;
}

function formatValue(field: NutritionField, value: number): string {
  const meta = NUTRITION_FIELD_META[field];
  const shown = toDisplay(field, value);
  const decimals = meta.dailyValue ? 0 : meta.decimals;
  const text = shown.toLocaleString(undefined, { maximumFractionDigits: decimals });
  return meta.dailyValue ? `${text}%` : text;
}

function displayUnit(field: NutritionField): string {
  const meta = NUTRITION_FIELD_META[field];
  return meta.dailyValue ? "% DV" : meta.unit;
}

export default function NutrientsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isDayLoading, setIsDayLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [date, setDate] = useState(todayStr);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  // Goals being edited — null when not in edit mode.
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const scrollAnchorRef = useRef<View>(null);

  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsDayLoading(true);
    getMealPlanForDate(date)
      .then(loaded => { if (!cancelled) setEntries(loaded); })
      .catch(() => { if (!cancelled) setEntries([]); })
      .finally(() => { if (!cancelled) setIsDayLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  // Only logged (confirmed) entries count toward the day — same as the
  // Nutrition tab's "eaten" figures; planned ones haven't happened yet.
  const confirmedEntries = useMemo(() => entries.filter(e => e.status === "confirmed"), [entries]);
  const plannedCount = entries.length - confirmedEntries.length;

  const totals = useMemo(
    () => computeDayNutrition(confirmedEntries, settings.unitConversions),
    [confirmedEntries, settings.unitConversions],
  );

  // How many of the day's logged items actually had data for each extended
  // nutrient — most catalog entries have none yet, so a total built from
  // 1 of 5 items shouldn't read as the whole day's intake.
  const coverage = useMemo(() => {
    const perEntry = confirmedEntries.map(e => computeDayNutrition([e], settings.unitConversions));
    const counts: Partial<Record<NutritionField, number>> = {};
    for (const { field } of ROWS) {
      counts[field] = perEntry.filter(n => n[field] != null).length;
    }
    return counts;
  }, [confirmedEntries, settings.unitConversions]);

  async function handleSave() {
    if (!draft) return;
    try {
      setIsSaving(true);
      await saveSettings({
        dailyCalorieLimit: draft.dailyCalorieLimit,
        dailyProteinLimit: draft.dailyProteinLimit,
        dailyCarbsLimit: draft.dailyCarbsLimit,
        dailyFatsLimit: draft.dailyFatsLimit,
        dailyFiberLimit: draft.dailyFiberLimit,
        dailySodiumLimit: draft.dailySodiumLimit,
        extendedNutrientGoals: draft.extendedNutrientGoals,
      });
      setSettings(draft);
      setDraft(null);
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

  const isEditing = draft != null;

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
          <View className="ml-1 flex-1">
            <Text className="text-2xl font-bold text-slate-950">All Nutrients</Text>
            <Text className="mt-0.5 text-sm text-slate-500">
              {isEditing ? "Editing daily goals" : friendlyDayLabel(date)}
            </Text>
          </View>
          <Pressable
            className="rounded-full px-3 py-2 active:bg-slate-100"
            onPress={() => setDraft(isEditing ? null : settings)}
            disabled={isSaving}
          >
            <Text className="text-base font-semibold text-blue-600">
              {isEditing ? "Cancel" : "Edit goals"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View ref={scrollAnchorRef} collapsable={false} />

          {isEditing ? (
            <>
              <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {ROWS.map(({ field, indent }) => (
                  <GoalEditRow
                    key={field}
                    field={field}
                    indent={indent}
                    goal={getSetNutrientGoal(draft, field)}
                    onChange={goal => setDraft(prev => prev && withNutrientGoal(prev, field, goal))}
                    scrollRef={scrollRef}
                    anchorRef={scrollAnchorRef}
                  />
                ))}
              </View>
              <Text className="mt-3 px-1 text-xs leading-5 text-slate-400">
                Vitamins and minerals are set as a percentage of the standard Daily Value — leave
                one blank to use 100%. Leave any other goal blank to not track against one.
              </Text>
              <Pressable
                onPress={() => void handleSave()}
                disabled={isSaving}
                className={`mt-6 items-center rounded-3xl py-4 ${
                  isSaving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"
                }`}
              >
                <Text className="text-base font-bold text-white">
                  {isSaving ? "Saving…" : "Save goals"}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* Day picker */}
              <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white px-2 py-1.5">
                <Pressable
                  className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100"
                  onPress={() => setDate(d => shiftDate(d, -1))}
                >
                  <Ionicons name="chevron-back" size={22} color="#334155" />
                </Pressable>
                <Pressable onPress={() => setDate(todayStr())} className="flex-row items-center">
                  <Text className="text-base font-semibold text-slate-900">{friendlyDayLabel(date)}</Text>
                  {isDayLoading && <ActivityIndicator size="small" color="#94A3B8" style={{ marginLeft: 8 }} />}
                </Pressable>
                <Pressable
                  className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100"
                  onPress={() => setDate(d => shiftDate(d, 1))}
                >
                  <Ionicons name="chevron-forward" size={22} color="#334155" />
                </Pressable>
              </View>

              <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {/* Column headers */}
                <View className="flex-row items-center border-b border-slate-100 px-4 py-2.5">
                  <View className="flex-1" />
                  <Text className="w-16 text-right text-xs font-bold uppercase tracking-wider text-slate-400">Total</Text>
                  <Text className="w-16 text-right text-xs font-bold uppercase tracking-wider text-slate-400">Goal</Text>
                  <Text className="w-16 text-right text-xs font-bold uppercase tracking-wider text-slate-400">Left</Text>
                </View>

                {ROWS.map(({ field, indent }, i) => (
                  <NutrientRow
                    key={field}
                    field={field}
                    indent={indent}
                    total={totals[field] ?? null}
                    goal={getEffectiveNutrientGoal(settings, field)}
                    covered={coverage[field] ?? 0}
                    entryCount={confirmedEntries.length}
                    isLast={i === ROWS.length - 1}
                  />
                ))}
              </View>

              <Text className="mt-3 px-1 text-xs leading-5 text-slate-400">
                Totals count only meals you&apos;ve logged as eaten
                {plannedCount > 0
                  ? ` — ${plannedCount} planned item${plannedCount === 1 ? "" : "s"} for this day ${plannedCount === 1 ? "isn't" : "aren't"} included`
                  : ""}
                . Nutrients beyond the main six only add up from foods that have that data on file.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function NutrientRow({
  field,
  indent,
  total,
  goal,
  covered,
  entryCount,
  isLast,
}: {
  field: NutritionField;
  indent?: boolean;
  total: number | null;
  goal: number | null;
  covered: number;
  entryCount: number;
  isLast: boolean;
}) {
  const meta = NUTRITION_FIELD_META[field];
  const left = total != null && goal != null ? goal - total : null;
  const isOver = left != null && left < 0;
  // Only the extended nutrients can be missing from some items — the core
  // six are always computed (unknown counted as 0), matching everywhere
  // else in the app.
  const showCoverage = !(CORE_NUTRITION_FIELDS as readonly string[]).includes(field)
    && entryCount > 0
    && covered < entryCount;

  return (
    <View className={`px-4 py-3 ${isLast ? "" : "border-b border-slate-100"}`}>
      <View className="flex-row items-center">
        <View className={`flex-1 pr-2 ${indent ? "pl-4" : ""}`}>
          <Text className={indent ? "text-sm text-slate-600" : "text-base font-medium text-slate-800"}>
            {meta.label}
            <Text className="text-xs font-normal text-slate-400">{`  ${displayUnit(field)}`}</Text>
          </Text>
          {showCoverage && (
            <Text className="mt-0.5 text-xs text-slate-400">
              {covered === 0 ? "No data from logged items" : `From ${covered} of ${entryCount} logged items`}
            </Text>
          )}
        </View>
        <Text className="w-16 text-right text-base font-semibold text-slate-900">
          {total != null ? formatValue(field, total) : "–"}
        </Text>
        <Text className="w-16 text-right text-base text-slate-500">
          {goal != null ? formatValue(field, goal) : "–"}
        </Text>
        <Text className={`w-16 text-right text-base font-semibold ${isOver ? "text-red-500" : "text-slate-700"}`}>
          {left != null ? formatValue(field, left) : "–"}
        </Text>
      </View>
      {goal != null && total != null && (
        <View className={`mt-2 h-1 overflow-hidden rounded-full bg-slate-100 ${indent ? "ml-4" : ""}`}>
          <View
            className={isOver ? "h-1 bg-red-400" : "h-1 bg-blue-500"}
            style={{ width: `${pct(total, goal) * 100}%` }}
          />
        </View>
      )}
    </View>
  );
}

function GoalEditRow({
  field,
  indent,
  goal,
  onChange,
  scrollRef,
  anchorRef,
}: {
  field: NutritionField;
  indent?: boolean;
  goal: number | null;
  onChange: (goal: number | null) => void;
  scrollRef: RefObject<ScrollView | null>;
  anchorRef: RefObject<View | null>;
}) {
  const section = useScrollFocusSection(scrollRef, anchorRef);
  const meta = NUTRITION_FIELD_META[field];
  const shown = goal != null ? Math.round(toDisplay(field, goal) * 10) / 10 : null;

  return (
    <View {...section.wrapperProps}>
      <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-3">
        <Text className={`flex-1 pr-3 ${indent ? "pl-4 text-sm text-slate-600" : "text-base text-slate-700"}`}>
          {meta.label}
        </Text>
        <SettingsNumericInput
          value={shown}
          onChange={v => onChange(v != null ? fromDisplay(field, v) : null)}
          placeholder={meta.dailyValue ? "100" : "—"}
          unit={meta.dailyValue ? "%" : meta.unit}
          onFocus={section.trigger}
        />
      </View>
    </View>
  );
}
