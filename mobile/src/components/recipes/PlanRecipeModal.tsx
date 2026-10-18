import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";

import { addDays } from "@/src/components/calendar/calendarUtils";
import { entryName } from "@/src/components/calendar/mealFood";
import { createMealPlanEntry, getMealPlanRange, type MealPlanEntry, type MealSlot } from "@/src/services/mealPlanApi";
import { loadSettings, type AppSettings } from "@/src/services/settingsService";
import { computeDayNutrition, parseLocalDate, SLOTS, todayStr } from "@/src/utils/mealPlan";

type Hover = { hovered?: boolean };

const LABEL_WIDTH = 92;
const DAYS = 7;

// A recipe put on a day straight from its page or card: the coming week as
// a grid — days across, meals down, with what's planned there already, and
// each day's calories and macros now and with this recipe added — and a
// click on a meal places it. It's planned as any meal added from the
// planner is; which pantry piece it uses, if there's a choice, is left to
// the planner (and can be changed there).
type Macros = { calories?: number | null; protein?: number | null; carbs?: number | null; fats?: number | null };

export function PlanRecipeModal({ recipeId, recipeName, nutrition, visible, onClose, onPlanned }: { recipeId: string; recipeName: string; nutrition?: Macros | null; visible: boolean; onClose: () => void; onPlanned?: (date: string, slot: MealSlot) => void }) {
  const today = todayStr();
  const { width } = useWindowDimensions();
  const [start, setStart] = useState(today);
  const [servings, setServings] = useState(1);
  const [entries, setEntries] = useState<MealPlanEntry[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    if (visible) loadSettings().then(setSettings).catch(() => {});
  }, [visible]);

  // (Fresh each time it opens.)
  useEffect(() => {
    if (!visible) return;
    setStart(todayStr());
    setServings(1);
  }, [visible]);

  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  useEffect(() => {
    if (!visible) return;
    setEntries(null);
    getMealPlanRange(start, addDays(start, DAYS - 1))
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [visible, start]);

  async function place(date: string, slot: MealSlot) {
    if (saving) return;
    try {
      setSaving(`${date}|${slot}`);
      await createMealPlanEntry({ date, slot, status: "planned", recipe: recipeId, recipeServings: servings });
      onPlanned?.(date, slot);
      onClose();
    } catch (err) {
      Alert.alert("Couldn't plan it", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(null);
    }
  }

  // A day's totals so far (eaten and planned), and what this recipe adds.
  const add = { calories: (nutrition?.calories ?? 0) * servings, protein: (nutrition?.protein ?? 0) * servings, carbs: (nutrition?.carbs ?? 0) * servings, fats: (nutrition?.fats ?? 0) * servings };
  const dayTotals = (d: string) => {
    const n = computeDayNutrition((entries ?? []).filter((e) => e.date === d), settings?.unitConversions ?? []);
    return { calories: n.calories ?? 0, protein: n.protein ?? 0, carbs: n.carbs ?? 0, fats: n.fats ?? 0 };
  };
  const goal = settings?.dailyCalorieLimit ?? null;
  const r = (n: number) => Math.round(n).toLocaleString();

  // Wide enough for the week across; on a phone it scrolls sideways.
  const cardWidth = Math.min(width - 32, 1040);
  const column = Math.max(124, (cardWidth - 40 - LABEL_WIDTH) / DAYS);
  const first = parseLocalDate(days[0]);
  const last = parseLocalDate(days[DAYS - 1]);
  const range = `${first.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${last.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="rounded-3xl bg-white py-5" style={{ width: cardWidth, maxHeight: "92%" }}>
          {/* Header: what, how much, which week */}
          <View className="flex-row flex-wrap items-center gap-3 px-5 pb-3">
            <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 180 }}>
              <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">Plan · pick a meal</Text>
              {/* (What one plate adds, at the servings chosen.) */}
              <Text className="mt-0.5 text-lg font-bold text-slate-950" numberOfLines={1}>
                {recipeName}
              </Text>
              {nutrition?.calories != null && (
                <Text className="mt-0.5 text-xs text-slate-500">
                  Adds <Text className="font-semibold text-blue-600">{r(add.calories)} kcal</Text> · P {r(add.protein)} g · C {r(add.carbs)} g · F {r(add.fats)} g
                </Text>
              )}
            </View>
            <View className="flex-row items-center">
              <Text className="mr-2 text-xs font-semibold text-slate-500">Servings</Text>
              <Pressable hitSlop={8} disabled={servings <= 1} onPress={() => setServings((n) => Math.max(1, n - 1))} className="h-7 w-7 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200">
                <Ionicons name="remove" size={14} color={servings <= 1 ? "#CBD5E1" : "#475569"} />
              </Pressable>
              <Text className="mx-2 text-sm font-semibold text-slate-800">{servings}</Text>
              <Pressable hitSlop={8} onPress={() => setServings((n) => n + 1)} className="h-7 w-7 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200">
                <Ionicons name="add" size={14} color="#475569" />
              </Pressable>
            </View>
            <View className="flex-row items-center">
              <Pressable hitSlop={8} disabled={start <= today} onPress={() => setStart((s) => (addDays(s, -DAYS) < today ? today : addDays(s, -DAYS)))} accessibilityLabel="Earlier week" className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100">
                <Ionicons name="chevron-back" size={18} color={start <= today ? "#CBD5E1" : "#334155"} />
              </Pressable>
              <Text className="mx-1 text-sm font-semibold text-slate-700">{range}</Text>
              <Pressable hitSlop={8} onPress={() => setStart((s) => addDays(s, DAYS))} accessibilityLabel="Next week" className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100">
                <Ionicons name="chevron-forward" size={18} color="#334155" />
              </Pressable>
            </View>
            <Pressable hitSlop={10} onPress={onClose} accessibilityLabel="Close" className="h-8 w-8 items-center justify-center rounded-full active:bg-slate-100">
              <Ionicons name="close" size={20} color="#64748B" />
            </Pressable>
          </View>

          {/* The week */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
            <View className="overflow-hidden rounded-2xl border border-slate-200">
              <View className="flex-row border-b border-slate-200 bg-slate-50">
                <View style={{ width: LABEL_WIDTH }} />
                {days.map((d) => {
                  const day = parseLocalDate(d);
                  const now = dayTotals(d);
                  const after = now.calories + add.calories;
                  const over = goal != null && after > goal;
                  return (
                    <View key={d} style={{ width: column }} className="border-l border-slate-200 px-2 py-2">
                      <Text className={`text-xs font-semibold ${d === today ? "text-blue-600" : "text-slate-500"}`}>
                        {d === today ? "Today" : day.toLocaleDateString(undefined, { weekday: "short" })} <Text className={`text-base font-bold ${d === today ? "text-blue-600" : "text-slate-900"}`}>{day.getDate()}</Text>
                      </Text>
                      {entries !== null && (
                        <>
                          {/* So far, against the goal */}
                          <Text className="mt-1 text-[11px] text-slate-500" numberOfLines={1}>
                            <Text className="font-semibold text-slate-800">{r(now.calories)}</Text>
                            {goal != null ? ` / ${r(goal)}` : ""} kcal
                          </Text>
                          <Text className="text-[10px] text-slate-400" numberOfLines={1}>
                            P {r(now.protein)} · C {r(now.carbs)} · F {r(now.fats)}
                          </Text>
                          {/* With this recipe */}
                          {nutrition?.calories != null && (
                            <View className="mt-1 rounded-md bg-blue-50 px-1.5 py-1">
                              <Text className="text-[9px] font-bold uppercase tracking-wide text-blue-500">New total</Text>
                              <Text className={`text-[11px] ${over ? "text-red-600" : "text-blue-700"}`} numberOfLines={1}>
                                <Text className="font-bold">{r(after)}</Text>
                                {goal != null ? ` / ${r(goal)}` : ""} kcal
                              </Text>
                              <Text className="text-[10px] text-blue-600" numberOfLines={1}>
                                P {r(now.protein + add.protein)} · C {r(now.carbs + add.carbs)} · F {r(now.fats + add.fats)}
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
              {SLOTS.map((slot, row) => (
                <View key={slot.id} className={`flex-row ${row < SLOTS.length - 1 ? "border-b border-slate-200" : ""}`}>
                  <View style={{ width: LABEL_WIDTH }} className="justify-center px-3 py-2">
                    <Ionicons name={slot.icon} size={15} color={slot.iconColor} />
                    <Text className="mt-0.5 text-xs font-bold text-slate-700">{slot.label}</Text>
                  </View>
                  {days.map((d) => {
                    const here = (entries ?? []).filter((e) => e.date === d && e.slot === slot.id);
                    const key = `${d}|${slot.id}`;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => void place(d, slot.id)}
                        accessibilityLabel={`Plan for ${d}, ${slot.label}`}
                        style={({ hovered }: Hover) => ({ width: column, minHeight: 92, padding: 6, borderLeftWidth: 1, borderLeftColor: "#E2E8F0", backgroundColor: hovered || saving === key ? "#EFF6FF" : "transparent" })}
                      >
                        {({ hovered }: Hover) => (
                          <>
                            {here.slice(0, 2).map((e) => (
                              <Text key={e._id} numberOfLines={1} className={`mb-1 rounded-md px-1.5 py-0.5 text-[11px] ${e.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                                {entryName(e)}
                              </Text>
                            ))}
                            {here.length > 2 && <Text className="text-[10px] text-slate-400">+{here.length - 2} more</Text>}
                            <View className="mt-auto flex-row items-center justify-center rounded-lg py-1" style={{ opacity: hovered || saving === key || !here.length ? 1 : 0.55 }}>
                              {saving === key ? (
                                <ActivityIndicator size="small" color="#2563EB" />
                              ) : (
                                <>
                                  <Ionicons name="add" size={13} color={hovered ? "#2563EB" : "#94A3B8"} />
                                  <Text className={`ml-0.5 text-[11px] font-semibold ${hovered ? "text-blue-600" : "text-slate-400"}`}>Place here</Text>
                                </>
                              )}
                            </View>
                          </>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          {entries === null && <Text className="mt-2 px-5 text-xs text-slate-400">Loading what&apos;s planned…</Text>}
        </View>
      </View>
    </Modal>
  );
}
