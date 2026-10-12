import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TimePickerModal } from "@/src/components/calendar/CalendarSheets";
import { addDays, durationLabel, minutesLabel, repeatLabel, shortDateLabel, untilAfter, WEEKDAYS_SHORT, weeklyDays } from "@/src/components/calendar/calendarUtils";
import { WebSessionsScreen } from "@/src/components/calendar/web/WebKitchenTimes";
import { DatePickerModal } from "@/src/components/forms";
import { createCalendarEvent, deleteCalendarEvent, getCalendars, getEventOccurrences, SESSION_TYPES, updateCalendarEvent, type EventOccurrence, type KitchenKind } from "@/src/services/calendarApi";
import { loadSettings } from "@/src/services/settingsService";
import { parseLocalDate, todayStr } from "@/src/utils/mealPlan";
import { useWideWeb } from "@/src/utils/useWideWeb";

// The Kitchen calendar's regular prep sessions or shopping trips (`kind` in
// the address): the weekly times you keep for them. A regular time is an
// ordinary repeating event in the Kitchen calendar — on the days of the week
// you pick, until a date, for a number of times, or with no end — so it can
// still be moved or skipped a day at a time in the calendar. What each
// session is for is worked out from the meal plan.
export default function RegularSessionsScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind: KitchenKind = kindParam === "shop" ? "shop" : "prep";
  // A desktop browser gets its own layout of the same thing.
  return useWideWeb() ? <WebSessionsScreen key={kind} kind={kind} /> : <PhoneSessionsScreen key={kind} kind={kind} />;
}

function PhoneSessionsScreen({ kind }: { kind: KitchenKind }) {
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
  const [picking, setPicking] = useState<"start" | "end" | "until" | null>(null);
  const [saving, setSaving] = useState(false);
  // The regular time tapped in the list to change, if any: the form then
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

  // The first of the chosen days from today on.
  function firstDay(): string {
    let day = today;
    while (!days.includes(parseLocalDate(day).getDay())) day = addDays(day, 1);
    return day;
  }

  async function add() {
    if (!days.length) {
      Alert.alert("Pick the days", "Choose at least one day of the week.");
      return;
    }
    if (end <= start) {
      Alert.alert("Check the time", "It needs to end after it starts.");
      return;
    }
    try {
      setSaving(true);
      const weekdays = [...days].sort((a, b) => a - b);
      if (editing) {
        // The series keeps its start; its days, time and end change.
        const end_ = Number(times) >= 1 ? untilAfter(editing.date, "weekly", weekdays, Number(times)) : until;
        if (end_ && end_ < editing.date) throw new Error("That end date is before the first session.");
        await updateCalendarEvent(editing._id, { startMinutes: start, endMinutes: end, repeat: { frequency: "weekly", interval: 1, weekdays, until: end_ } });
        edit(null);
        load();
        return;
      }
      const kitchen = (await getCalendars()).find((c) => c.isKitchen);
      if (!kitchen) throw new Error("The Kitchen calendar is missing.");
      const date = firstDay();
      // "N times" is kept as the date that falls on.
      const last = Number(times) >= 1 ? untilAfter(date, "weekly", weekdays, Number(times)) : until;
      if (last && last < date) throw new Error("That end date is before the first session.");
      await createCalendarEvent({ title: session.title, calendar: kitchen._id, allDay: false, date, endDate: date, startMinutes: start, endMinutes: end, repeat: { frequency: "weekly", interval: 1, weekdays, until: last }, location: "", description: "", remindMinutes: 15, kitchenKind: kind });
      setDays([]);
      setUntil(null);
      setTimes("");
      load();
    } catch (error) {
      Alert.alert("Couldn't save", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function confirmStop(item: EventOccurrence) {
    Alert.alert(`Stop this regular ${kind === "prep" ? "prep session" : "shopping trip"}?`, "Every session in it is removed from the calendar, past ones too.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => void deleteCalendarEvent(item._id).then(() => (editing?._id === item._id ? edit(null) : undefined)).then(load, (error) => Alert.alert("Couldn't remove it", error instanceof Error ? error.message : "Something went wrong.")),
      },
    ]);
  }

  const ends = Number(times) >= 1 ? `after ${Number(times)} time${Number(times) === 1 ? "" : "s"}` : until ? `until ${shortDateLabel(until)} ${parseLocalDate(until).getFullYear()}` : "no end";

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-3">
        <Pressable className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100" onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <View className="ml-1 flex-1">
          <Text className="text-xl font-bold text-slate-950">{plural}</Text>
          <Text className="text-xs text-slate-500">Your regular times, for the Kitchen calendar</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Regular times</Text>
        <View className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
          {series == null ? (
            <ActivityIndicator className="my-5" color="#2563EB" />
          ) : series.length === 0 ? (
            <Text className="px-4 py-3.5 text-sm leading-5 text-slate-500">None yet. Set one up below, or book single {plural.toLowerCase()} from the week plan.</Text>
          ) : (
            series.map((item, index) => (
              <View key={item._id} className={`flex-row items-center pl-4 pr-2 ${index > 0 ? "border-t border-slate-100" : ""} ${editing?._id === item._id ? "bg-blue-50" : ""}`} style={{ minHeight: 62 }}>
                {/* Tapped, its details fill the form below to be changed. */}
                <Pressable onPress={() => edit(editing?._id === item._id ? null : item)} className="flex-1 py-2.5 active:opacity-60">
                  <Text className="text-base font-semibold text-slate-900" numberOfLines={1}>
                    {minutesLabel(item.startMinutes)}–{minutesLabel(item.endMinutes)}
                    <Text className="font-normal text-slate-500"> · {durationLabel(item.endMinutes - item.startMinutes)}</Text>
                  </Text>
                  <Text className="mt-0.5 text-xs text-blue-700" numberOfLines={1}>
                    {repeatLabel(item.repeat ?? null, item.date)}
                    {item.repeat?.until ? "" : " · no end"}
                  </Text>
                </Pressable>
                <Pressable onPress={() => confirmStop(item)} hitSlop={6} accessibilityLabel="Remove this regular time" className="h-10 w-10 items-center justify-center rounded-full active:bg-red-50">
                  <Ionicons name="trash-outline" size={19} color="#DC2626" />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">{editing ? "Change this regular time" : "Add a regular time"}</Text>
        <View className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <View className="flex-row justify-between px-3 py-3">
            {order.map((d) => {
              const on = days.includes(d);
              return (
                <Pressable
                  key={d}
                  onPress={() => setDays((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]))}
                  accessibilityLabel={WEEKDAYS_SHORT[d]}
                  className={`h-10 w-10 items-center justify-center rounded-full ${on ? "bg-blue-600" : "bg-slate-100 active:bg-slate-200"}`}
                >
                  <Text className={`text-xs font-semibold ${on ? "text-white" : "text-slate-600"}`}>{WEEKDAYS_SHORT[d]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Row icon="time-outline" label="Starts" value={minutesLabel(start)} onPress={() => setPicking("start")} />
          <Row icon="time-outline" label="Ends" value={minutesLabel(end)} onPress={() => setPicking("end")} />
          <Row
            icon="flag-outline"
            label="Until"
            value={until ? `${shortDateLabel(until)} ${parseLocalDate(until).getFullYear()}` : "No end date"}
            onPress={() => setPicking("until")}
            onClear={until ? () => setUntil(null) : undefined}
          />
          <View className="flex-row items-center border-t border-slate-100 px-4" style={{ minHeight: 54 }}>
            <Ionicons name="repeat-outline" size={20} color="#64748B" />
            <Text className="ml-3 flex-1 text-base text-slate-900">Or after</Text>
            <TextInput
              value={times}
              onChangeText={(text) => setTimes(text.replace(/[^0-9]/g, ""))}
              placeholder="–"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              returnKeyType="done"
              accessibilityLabel="Number of times"
              className="w-14 rounded-lg bg-slate-100 px-2 py-1.5 text-center text-base text-slate-900"
            />
            <Text className="ml-2 text-base text-slate-500">times</Text>
          </View>
        </View>
        <Pressable onPress={() => void add()} disabled={saving} className={`mt-3 flex-row items-center justify-center rounded-2xl py-3.5 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}>
          <Ionicons name={editing ? "checkmark" : "add"} size={18} color="#FFFFFF" />
          <Text className="ml-1 font-semibold text-white">
            {editing ? "Save changes" : "Add"}
            {days.length ? ` · ${[...days].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((d) => WEEKDAYS_SHORT[d]).join(", ")} · ${ends}` : ""}
          </Text>
        </Pressable>

        {editing && (
          <Pressable onPress={() => edit(null)} className="mt-2 items-center rounded-2xl bg-slate-100 py-3 active:bg-slate-200">
            <Text className="font-semibold text-slate-700">Cancel</Text>
          </Pressable>
        )}

        <View className="mt-5 flex-row rounded-2xl bg-blue-50 px-4 py-3">
          <Ionicons name="information-circle-outline" size={18} color="#1D4ED8" style={{ marginTop: 1 }} />
          <Text className="ml-2 flex-1 text-[13px] leading-5 text-blue-900">
            {kind === "prep" ? "What to make in each session" : "What to buy on each trip"} is worked out from your meal plan. A single day can still be moved or skipped in the calendar.
          </Text>
        </View>
      </ScrollView>

      <TimePickerModal
        visible={picking === "start" || picking === "end"}
        title={picking === "end" ? "Ends" : "Starts"}
        minutes={picking === "end" ? end % 1440 : start}
        onCancel={() => setPicking(null)}
        onConfirm={(minutes) => {
          if (picking === "start") {
            // (The length is kept.)
            setEnd(Math.min(1440, minutes + (end - start)));
            setStart(minutes);
          } else setEnd(minutes);
          setPicking(null);
        }}
      />
      <DatePickerModal
        visible={picking === "until"}
        title="Until"
        value={until ?? `${new Date().getFullYear()}-12-31`}
        onCancel={() => setPicking(null)}
        onConfirm={(value) => {
          setUntil(value);
          setTimes("");
          setPicking(null);
        }}
      />
    </SafeAreaView>
  );
}

function Row({ icon, label, value, onPress, onClear }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress: () => void; onClear?: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center border-t border-slate-100 px-4 active:bg-slate-50" style={{ minHeight: 54 }}>
      <Ionicons name={icon} size={20} color="#64748B" />
      <Text className="ml-3 flex-1 text-base text-slate-900">{label}</Text>
      <Text className="text-base font-medium text-blue-700">{value}</Text>
      {onClear ? (
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel={`Clear ${label.toLowerCase()}`} className="ml-1.5">
          <Ionicons name="close-circle" size={18} color="#94A3B8" />
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 6 }} />
      )}
    </Pressable>
  );
}
