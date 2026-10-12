import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";

import { RepeatDaysSheet } from "@/src/components/calendar/RepeatDaysSheet";
import { loadUsualFoods, UsualFoodPicker, type UsualFood } from "@/src/components/calendar/UsualFoodPicker";
import { addDays, durationLabel, minutesLabel, repeatLabel, untilAfter, WEEKDAYS_FULL, WEEKDAYS_SHORT, weeklyDays } from "@/src/components/calendar/calendarUtils";
import { DateField, TimeField } from "@/src/components/web/fields";
import { Button, Card, PageTitle, WEB, WebPage } from "@/src/components/web/ui";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendars,
  getEventOccurrences,
  getMealTimes,
  updateCalendarEvent,
  getMealTimesUntil,
  MEAL_TYPES,
  saveMealTimes,
  SESSION_TYPES,
  type EventOccurrence,
  type KitchenKind,
  type MealTime,
  type MealTimes,
  type MealType,
} from "@/src/services/calendarApi";
import { loadSettings } from "@/src/services/settingsService";
import { createUsualMeal, getUsualMeals, stopUsualMeal, updateUsualMeal, usualName, type UsualMeal } from "@/src/services/usualMealApi";
import { parseLocalDate, todayStr } from "@/src/utils/mealPlan";

// The Kitchen calendar's settings on a desktop: the regular meal times, and
// the regular prep sessions and shopping trips. The same things the phone's
// pages set (app/calendar/meal-times.tsx, sessions.tsx), laid out for a wide
// window: the meal times as a week's table, the rest as cards beside it.

type Hover = { hovered?: boolean };

const DEFAULT_TIMES: Record<MealType, MealTime> = {
  breakfast: { start: 7 * 60, end: 7 * 60 + 30 },
  lunch: { start: 12 * 60, end: 13 * 60 },
  dinner: { start: 19 * 60, end: 20 * 60 },
  snack: { start: 15 * 60 + 30, end: 15 * 60 + 45 },
};

const failed = (title: string) => (error: unknown) => Alert.alert(title, error instanceof Error ? error.message : "Something went wrong.");

function daysLabel(weekdays: number[]): string {
  const days = [...weekdays].sort((a, b) => a - b);
  if (days.length === 7) return "Every day";
  if (days.join() === "1,2,3,4,5") return "Weekdays";
  return days.map((d) => WEEKDAYS_SHORT[d]).join(", ");
}

function DayChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ hovered }: Hover) => ({ height: 34, minWidth: 48, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: on ? WEB.blue : hovered ? "#E2E8F0" : "#F1F5F9" })}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: on ? "#FFFFFF" : "#334155" }}>{label}</Text>
    </Pressable>
  );
}

const Label = ({ children }: { children: string }) => <Text style={{ width: 86, fontSize: 13, color: WEB.muted }}>{children}</Text>;

// ── Meal times ───────────────────────────────────────────────────────────────

export function WebMealTimesScreen() {
  const router = useRouter();
  const [times, setTimes] = useState<MealTimes | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [weekStartDay, setWeekStartDay] = useState(1);
  // The cell being edited.
  const [meal, setMeal] = useState<MealType>("breakfast");
  const [day, setDay] = useState(new Date().getDay());
  // Usual food: saved as it's changed, separately from the times.
  const [usuals, setUsuals] = useState<UsualMeal[]>([]);
  const [editingDays, setEditingDays] = useState<UsualMeal | null>(null);
  const [foods, setFoods] = useState<UsualFood[] | null>(null);
  // A usual being added: for which meal (picking what), then which days.
  const [choosingFor, setChoosingFor] = useState<MealType | null>(null);
  const [adding, setAdding] = useState<{ slot: MealType; food: UsualFood } | null>(null);
  const loadUsuals = () => getUsualMeals().then(setUsuals).catch(() => {});
  const usualFail = (error: unknown) => {
    failed("Couldn't update")(error);
    void loadUsuals();
  };

  useEffect(() => {
    loadSettings().then((s) => setWeekStartDay(s.weekStartDay)).catch(() => {});
    void loadUsuals();
    Promise.all([getMealTimes(), getMealTimesUntil().catch(() => null)]).then(([loaded, end]) => {
      setTimes(loaded);
      setUntil(end);
      setSaved(JSON.stringify([loaded, end]));
    }, failed("Couldn't load"));
  }, []);

  if (!times) {
    return (
      <WebPage>
        <ActivityIndicator style={{ marginTop: 80 }} size="large" color={WEB.blue} />
      </WebPage>
    );
  }

  const days = Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7);
  const current = times[meal][day];
  const dirty = JSON.stringify([times, until]) !== saved;
  const mealLabel = (slot: MealType) => MEAL_TYPES.find((m) => m.value === slot)!.label;
  const setDayTime = (slot: MealType, target: number[], time: MealTime | null) => setTimes((prev) => prev && { ...prev, [slot]: prev[slot].map((t, d) => (target.includes(d) ? time : t)) });

  async function save() {
    if (!times) return;
    try {
      setSaving(true);
      const result = await saveMealTimes(times, todayStr(), until);
      setTimes(result);
      setSaved(JSON.stringify([result, until]));
    } catch (error) {
      failed("Couldn't save")(error);
    } finally {
      setSaving(false);
    }
  }

  function chooseUsual(slot: MealType) {
    setChoosingFor(slot);
    if (!foods) loadUsualFoods().then(setFoods, () => setChoosingFor(null));
  }

  return (
    <WebPage maxWidth={1180}>
      <PageTitle
        title="Meal times"
        subtitle="When you usually eat, for the Kitchen calendar. Changes start today; earlier days keep the times they had."
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {dirty && <Text style={{ fontSize: 13, color: WEB.muted }}>Unsaved changes</Text>}
            <Button label="Back to calendar" onPress={() => router.push("/calendar")} />
            <Button label={saving ? "Saving…" : "Save"} kind="primary" onPress={() => void save()} />
          </View>
        }
      />

      {/* (Open to its time lists, and above the cards under it.) */}
      <Card title="Regular times" subtitle="Click a day to set or change that meal's time" padded={false} style={{ overflow: "visible", zIndex: 10 }}>
        <View style={{ paddingHorizontal: 18, paddingBottom: 16 }}>
          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            <View style={{ width: 96 }} />
            {days.map((d) => (
              <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: "700", color: WEB.muted }}>
                {WEEKDAYS_SHORT[d]}
              </Text>
            ))}
          </View>
          {MEAL_TYPES.map((type) => (
            <View key={type.value} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ width: 96, fontSize: 14, fontWeight: "600", color: WEB.text }}>{type.label}</Text>
              {days.map((d) => {
                const time = times[type.value][d];
                const on = meal === type.value && day === d;
                return (
                  <Pressable
                    key={d}
                    onPress={() => {
                      setMeal(type.value);
                      setDay(d);
                    }}
                    accessibilityLabel={`${type.label}, ${WEEKDAYS_FULL[d]}`}
                    style={({ hovered }: Hover) => ({
                      flex: 1,
                      height: 44,
                      marginHorizontal: 3,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 10,
                      borderWidth: on ? 2 : 1,
                      borderStyle: time ? "solid" : "dashed",
                      borderColor: on ? WEB.blue : WEB.border,
                      backgroundColor: time ? (hovered || on ? WEB.blueSoft : WEB.page) : hovered ? WEB.page : "transparent",
                    })}
                  >
                    <Text style={{ fontSize: 12, fontWeight: time ? "600" : "400", color: time ? WEB.text : WEB.faint }}>{time ? `${minutesLabel(time.start)}–${minutesLabel(time.end)}` : "—"}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {/* The cell picked above. */}
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: WEB.border, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, backgroundColor: WEB.page }}>
          <Text style={{ minWidth: 170, fontSize: 14, fontWeight: "700", color: WEB.text }}>
            {mealLabel(meal)} · {WEEKDAYS_FULL[day]}
          </Text>
          {current ? (
            <>
              <TimeField
                minutes={current.start}
                // (The length is kept.)
                onChange={(start) => setDayTime(meal, [day], { start: Math.min(start, 1425), end: Math.min(1440, Math.min(start, 1425) + (current.end - current.start)) })}
              />
              <Text style={{ fontSize: 13, color: WEB.muted }}>to</Text>
              <TimeField minutes={current.end} after={current.start} label="Ends" onChange={(end) => setDayTime(meal, [day], { start: current.start, end })} />
              <Text style={{ fontSize: 13, color: WEB.muted }}>{durationLabel(current.end - current.start)}</Text>
              <View style={{ flex: 1 }} />
              <Button label="Copy to every day" small onPress={() => setDayTime(meal, [0, 1, 2, 3, 4, 5, 6], current)} />
              <Button label="Copy to weekdays" small onPress={() => setDayTime(meal, [1, 2, 3, 4, 5], current)} />
              <Button label="Remove" small onPress={() => setDayTime(meal, [day], null)} />
            </>
          ) : (
            <>
              <Text style={{ flex: 1, fontSize: 13, color: WEB.muted }}>
                No {mealLabel(meal).toLowerCase()} block on {WEEKDAYS_FULL[day]}s.
              </Text>
              {/* Starts from another day's time for this meal, if any. */}
              <Button label="Add a time" small kind="primary" onPress={() => setDayTime(meal, [day], times[meal].find(Boolean) ?? DEFAULT_TIMES[meal])} />
            </>
          )}
        </View>
      </Card>

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16, marginTop: 16 }}>
        <Card title="Run until" subtitle="A last day for all the regular times" style={{ width: 340 }}>
          <DateField value={until} onChange={setUntil} placeholder="No end date" weekStartDay={weekStartDay} />
          <Text style={{ marginTop: 10, fontSize: 12, lineHeight: 17, color: WEB.muted }}>
            {until ? "Every meal's regular time stops after this day. Saved with the times above." : "With no end date they run on. Any single day you've edited or skipped in the calendar stays as it is."}
          </Text>
        </Card>

        <Card title="Usual food" subtitle="Planned for you on its days, two weeks ahead. Changes here apply straight away." style={{ flex: 1 }} padded={false}>
          {MEAL_TYPES.map((type) => {
            const list = usuals.filter((u) => u.slot === type.value);
            return (
              <View key={type.value} style={{ borderTopWidth: 1, borderTopColor: WEB.border, paddingHorizontal: 18, paddingVertical: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: WEB.text }}>{type.label}</Text>
                  <Button label="Add" icon="add" small onPress={() => chooseUsual(type.value)} />
                </View>
                {list.length === 0 && <Text style={{ marginTop: 2, fontSize: 12, color: WEB.faint }}>Nothing usual yet.</Text>}
                {list.map((usual) => (
                  <View key={usual._id} style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: usual.active ? WEB.text : WEB.faint }}>
                      {usualName(usual)}
                    </Text>
                    <Pressable onPress={() => setEditingDays(usual)} accessibilityLabel={`Days for ${usualName(usual)}`} style={({ hovered }: Hover) => ({ height: 28, paddingHorizontal: 10, justifyContent: "center", borderRadius: 8, backgroundColor: hovered ? WEB.blueSoft : "transparent" })}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: WEB.blue }}>
                        {daysLabel(usual.weekdays)}
                        {usual.active ? "" : " · off"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setUsuals((prev) => prev.map((u) => (u._id === usual._id ? { ...u, active: !u.active } : u)));
                        updateUsualMeal(usual._id, { active: !usual.active }).then(loadUsuals, usualFail);
                      }}
                      accessibilityLabel={usual.active ? "Switch off" : "Switch on"}
                      style={{ marginLeft: 6, width: 38, height: 22, justifyContent: "center", borderRadius: 11, paddingHorizontal: 3, backgroundColor: usual.active ? WEB.blue : "#CBD5E1" }}
                    >
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#FFFFFF", transform: [{ translateX: usual.active ? 16 : 0 }] }} />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Alert.alert(`Stop having ${usualName(usual)}?`, "It's taken off the days still to come. Anything already eaten stays.", [
                          { text: "Keep", style: "cancel" },
                          { text: "Stop", style: "destructive", onPress: () => void stopUsualMeal(usual._id).then(loadUsuals, usualFail) },
                        ])
                      }
                      accessibilityLabel={`Stop having ${usualName(usual)}`}
                      style={({ hovered }: Hover) => ({ marginLeft: 6, width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: hovered ? "#FEE2E2" : "transparent" })}
                    >
                      <Ionicons name="trash-outline" size={15} color={WEB.red} />
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })}
        </Card>
      </View>

      {choosingFor && (
        <UsualFoodPicker
          title={`Usual ${mealLabel(choosingFor).toLowerCase()}`}
          foods={foods}
          onPick={(food) => {
            setAdding({ slot: choosingFor, food });
            setChoosingFor(null);
          }}
          onClose={() => setChoosingFor(null)}
        />
      )}
      <RepeatDaysSheet
        visible={!!adding}
        title={`Have ${adding?.food.name ?? "this"} every week`}
        subtitle={`It will be added to your planner as planned ${adding ? mealLabel(adding.slot).toLowerCase() : "meal"} on these days, two weeks ahead.`}
        initialDays={[new Date().getDay()]}
        weekStartDay={weekStartDay}
        confirmLabel="Add as usual"
        onCancel={() => setAdding(null)}
        onConfirm={(weekdays) => {
          const item = adding;
          setAdding(null);
          if (item) createUsualMeal({ slot: item.slot, weekdays, ...item.food.input }).then(loadUsuals, usualFail);
        }}
      />
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
    </WebPage>
  );
}

// ── Regular prep sessions / shopping trips ───────────────────────────────────

export function WebSessionsScreen({ kind }: { kind: KitchenKind }) {
  const router = useRouter();
  const session = SESSION_TYPES.find((s) => s.value === kind)!;
  const plural = kind === "prep" ? "Prep sessions" : "Shopping trips";
  const today = todayStr();

  const [series, setSeries] = useState<EventOccurrence[] | null>(null);
  const [weekStartDay, setWeekStartDay] = useState(1);
  // The regular time being set up.
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState(kind === "prep" ? 16 * 60 : 10 * 60);
  const [end, setEnd] = useState(kind === "prep" ? 18 * 60 : 11 * 60);
  const [until, setUntil] = useState<string | null>(null);
  const [times, setTimes] = useState("");
  const [saving, setSaving] = useState(false);
  // The regular time picked from the list to change, if any: the form then
  // holds its details, and saves back to it.
  const [editing, setEditing] = useState<EventOccurrence | null>(null);
  function edit(item: EventOccurrence | null) {
    setEditing(item);
    setDays(item ? weeklyDays(item.repeat, item.date) : []);
    setStart(item?.startMinutes ?? (kind === "prep" ? 16 * 60 : 10 * 60));
    setEnd(item?.endMinutes ?? (kind === "prep" ? 18 * 60 : 11 * 60));
    setUntil(item?.repeat?.until ?? null);
    setTimes("");
  }

  // The repeating sessions of this kind still running: one row a series.
  const load = useCallback(() => {
    getEventOccurrences(today, addDays(today, 120))
      .then((occurrences) => {
        const seen = new Map<string, EventOccurrence>();
        for (const o of occurrences) if (o.kitchenKind === kind && o.repeat && !seen.has(o._id)) seen.set(o._id, o);
        setSeries([...seen.values()]);
      })
      .catch(() => setSeries([]));
  }, [kind, today]);
  useEffect(() => {
    loadSettings().then((s) => setWeekStartDay(s.weekStartDay)).catch(() => {});
    load();
  }, [load]);

  const order = Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7);
  const count = Number(times) >= 1 ? Number(times) : 0;

  async function add() {
    if (!days.length) {
      Alert.alert("Pick the days", "Choose at least one day of the week.");
      return;
    }
    try {
      setSaving(true);
      const weekdays = [...days].sort((a, b) => a - b);
      if (editing) {
        // The series keeps its start; its days, time and end change.
        const last = count ? untilAfter(editing.date, "weekly", weekdays, count) : until;
        if (last && last < editing.date) throw new Error("That end date is before the first session.");
        await updateCalendarEvent(editing._id, { startMinutes: start, endMinutes: end, repeat: { frequency: "weekly", interval: 1, weekdays, until: last } });
        edit(null);
        load();
        return;
      }
      const kitchen = (await getCalendars()).find((c) => c.isKitchen);
      if (!kitchen) throw new Error("The Kitchen calendar is missing.");
      // The first of the chosen days from today on.
      let date = today;
      while (!days.includes(parseLocalDate(date).getDay())) date = addDays(date, 1);
      // "N times" is kept as the date that falls on.
      const last = count ? untilAfter(date, "weekly", weekdays, count) : until;
      if (last && last < date) throw new Error("That end date is before the first session.");
      await createCalendarEvent({ title: session.title, calendar: kitchen._id, allDay: false, date, endDate: date, startMinutes: start, endMinutes: end, repeat: { frequency: "weekly", interval: 1, weekdays, until: last }, location: "", description: "", remindMinutes: 15, kitchenKind: kind });
      setDays([]);
      setUntil(null);
      setTimes("");
      load();
    } catch (error) {
      failed("Couldn't save")(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <WebPage maxWidth={1080}>
      <PageTitle
        title={plural}
        subtitle={`Your regular times, for the Kitchen calendar. ${kind === "prep" ? "What to make in each session" : "What to buy on each trip"} is worked out from your meal plan.`}
        right={<Button label="Back to calendar" onPress={() => router.push("/calendar")} />}
      />
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
        <Card title="Regular times" subtitle="Click one to change it. A single day can still be moved or skipped in the calendar." style={{ flex: 1 }} padded={false}>
          {series == null ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={WEB.blue} />
          ) : series.length === 0 ? (
            <Text style={{ paddingHorizontal: 18, paddingBottom: 18, fontSize: 13, lineHeight: 19, color: WEB.muted }}>None yet. Set one up here, or book single {plural.toLowerCase()} from the Kitchen week plan.</Text>
          ) : (
            series.map((item) => (
              <Pressable
                key={item._id}
                onPress={() => edit(editing?._id === item._id ? null : item)}
                accessibilityLabel={`Change the ${minutesLabel(item.startMinutes)} regular time`}
                style={({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: WEB.border, backgroundColor: editing?._id === item._id ? WEB.blueSoft : hovered ? WEB.page : "transparent" })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: WEB.text }}>
                    {minutesLabel(item.startMinutes)}–{minutesLabel(item.endMinutes)}
                    <Text style={{ fontWeight: "400", color: WEB.muted }}> · {durationLabel(item.endMinutes - item.startMinutes)}</Text>
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 12, color: WEB.blue }}>
                    {repeatLabel(item.repeat ?? null, item.date)}
                    {item.repeat?.until ? "" : " · no end"}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    Alert.alert(`Stop this regular ${kind === "prep" ? "prep session" : "shopping trip"}?`, "Every session in it is removed from the calendar, past ones too.", [
                      { text: "Keep", style: "cancel" },
                      { text: "Remove", style: "destructive", onPress: () => void deleteCalendarEvent(item._id).then(() => (editing?._id === item._id ? edit(null) : undefined)).then(load, failed("Couldn't remove it")) },
                    ])
                  }
                  accessibilityLabel="Remove this regular time"
                  style={({ hovered }: Hover) => ({ width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: hovered ? "#FEE2E2" : "transparent" })}
                >
                  <Ionicons name="trash-outline" size={16} color={WEB.red} />
                </Pressable>
              </Pressable>
            ))
          )}
        </Card>

        <Card title={editing ? "Change this regular time" : "Add a regular time"} style={{ width: 460, overflow: "visible" }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {order.map((d) => (
              <DayChip key={d} label={WEEKDAYS_SHORT[d]} on={days.includes(d)} onPress={() => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))} />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, zIndex: 10 }}>
            <Label>Time</Label>
            <TimeField
              minutes={start}
              // (The length is kept.)
              onChange={(next) => {
                setEnd(Math.min(1440, next + (end - start)));
                setStart(next);
              }}
            />
            <Text style={{ fontSize: 13, color: WEB.muted }}>to</Text>
            <TimeField minutes={end} after={start} label="Ends" onChange={setEnd} />
            <Text style={{ fontSize: 13, color: WEB.muted }}>{durationLabel(end - start)}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
            <Label>Until</Label>
            <DateField
              value={count ? null : until}
              onChange={(date) => {
                setUntil(date);
                if (date) setTimes("");
              }}
              placeholder="No end date"
              weekStartDay={weekStartDay}
            />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
            <Label>Or after</Label>
            <TextInput
              value={times}
              onChangeText={(text) => setTimes(text.replace(/[^0-9]/g, ""))}
              placeholder="–"
              placeholderTextColor={WEB.faint}
              inputMode="numeric"
              accessibilityLabel="Number of times"
              style={{ width: 60, height: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: WEB.border, fontSize: 14, color: WEB.text, textAlign: "center" }}
            />
            <Text style={{ fontSize: 13, color: WEB.muted }}>times</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 18 }}>
            <Text style={{ flex: 1, fontSize: 12, color: WEB.muted }}>
              {days.length ? `${daysLabel(days)} · ${count ? `${count} time${count === 1 ? "" : "s"}` : until ? "until the date above" : "no end"}` : "Pick the days of the week"}
            </Text>
            {editing && <Button label="Cancel" onPress={() => edit(null)} />}
            <View style={{ width: 8 }} />
            <Button label={saving ? "Saving…" : editing ? "Save changes" : "Add"} icon={editing ? "checkmark" : "add"} kind="primary" onPress={() => void add()} />
          </View>
        </Card>
      </View>
    </WebPage>
  );
}
