import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TimePickerModal } from "@/src/components/calendar/CalendarSheets";
import { RepeatDaysSheet } from "@/src/components/calendar/RepeatDaysSheet";
import { loadUsualFoods, UsualFoodPicker, type UsualFood } from "@/src/components/calendar/UsualFoodPicker";
import { durationLabel, minutesLabel, WEEKDAYS_FULL, WEEKDAYS_SHORT } from "@/src/components/calendar/calendarUtils";
import { DatePickerModal } from "@/src/components/forms";
import { Tap } from "@/src/components/ui/Tap";
import {
  getMealTimes,
  getMealTimesUntil,
  MEAL_TYPES,
  saveMealTimes,
  type MealTime,
  type MealTimes,
  type MealType,
} from "@/src/services/calendarApi";
import { WebMealTimesScreen } from "@/src/components/calendar/web/WebKitchenTimes";
import { loadSettings } from "@/src/services/settingsService";
import {
  createUsualMeal,
  getUsualMeals,
  stopUsualMeal,
  updateUsualMeal,
  usualName,
  type UsualMeal,
} from "@/src/services/usualMealApi";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";
import { parseLocalDate, SLOT_MAP, todayStr } from "@/src/utils/mealPlan";
import { useWideWeb } from "@/src/utils/useWideWeb";

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
  // A desktop browser gets the week laid out as a table, in its older look;
  // the phone's is in Orbit's, in the Calendar's blue.
  const wide = useWideWeb();
  return (
    <OrbitSection section="calendar">
      <OrbitPage on={!wide}>{wide ? <WebMealTimesScreen /> : <PhoneMealTimesScreen />}</OrbitPage>
    </OrbitSection>
  );
}

function PhoneMealTimesScreen() {
  const router = useRouter();
  const { colors: c, dark } = useOrbitTheme();
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
  // The last day the regular times run to (null = no end), saved with them.
  const [until, setUntil] = useState<string | null>(null);
  const [pickingUntil, setPickingUntil] = useState(false);
  // A usual being added here: first what (`choosing`), then which days.
  const [foods, setFoods] = useState<UsualFood[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [adding, setAdding] = useState<UsualFood | null>(null);
  const loadUsuals = () => getUsualMeals().then(setUsuals).catch(() => {});

  useEffect(() => {
    loadSettings().then((s) => setWeekStartDay(s.weekStartDay)).catch(() => {});
    void loadUsuals();
    Promise.all([getMealTimes(), getMealTimesUntil().catch(() => null)])
      .then(([loaded, end]) => {
        setTimes(loaded);
        setUntil(end);
        setSaved(JSON.stringify([loaded, end]));
      })
      .catch((error) =>
        Alert.alert("Couldn't load", error instanceof Error ? error.message : "Something went wrong.", [
          { text: "OK", onPress: () => router.back() },
        ]),
      );
  }, [router]);

  if (!times) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.canvas }}>
        <ActivityIndicator size="large" color={c.muted} />
      </SafeAreaView>
    );
  }

  const days = Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7);
  const current = times[meal][day];
  const dirty = JSON.stringify([times, until]) !== saved;
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
  // Everything a usual can be, loaded the first time one is added.
  function chooseUsual() {
    setChoosing(true);
    if (foods) return;
    loadUsualFoods().then(setFoods, () => {
      setChoosing(false);
      Alert.alert("Couldn't load", "Check your connection and try again.");
    });
  }

  function daysLabel(weekdays: number[]): string {
    if (weekdays.length === 7) return "Every day";
    if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))) return "Weekdays";
    return days.filter((d) => weekdays.includes(d)).map((d) => WEEKDAYS_SHORT[d]).join(", ");
  }

  async function save() {
    if (!times) return;
    try {
      setSaving(true);
      const result = await saveMealTimes(times, todayStr(), until);
      setTimes(result);
      setSaved(JSON.stringify([result, until]));
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

  // Orbit's pieces, light or dark.
  const card = { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, overflow: "hidden" as const };
  const line = { borderTopWidth: 1, borderTopColor: c.border };
  const dangerSoft = dark ? "rgba(248,113,113,0.14)" : "#FEF2F2";
  const canSave = dirty && !saving;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      {/* The way back and Save over a large title, on the page itself */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
          <Tap onPress={close} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </Tap>
          <View style={{ flex: 1 }} />
          <Tap onPress={save} disabled={!canSave} style={{ height: 40, justifyContent: "center", paddingHorizontal: 18, borderRadius: 20, backgroundColor: canSave ? c.ink : c.pill }} pressedStyle={{ opacity: 0.8 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: canSave ? c.onInk : c.faint }}>{saving ? "Saving…" : "Save"}</Text>
          </Tap>
        </View>
        <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>Meal times</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>When you usually eat, for the Kitchen calendar</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 20, paddingBottom: 48 }}>
        {/* Which meal */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {MEAL_TYPES.map((m) => {
            const on = meal === m.value;
            const count = times[m.value].filter(Boolean).length;
            return (
              <Tap
                key={m.value}
                onPress={() => setMeal(m.value)}
                style={{ flex: 1, alignItems: "center", borderRadius: 16, borderWidth: 1, paddingVertical: 10, borderColor: on ? c.ink : c.border, backgroundColor: on ? c.ink : c.surface }}
                pressedStyle={on ? { opacity: 0.85 } : { backgroundColor: c.pill }}
              >
                <Ionicons name={SLOT_MAP[m.value].icon} size={18} color={on ? c.onInk : c.icon} />
                <Text style={{ marginTop: 4, fontSize: 13, fontWeight: "600", color: on ? c.onInk : c.text }}>{m.label}</Text>
                <Text style={{ fontSize: 11, color: on ? c.onInk : c.faint, opacity: on ? 0.75 : 1 }}>
                  {count === 0 ? "Off" : count === 7 ? "Every day" : `${count} day${count === 1 ? "" : "s"}`}
                </Text>
              </Tap>
            );
          })}
        </View>

        {/* Which day */}
        <Eyebrow top={20}>Day</Eyebrow>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {days.map((d) => {
            const on = day === d;
            const time = times[meal][d];
            return (
              <Tap
                key={d}
                onPress={() => setDay(d)}
                style={{ flex: 1, alignItems: "center", borderRadius: 12, borderWidth: 1, paddingVertical: 8, borderColor: on ? c.ink : c.border, backgroundColor: on ? c.accentSoft : c.surface }}
                pressedStyle={on ? { opacity: 0.85 } : { backgroundColor: c.pill }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: on ? c.ink : c.text }}>{WEEKDAYS_SHORT[d]}</Text>
                <Text style={{ marginTop: 2, fontSize: 10, color: time ? (on ? c.ink : c.muted) : c.orbit }}>
                  {time ? minutesLabel(time.start) : "—"}
                </Text>
              </Tap>
            );
          })}
        </View>

        {/* That meal on that day */}
        <View style={[card, { marginTop: 12 }]}>
          <Tap onPress={toggleDay} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, minHeight: 56 }} pressedStyle={{ backgroundColor: c.pill }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: c.text }}>
              {mealLabel} on {WEEKDAYS_FULL[day]}
            </Text>
            <Switch on={!!current} />
          </Tap>
          {current ? (
            <>
              <TimeRow label="Starts" value={minutesLabel(current.start)} onPress={() => setPicking("start")} />
              <TimeRow label="Ends" value={minutesLabel(current.end)} onPress={() => setPicking("end")} />
              <View style={[line, { paddingHorizontal: 16, paddingVertical: 10 }]}>
                <Text style={{ fontSize: 12, color: c.muted }}>{durationLabel(current.end - current.start)}</Text>
              </View>
            </>
          ) : (
            <View style={[line, { paddingHorizontal: 16, paddingVertical: 12 }]}>
              <Text style={{ fontSize: 14, color: c.muted }}>
                No {mealLabel.toLowerCase()} block on {WEEKDAYS_FULL[day]}s.
              </Text>
            </View>
          )}
        </View>

        {/* Reuse this day's setting */}
        <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
          <CopyButton label="Copy to every day" onPress={() => setDayTime([0, 1, 2, 3, 4, 5, 6], current)} />
          <CopyButton label="Copy to weekdays" onPress={() => setDayTime([1, 2, 3, 4, 5], current)} />
        </View>

        {/* How long the regular times run */}
        <Eyebrow top={24}>Run until</Eyebrow>
        <View style={card}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 8, minHeight: 56 }}>
            <Tap onPress={() => setPickingUntil(true)} style={{ flex: 1, paddingVertical: 12 }} pressedStyle={{ opacity: 0.6 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: c.text }}>
                {until ? parseLocalDate(until).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "No end date"}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 12, color: c.muted }}>{until ? "Every meal's regular time stops after this day." : "Tap to set a last day for all the regular times."}</Text>
            </Tap>
            {!!until && (
              <Tap onPress={() => setUntil(null)} hitSlop={6} accessibilityLabel="No end date" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }} pressedStyle={{ backgroundColor: c.pill }}>
                <Ionicons name="close-circle" size={20} color={c.faint} />
              </Tap>
            )}
          </View>
        </View>

        {/* Usual food for this meal */}
        <Eyebrow top={24}>Usual {mealLabel.toLowerCase()}</Eyebrow>
        <View style={card}>
          {mealUsuals.length === 0 ? (
            <Text style={{ paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, lineHeight: 20, color: c.muted }}>
              Nothing yet. Add what you have for {mealLabel.toLowerCase()} most weeks, and it&apos;s planned for you on those days.
            </Text>
          ) : (
            mealUsuals.map((usual, index) => (
              <View key={usual._id} style={[{ flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 8, minHeight: 60 }, index > 0 && line]}>
                <Tap onPress={() => setEditingDays(usual)} style={{ flex: 1, paddingVertical: 10 }} pressedStyle={{ opacity: 0.6 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: usual.active ? c.text : c.faint }} numberOfLines={1}>
                    {usualName(usual)}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 12, color: c.ink }}>
                    {daysLabel(usual.weekdays)}
                    {usual.active ? "" : " · off"}
                  </Text>
                </Tap>
                <Pressable onPress={() => toggleUsual(usual)} hitSlop={6} accessibilityLabel={usual.active ? "Switch off" : "Switch on"}>
                  <Switch on={usual.active} />
                </Pressable>
                <Tap
                  onPress={() => confirmStopUsual(usual)}
                  hitSlop={6}
                  accessibilityLabel={`Stop having ${usualName(usual)}`}
                  style={{ marginLeft: 4, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}
                  pressedStyle={{ backgroundColor: dangerSoft }}
                >
                  <Ionicons name="trash-outline" size={19} color={c.danger} />
                </Tap>
              </View>
            ))
          )}
        </View>
        <Tap onPress={chooseUsual} style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 16, paddingVertical: 12, backgroundColor: c.pill }}>
          <Ionicons name="add" size={18} color={c.onPill} />
          <Text style={{ marginLeft: 4, fontSize: 15, fontWeight: "600", color: c.onPill }}>Add a usual {mealLabel.toLowerCase()}</Text>
        </Tap>
        <Text style={{ marginTop: 8, paddingHorizontal: 4, fontSize: 12, lineHeight: 16, color: c.faint }}>
          Usual food is added to your planner as planned, two weeks ahead. Changes here apply straight away.
        </Text>

        <View style={{ marginTop: 20, flexDirection: "row", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.pill }}>
          <Ionicons name="information-circle-outline" size={18} color={c.muted} style={{ marginTop: 1 }} />
          <Text style={{ marginLeft: 8, flex: 1, fontSize: 13, lineHeight: 20, color: c.onPill }}>
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

      {/* A new usual: what… */}
      {choosing && (
        <UsualFoodPicker
          title={`Usual ${mealLabel.toLowerCase()}`}
          foods={foods}
          onPick={(food) => {
            setChoosing(false);
            // (After the picker has gone: iOS can't present over it.)
            setTimeout(() => setAdding(food), 350);
          }}
          onClose={() => setChoosing(false)}
        />
      )}
      {/* …then on which days. */}
      <RepeatDaysSheet
        visible={!!adding}
        title={`Have ${adding?.name ?? "this"} every week`}
        subtitle={`It will be added to your planner as planned ${mealLabel.toLowerCase()} on these days, two weeks ahead.`}
        initialDays={[day]}
        weekStartDay={weekStartDay}
        confirmLabel="Add as usual"
        onCancel={() => setAdding(null)}
        onConfirm={(weekdays) => {
          const food = adding;
          setAdding(null);
          if (food) createUsualMeal({ slot: meal, weekdays, ...food.input }).then(loadUsuals, usualFail);
        }}
      />

      <DatePickerModal
        visible={pickingUntil}
        title="Run until"
        value={until ?? `${new Date().getFullYear()}-12-31`}
        onCancel={() => setPickingUntil(false)}
        onConfirm={(value) => {
          setUntil(value);
          setPickingUntil(false);
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

// A small heading over a card.
function Eyebrow({ top = 0, children }: { top?: number; children: ReactNode }) {
  const { colors: c } = useOrbitTheme();
  return <Text style={{ marginTop: top, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", color: c.faint }}>{children}</Text>;
}

// An on/off switch, drawn (its row does the switching).
function Switch({ on }: { on: boolean }) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={{ height: 28, width: 48, justifyContent: "center", borderRadius: 14, paddingHorizontal: 4, backgroundColor: on ? c.ink : c.track }}>
      <View className="h-5 w-5 rounded-full bg-white shadow" style={{ transform: [{ translateX: on ? 20 : 0 }] }} />
    </View>
  );
}

function TimeRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { colors: c } = useOrbitTheme();
  return (
    <Tap onPress={onPress} style={{ flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 16, minHeight: 54 }} pressedStyle={{ backgroundColor: c.pill }}>
      <Ionicons name="time-outline" size={20} color={c.muted} />
      <Text style={{ marginLeft: 12, flex: 1, fontSize: 16, color: c.text }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: "500", color: c.ink }}>{value}</Text>
      <Ionicons name="chevron-forward" size={16} color={c.faint} style={{ marginLeft: 6 }} />
    </Tap>
  );
}

function CopyButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors: c } = useOrbitTheme();
  return (
    <Tap
      onPress={onPress}
      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingVertical: 10 }}
      pressedStyle={{ backgroundColor: c.pill }}
    >
      <Ionicons name="copy-outline" size={15} color={c.icon} />
      <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: c.icon }}>{label}</Text>
    </Tap>
  );
}
