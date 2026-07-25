import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { getMeals, type Meal, type MealRecipeRef } from "@/src/services/mealApi";
import {
  createMealPlanEntry,
  deleteMealPlanEntry,
  getMealPlanForDate,
  type MealPlanEntry,
  type MealSlot,
} from "@/src/services/mealPlanApi";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import { friendlyDayLabel, getMealKcal, parseLocalDate, SLOT_MAP, SLOTS, todayStr, toDateStr } from "@/src/utils/mealPlan";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Nutrition helper ──────────────────────────────────────────────────────────

interface DayNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  sodium: number;
}

function computeDayNutrition(entries: MealPlanEntry[]): DayNutrition {
  let calories = 0, protein = 0, carbs = 0, fats = 0, fiber = 0, sodium = 0;
  for (const entry of entries) {
    for (const course of entry.meal?.courses ?? []) {
      const recipe = course.recipe;
      if (!recipe || typeof recipe === "string") continue;
      const n = (recipe as MealRecipeRef).nutrition;
      if (!n) continue;
      const s = course.servings ?? 1;
      if (n.calories) calories += n.calories * s;
      if (n.protein)  protein  += n.protein  * s;
      if (n.carbs)    carbs    += n.carbs    * s;
      if (n.fats)     fats     += n.fats     * s;
      if (n.fiber)    fiber    += n.fiber    * s;
      if (n.sodium)   sodium   += n.sodium   * s;
    }
  }
  return {
    calories: Math.round(calories),
    protein:  Math.round(protein  * 10) / 10,
    carbs:    Math.round(carbs    * 10) / 10,
    fats:     Math.round(fats     * 10) / 10,
    fiber:    Math.round(fiber    * 10) / 10,
    sodium:   Math.round(sodium),
  };
}

function pct(value: number, limit: number | null): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(value / limit, 1);
}

// ── Date strip config ─────────────────────────────────────────────────────────

const DAYS_BEFORE = 14;
const DAYS_AFTER  = 45;
const TOTAL_DAYS  = DAYS_BEFORE + 1 + DAYS_AFTER; // 60
const TODAY_INDEX = DAYS_BEFORE;
const CELL_WIDTH  = 52;
const CELL_GAP    = 8;
const CELL_TOTAL  = CELL_WIDTH + CELL_GAP;

function buildDates(): string[] {
  const base = new Date();
  const result: string[] = [];
  for (let i = -DAYS_BEFORE; i <= DAYS_AFTER; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    result.push(toDateStr(d));
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const dates = useMemo(buildDates, []);
  const today = todayStr();

  const [selectedDate, setSelectedDate] = useState(today);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Add-to-plan overlay (plain local state — no navigation involved)
  const [showAdd, setShowAdd] = useState(false);
  const [addSlot, setAddSlot] = useState<MealSlot>("breakfast");
  const [mealSearch, setMealSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const dateStripRef = useRef<FlatList<string>>(null);

  // Load available meals for the add overlay, once on mount
  useEffect(() => {
    getMeals().then(setAllMeals).catch(() => {});
  }, []);

  // Load plan for the selected date
  const loadEntries = useCallback(() => {
    setIsLoading(true);
    getMealPlanForDate(selectedDate)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setIsLoading(false));
  }, [selectedDate]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    loadSettings().then(setAppSettings).catch(() => {});
  }, []);

  // Scroll date strip to today on mount
  useEffect(() => {
    setTimeout(() => {
      dateStripRef.current?.scrollToIndex({ index: TODAY_INDEX, animated: false, viewPosition: 0.5 });
    }, 150);
  }, []);

  // Derived
  const selectedD = parseLocalDate(selectedDate);
  const selectedMonthLabel = `${MONTH_NAMES[selectedD.getMonth()]} ${selectedD.getFullYear()}`;
  const isToday = selectedDate === today;
  const nutrition = useMemo(() => computeDayNutrition(entries), [entries]);

  const entriesBySlot = useMemo(() => {
    const map = new Map<MealSlot, MealPlanEntry[]>();
    for (const slot of SLOTS) map.set(slot.id, []);
    for (const e of entries) {
      map.get(e.slot)?.push(e);
    }
    return map;
  }, [entries]);

  const filteredMeals = useMemo(() => {
    const q = mealSearch.trim().toLowerCase();
    if (!q) return allMeals;
    return allMeals.filter(m => m.name.toLowerCase().includes(q));
  }, [allMeals, mealSearch]);

  function openAdd(slot: MealSlot) {
    setAddSlot(slot);
    setMealSearch("");
    setShowAdd(true);
  }

  async function handleAddEntry(meal: Meal) {
    if (saving) return;
    try {
      setSaving(true);
      const entry = await createMealPlanEntry({ date: selectedDate, slot: addSlot, meal: meal._id });
      setEntries(prev => [...prev, entry]);
      setShowAdd(false);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Could not add meal.");
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteEntry(id: string) {
    Alert.alert("Remove meal", "Remove this meal from the plan?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void deleteMealPlanEntry(id)
            .then(() => setEntries(prev => prev.filter(e => e._id !== id)))
            .catch(() => Alert.alert("Error", "Could not remove meal."));
        },
      },
    ]);
  }

  function jumpToToday() {
    setSelectedDate(today);
    dateStripRef.current?.scrollToIndex({ index: TODAY_INDEX, animated: true, viewPosition: 0.5 });
  }

  // ── Render date cell ──
  function renderDateCell({ item: dateStr, index }: { item: string; index: number }) {
    const d = parseLocalDate(dateStr);
    const isSelected = dateStr === selectedDate;
    const isThisToday = dateStr === today;
    return (
      <Pressable
        onPress={() => {
          setSelectedDate(dateStr);
          dateStripRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
        }}
        style={{ width: CELL_WIDTH, marginRight: CELL_GAP }}
        className="items-center"
      >
        <Text className={`mb-1 text-xs font-medium ${isSelected ? "text-blue-600" : "text-slate-400"}`}>
          {DAY_ABBREVS[d.getDay()]}
        </Text>
        <View
          className={`h-10 w-10 items-center justify-center rounded-full ${
            isSelected ? "bg-blue-600" : isThisToday ? "bg-slate-100" : ""
          }`}
        >
          <Text
            className={`text-base font-bold ${
              isSelected ? "text-white" : isThisToday ? "text-blue-600" : "text-slate-700"
            }`}
          >
            {d.getDate()}
          </Text>
        </View>
        {isSelected && entries.length > 0 && (
          <View className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-600" />
        )}
      </Pressable>
    );
  }

  // ── Render entry card ──
  function renderEntry(entry: MealPlanEntry) {
    const kcal = getMealKcal(entry.meal);
    const title = entry.meal.name;
    const courseCount = entry.meal.courses?.length ?? 0;
    const subtitle = `${courseCount} ${courseCount === 1 ? "course" : "courses"}`;
    return (
      <ReanimatedSwipeable
        key={entry._id}
        friction={2}
        rightThreshold={40}
        renderLeftActions={() => (
          <Pressable
            className="mb-2 w-20 items-center justify-center rounded-2xl bg-red-500 active:bg-red-600"
            onPress={() => handleDeleteEntry(entry._id)}
          >
            <Ionicons name="trash-outline" size={20} color="white" />
          </Pressable>
        )}
      >
        <View className="mb-2 flex-row items-center rounded-2xl bg-white px-4 py-3 shadow-sm">
          <View className="flex-1">
            <Text className="font-semibold text-slate-900" numberOfLines={1}>{title}</Text>
            <Text className="mt-0.5 text-xs text-slate-400">{subtitle}</Text>
          </View>
          {kcal != null && (
            <Text className="text-sm font-semibold text-slate-500">{kcal} kcal</Text>
          )}
        </View>
      </ReanimatedSwipeable>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      {/* ── Top strip (non-scrolling) ── */}
      <View className="bg-white pb-3 shadow-sm">
        {/* Month header */}
        <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
          <Text className="text-lg font-bold text-slate-900">{selectedMonthLabel}</Text>
          {!isToday && (
            <Pressable
              onPress={jumpToToday}
              className="rounded-xl bg-blue-100 px-3 py-1.5 active:bg-blue-200"
            >
              <Text className="text-xs font-bold text-blue-700">Today</Text>
            </Pressable>
          )}
        </View>

        {/* Date strip */}
        <FlatList
          ref={dateStripRef}
          data={dates}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={d => d}
          renderItem={renderDateCell}
          getItemLayout={(_, index) => ({
            length: CELL_TOTAL,
            offset: CELL_TOTAL * index,
            index,
          })}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              dateStripRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
            }, 200);
          }}
        />
      </View>

      {/* ── Main scrollable content ── */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Day label */}
        <Text className="mb-5 text-2xl font-bold text-slate-900">
          {friendlyDayLabel(selectedDate)}
        </Text>

        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <>
            {/* Slots */}
            {SLOTS.map(slot => {
              const slotEntries = entriesBySlot.get(slot.id) ?? [];
              return (
                <View key={slot.id} className="mb-5">
                  {/* Slot header */}
                  <View className="mb-3 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <Ionicons name={slot.icon} size={18} color={slot.iconColor} />
                      <Text className="text-sm font-bold text-slate-700">{slot.label}</Text>
                      <Text className="text-xs text-slate-400">{slot.time}</Text>
                    </View>
                    <Pressable
                      onPress={() => openAdd(slot.id)}
                      className="flex-row items-center rounded-xl bg-slate-100 px-3 py-1.5 active:bg-slate-200"
                    >
                      <Ionicons name="add" size={14} color="#2563EB" />
                      <Text className="ml-1 text-xs font-semibold text-blue-600">Add</Text>
                    </Pressable>
                  </View>

                  {/* Entries */}
                  {slotEntries.length > 0 ? (
                    slotEntries.map(renderEntry)
                  ) : (
                    <Pressable
                      onPress={() => openAdd(slot.id)}
                      className="items-center rounded-2xl border border-dashed border-slate-200 py-5 active:bg-slate-50"
                    >
                      <Text className="text-sm text-slate-400">No {slot.label.toLowerCase()} planned</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}

            {/* Daily nutrition summary */}
            {(() => {
              const s = appSettings;
              const calPct = pct(nutrition.calories, s?.dailyCalorieLimit ?? null);
              const macros = [
                { label: "Protein", value: nutrition.protein, unit: "g",  limit: s?.dailyProteinLimit ?? null, bar: "#3B82F6" },
                { label: "Carbs",   value: nutrition.carbs,   unit: "g",  limit: s?.dailyCarbsLimit   ?? null, bar: "#F59E0B" },
                { label: "Fats",    value: nutrition.fats,    unit: "g",  limit: s?.dailyFatsLimit    ?? null, bar: "#F43F5E" },
                { label: "Fiber",   value: nutrition.fiber,   unit: "g",  limit: s?.dailyFiberLimit   ?? null, bar: "#10B981" },
              ] as const;
              const hasSodiumData = nutrition.sodium > 0 || (s?.dailySodiumLimit ?? null) != null;

              return (
                <View className="mt-2 overflow-hidden rounded-3xl bg-white shadow-sm">
                  {/* Calories row */}
                  <View className="border-b border-slate-100 px-5 pb-4 pt-4">
                    <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      Daily nutrition
                    </Text>
                    <View className="mt-2 flex-row items-end justify-between">
                      <View className="flex-row items-end">
                        <Text className="text-4xl font-bold text-slate-900">
                          {nutrition.calories}
                        </Text>
                        <Text className="mb-1 ml-1.5 text-base text-slate-400">kcal</Text>
                      </View>
                      {s?.dailyCalorieLimit != null && (
                        <Text className="mb-1 text-sm text-slate-400">
                          / {s.dailyCalorieLimit} kcal
                        </Text>
                      )}
                    </View>
                    {s?.dailyCalorieLimit != null && (
                      <View className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <View
                          className={`h-2 rounded-full ${calPct >= 1 ? "bg-red-400" : "bg-blue-500"}`}
                          style={{ width: `${calPct * 100}%` }}
                        />
                      </View>
                    )}
                  </View>

                  {/* Macro columns */}
                  <View className={`flex-row px-4 pt-4 ${hasSodiumData ? "border-b border-slate-100 pb-4" : "pb-4"}`}>
                    {macros.map(({ label, value, unit, limit, bar }) => {
                      const f = pct(value, limit);
                      return (
                        <View key={label} className="flex-1 items-center px-1">
                          <Text className="text-sm font-bold text-slate-800">
                            {value}{unit}
                          </Text>
                          <Text className="mt-0.5 text-xs text-slate-400">{label}</Text>
                          {limit != null && (
                            <View className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <View
                                style={{
                                  width: `${f * 100}%`,
                                  height: 6,
                                  borderRadius: 9999,
                                  backgroundColor: f >= 1 ? "#F87171" : bar,
                                }}
                              />
                            </View>
                          )}
                          {limit != null && (
                            <Text className="mt-0.5 text-[10px] text-slate-300">
                              /{limit}{unit}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* Sodium row */}
                  {hasSodiumData && (
                    <View className="px-5 pb-4 pt-3">
                      {(() => {
                        const f = pct(nutrition.sodium, s?.dailySodiumLimit ?? null);
                        return (
                          <>
                            <View className="flex-row items-center justify-between">
                              <Text className="text-xs font-semibold text-slate-500">Sodium</Text>
                              <Text className="text-xs text-slate-400">
                                {nutrition.sodium} mg
                                {s?.dailySodiumLimit != null && ` / ${s.dailySodiumLimit} mg`}
                              </Text>
                            </View>
                            {s?.dailySodiumLimit != null && (
                              <View className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <View
                                  style={{
                                    width: `${f * 100}%`,
                                    height: 6,
                                    borderRadius: 9999,
                                    backgroundColor: f >= 1 ? "#F87171" : "#A855F7",
                                  }}
                                />
                              </View>
                            )}
                          </>
                        );
                      })()}
                    </View>
                  )}
                </View>
              );
            })()}
          </>
        )}
      </ScrollView>

      {/* ── Add-to-plan overlay ── plain absolutely-positioned View, no
          RN Modal and no navigation — sidesteps the navigation-context
          crash entirely by never leaving this already-mounted screen. */}
      {showAdd && (
        <View className="absolute inset-0 bg-slate-50">
          {/* Header */}
          <View className="flex-row items-center border-b border-slate-200 bg-white px-4 py-3">
            <Text className="flex-1 text-lg font-bold text-slate-950">Add to plan</Text>
            <Pressable onPress={() => setShowAdd(false)}>
              <Text className="font-semibold text-blue-600">Cancel</Text>
            </Pressable>
          </View>

          {/* Date + slot row */}
          <View className="bg-white px-4 pb-4 pt-3">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {friendlyDayLabel(selectedDate)}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {SLOTS.map(slot => (
                  <Pressable
                    key={slot.id}
                    onPress={() => setAddSlot(slot.id)}
                    className={`flex-row items-center rounded-full px-4 py-2 ${
                      addSlot === slot.id ? "bg-blue-600" : "bg-slate-100"
                    }`}
                  >
                    <Ionicons
                      name={slot.icon}
                      size={14}
                      color={addSlot === slot.id ? "white" : slot.iconColor}
                    />
                    <Text
                      className={`ml-1.5 text-sm font-semibold ${
                        addSlot === slot.id ? "text-white" : "text-slate-700"
                      }`}
                    >
                      {slot.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Search */}
          <View className="border-b border-slate-100 bg-white px-4 pb-3">
            <View className="h-11 flex-row items-center rounded-2xl bg-slate-100 px-4">
              <Ionicons name="search-outline" size={18} color="#64748B" />
              <TextInput
                value={mealSearch}
                onChangeText={setMealSearch}
                placeholder="Search meals…"
                placeholderTextColor="#94A3B8"
                className="ml-3 flex-1 text-base text-slate-900"
              />
              {mealSearch.length > 0 && (
                <Pressable onPress={() => setMealSearch("")}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </Pressable>
              )}
            </View>
          </View>

          {/* List */}
          <FlatList
            data={filteredMeals}
            keyExtractor={m => m._id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
            renderItem={({ item: meal }) => {
              const kcal = getMealKcal(meal);
              const slotCfg = SLOT_MAP[addSlot];
              return (
                <Pressable
                  className="mb-2 flex-row items-center rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50"
                  disabled={saving}
                  onPress={() => void handleAddEntry(meal)}
                >
                  <View className={`h-11 w-11 items-center justify-center rounded-xl ${slotCfg.chipBg}`}>
                    <Ionicons name={slotCfg.icon} size={20} color={slotCfg.iconColor} />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="font-semibold text-slate-900">{meal.name}</Text>
                    <Text className="mt-0.5 text-sm text-slate-400">
                      {meal.courses?.length ?? 0} {(meal.courses?.length ?? 0) === 1 ? "course" : "courses"}
                      {(meal.tags ?? []).length > 0 && ` · ${meal.tags!.map(t => t.name).join(", ")}`}
                    </Text>
                  </View>
                  {kcal != null && (
                    <Text className="mr-2 text-sm font-semibold text-slate-500">{kcal} kcal</Text>
                  )}
                  <Ionicons name="add-circle-outline" size={22} color="#2563EB" />
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View className="items-center py-16">
                <Ionicons name="restaurant-outline" size={42} color="#94A3B8" />
                <Text className="mt-4 text-lg font-bold text-slate-900">No meals found</Text>
                <Text className="mt-2 text-center text-slate-500">
                  {mealSearch ? "Try a different search." : "Create meals in the Kitchen tab first."}
                </Text>
              </View>
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}
