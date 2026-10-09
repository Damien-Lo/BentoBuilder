import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TimePickerModal } from "@/src/components/calendar/CalendarSheets";
import { RepeatDaysSheet } from "@/src/components/calendar/RepeatDaysSheet";
import { durationLabel, minutesLabel, WEEKDAYS_FULL, WEEKDAYS_SHORT } from "@/src/components/calendar/calendarUtils";
import {
  getMealTimes,
  MEAL_TYPES,
  saveMealTimes,
  type MealTime,
  type MealTimes,
  type MealType,
} from "@/src/services/calendarApi";
import { loadSettings } from "@/src/services/settingsService";
import {
  getUsualMeals,
  stopUsualMeal,
  updateUsualMeal,
  usualName,
  type UsualMeal,
} from "@/src/services/usualMealApi";
import { SLOT_MAP, todayStr } from "@/src/utils/mealPlan";

// What a meal starts at when a day is first switched on.
const DEFAULT_TIMES: Record<MealType, MealTime> = {
  breakfast: { start: 7 * 60, end: 7 * 60 + 30 },
  lunch: { start: 12 * 60, end: 13 * 60 },
  dinner: { start: 19 * 60, end: 20 * 60 },
  snack: { start: 15 * 60 + 30, end: 15 * 60 + 45 },
};

// The Meals calendar's settings: the regular time of each meal on each day
// of the week. Pick a meal, pick a day, set its start and end. Saving makes
// the repeating meal events follow from today on; earlier days keep the
// times they had.
export default function MealTimesScreen() {
  const router = useRouter();
  const [times, setTimes] = useState<MealTimes | null>(null);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [meal, setMeal] = useState<MealType>("breakfast");
  const [day, setDay] = useState(new Date().getDay());
  const [weekStartDay, setWeekStartDay] = useState(1);
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  // Usual food: saved as it's changed, separately from the times above.
  const [usuals, setUsuals] = useState<UsualMeal[]>([]);
  const [editingDays, setEditingDays] = useState<UsualMeal | null>(null);
  const loadUsuals = () => getUsualMeals().then(setUsuals).catch(() => {});

  useEffect(() => {
    loadSettings().then((s) => setWeekStartDay(s.weekStartDay)).catch(() => {});
    void loadUsuals();
    getMealTimes()
      .then((loaded) => {
        setTimes(loaded);
        setSaved(JSON.stringify(loaded));
      })
      .catch((error) =>
        Alert.alert("Couldn't load", error instanceof Error ? error.message : "Something went wrong.", [
          { text: "OK", onPress: () => router.back() },
        ]),
      );
  }, [router]);

  if (!times) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  const days = Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7);
  const current = times[meal][day];
  const dirty = JSON.stringify(times) !== saved;
  const mealLabel = MEAL_TYPES.find((m) => m.value === meal)!.label;
  const mealUsuals = usuals.filter((u) => u.slot === meal);

  const setDayTime = (target: number[], time: MealTime | null) =>
    setTimes((prev) => prev && { ...prev, [meal]: prev[meal].map((t, d) => (target.includes(d) ? time : t)) });

  function toggleDay() {
    // Switching on starts from another day's time for this meal, if any.
    setDayTime([day], current ? null : times![meal].find(Boolean) ?? DEFAULT_TIMES[meal]);
  }

  function pickTime(target: "start" | "end", minutes: number) {
    if (!current) return;
    if (target === "start") {
      const length = current.end - current.start;
      const start = Math.min(minutes, 1440 - 15);
      setDayTime([day], { start, end: Math.min(1440, start + length) });
    } else {
      const end = minutes === 0 ? 1440 : minutes;
      if (end <= current.start) {
        Alert.alert("Ends too early", "The end has to be after the start.");
        return;
      }
      setDayTime([day], { ...current, end });
    }
  }

  const usualFail = (error: unknown) => {
    Alert.alert("Couldn't save", error instanceof Error ? error.message : "Something went wrong.");
    void loadUsuals();
  };

  function toggleUsual(usual: UsualMeal) {
    setUsuals((prev) => prev.map((u) => (u._id === usual._id ? { ...u, active: !u.active } : u)));
    updateUsualMeal(usual._id, { active: !usual.active }).then(loadUsuals, usualFail);
  }

  function confirmStopUsual(usual: UsualMeal) {
    Alert.alert(
      `Stop having ${usualName(usual)}?`,
      "It's removed from your planner from today on. Anything you've already eaten stays.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Stop", style: "destructive", onPress: () => void stopUsualMeal(usual._id).then(loadUsuals, usualFail) },
      ],
    );
  }

  // "Mon, Tue, Wed" in the week's own order; "Every day" / "Weekdays" when so.
  function daysLabel(weekdays: number[]): string {
    if (weekdays.length === 7) return "Every day";
    if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))) return "Weekdays";
    return days.filter((d) => weekdays.includes(d)).map((d) => WEEKDAYS_SHORT[d]).join(", ");
  }

  async function save() {
    if (!times) return;
    try {
      setSaving(true);
      const result = await saveMealTimes(times, todayStr());
      setTimes(result);
      setSaved(JSON.stringify(result));
      router.back();
    } catch (error) {
      Alert.alert("Couldn't save", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function close() {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert("Discard changes?", "Your meal times haven't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-2.5">
        <Pressable onPress={close} className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100">
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <View className="ml-1 flex-1">
          <Text className="text-lg font-bold text-slate-950">Meal times</Text>
          <Text className="text-xs text-slate-500">When you usually eat, for the Meals calendar</Text>
        </View>
        <Pressable
          onPress={save}
          disabled={!dirty || saving}
          className={`h-10 justify-center rounded-xl px-4 ${dirty && !saving ? "bg-blue-600 active:bg-blue-700" : "bg-slate-200"}`}
        >
          <Text className={`font-semibold ${dirty && !saving ? "text-white" : "text-slate-400"}`}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* Which meal */}
        <View className="flex-row gap-2">
          {MEAL_TYPES.map((m) => {
            const on = meal === m.value;
            const count = times[m.value].filter(Boolean).length;
            return (
              <Pressable
                key={m.value}
                onPress={() => setMeal(m.value)}
                className={`flex-1 items-center rounded-2xl border py-2.5 ${on ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-white active:bg-slate-100"}`}
              >
                <Ionicons name={SLOT_MAP[m.value].icon} size={18} color={on ? "#FFFFFF" : SLOT_MAP[m.value].iconColor} />
                <Text className={`mt-1 text-[13px] font-semibold ${on ? "text-white" : "text-slate-800"}`}>{m.label}</Text>
                <Text className={`text-[11px] ${on ? "text-blue-100" : "text-slate-400"}`}>
                  {count === 0 ? "Off" : count === 7 ? "Every day" : `${count} day${count === 1 ? "" : "s"}`}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Which day */}
        <Text className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-slate-400">Day</Text>
        <View className="flex-row gap-1.5">
          {days.map((d) => {
            const on = day === d;
            const time = times[meal][d];
            return (
              <Pressable
                key={d}
                onPress={() => setDay(d)}
                className={`flex-1 items-center rounded-xl border py-2 ${on ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white active:bg-slate-100"}`}
              >
                <Text className={`text-[13px] font-semibold ${on ? "text-blue-700" : "text-slate-800"}`}>{WEEKDAYS_SHORT[d]}</Text>
                <Text className={`mt-0.5 text-[10px] ${time ? (on ? "text-blue-700" : "text-slate-500") : "text-slate-300"}`}>
                  {time ? minutesLabel(time.start) : "—"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* That meal on that day */}
        <View className="mt-3 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <Pressable onPress={toggleDay} className="flex-row items-center px-4 active:bg-slate-50" style={{ minHeight: 56 }}>
            <Text className="flex-1 text-base font-semibold text-slate-900">
              {mealLabel} on {WEEKDAYS_FULL[day]}
            </Text>
            <View className={`h-7 w-12 justify-center rounded-full px-1 ${current ? "bg-blue-600" : "bg-slate-200"}`}>
              <View className="h-5 w-5 rounded-full bg-white shadow" style={{ transform: [{ translateX: current ? 20 : 0 }] }} />
            </View>
          </Pressable>
          {current ? (
            <>
              <TimeRow label="Starts" value={minutesLabel(current.start)} onPress={() => setPicking("start")} />
              <TimeRow label="Ends" value={minutesLabel(current.end)} onPress={() => setPicking("end")} />
              <View className="border-t border-slate-100 px-4 py-2.5">
                <Text className="text-xs text-slate-500">{durationLabel(current.end - current.start)}</Text>
              </View>
            </>
          ) : (
            <View className="border-t border-slate-100 px-4 py-3">
              <Text className="text-sm text-slate-500">
                No {mealLabel.toLowerCase()} block on {WEEKDAYS_FULL[day]}s.
              </Text>
            </View>
          )}
        </View>

        {/* Reuse this day's setting */}
        <View className="mt-3 flex-row gap-2">
          <CopyButton label="Copy to every day" onPress={() => setDayTime([0, 1, 2, 3, 4, 5, 6], current)} />
          <CopyButton label="Copy to weekdays" onPress={() => setDayTime([1, 2, 3, 4, 5], current)} />
        </View>

        {/* Usual food for this meal */}
        <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">
          Usual {mealLabel.toLowerCase()}
        </Text>
        <View className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
          {mealUsuals.length === 0 ? (
            <Text className="px-4 py-3.5 text-sm leading-5 text-slate-500">
              Nothing yet. To have the same {mealLabel.toLowerCase()} every week, open that meal in the calendar, tap the
              food and choose &quot;Have this every week&quot;.
            </Text>
          ) : (
            mealUsuals.map((usual, index) => (
              <View
                key={usual._id}
                className={`flex-row items-center pl-4 pr-2 ${index > 0 ? "border-t border-slate-100" : ""}`}
                style={{ minHeight: 60 }}
              >
                <Pressable onPress={() => setEditingDays(usual)} className="flex-1 py-2.5 active:opacity-60">
                  <Text className={`text-base font-semibold ${usual.active ? "text-slate-900" : "text-slate-400"}`} numberOfLines={1}>
                    {usualName(usual)}
                  </Text>
                  <Text className="mt-0.5 text-xs text-blue-700">
                    {daysLabel(usual.weekdays)}
                    {usual.active ? "" : " · off"}
                  </Text>
                </Pressable>
                <Pressable onPress={() => toggleUsual(usual)} hitSlop={6} accessibilityLabel={usual.active ? "Switch off" : "Switch on"}>
                  <View className={`h-7 w-12 justify-center rounded-full px-1 ${usual.active ? "bg-blue-600" : "bg-slate-200"}`}>
                    <View className="h-5 w-5 rounded-full bg-white shadow" style={{ transform: [{ translateX: usual.active ? 20 : 0 }] }} />
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => confirmStopUsual(usual)}
                  hitSlop={6}
                  accessibilityLabel={`Stop having ${usualName(usual)}`}
                  className="ml-1 h-10 w-10 items-center justify-center rounded-full active:bg-red-50"
                >
                  <Ionicons name="trash-outline" size={19} color="#DC2626" />
                </Pressable>
              </View>
            ))
          )}
        </View>
        <Text className="mt-2 px-1 text-xs leading-4 text-slate-500">
          Usual food is added to your planner as planned, two weeks ahead. Changes here apply straight away.
        </Text>

        <View className="mt-5 flex-row rounded-2xl bg-blue-50 px-4 py-3">
          <Ionicons name="information-circle-outline" size={18} color="#1D4ED8" style={{ marginTop: 1 }} />
          <Text className="ml-2 flex-1 text-[13px] leading-5 text-blue-900">
            Changes start today. Earlier days keep the times they had, and any single day you&apos;ve edited or skipped in
            the calendar stays as it is.
          </Text>
        </View>
      </ScrollView>

      <RepeatDaysSheet
        visible={!!editingDays}
        title={editingDays ? usualName(editingDays) : ""}
        subtitle="Which days do you usually have this?"
        initialDays={editingDays?.weekdays ?? []}
        weekStartDay={weekStartDay}
        onCancel={() => setEditingDays(null)}
        onConfirm={(weekdays) => {
          const usual = editingDays;
          setEditingDays(null);
          if (usual) updateUsualMeal(usual._id, { weekdays }).then(loadUsuals, usualFail);
        }}
      />

      <TimePickerModal
        visible={picking != null}
        title={picking === "end" ? "Ends" : "Starts"}
        minutes={current ? (picking === "end" ? current.end % 1440 : current.start) : 0}
        onCancel={() => setPicking(null)}
        onConfirm={(value) => {
          const target = picking === "end" ? "end" : "start";
          setPicking(null);
          pickTime(target, value);
        }}
      />
    </SafeAreaView>
  );
}

function TimeRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center border-t border-slate-100 px-4 active:bg-slate-50"
      style={{ minHeight: 54 }}
    >
      <Ionicons name="time-outline" size={20} color="#64748B" />
      <Text className="ml-3 flex-1 text-base text-slate-900">{label}</Text>
      <Text className="text-base font-medium text-blue-700">{value}</Text>
      <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 6 }} />
    </Pressable>
  );
}

function CopyButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 active:bg-slate-100"
    >
      <Ionicons name="copy-outline" size={15} color="#475569" />
      <Text className="ml-1.5 text-[13px] font-semibold text-slate-700">{label}</Text>
    </Pressable>
  );
}
