import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TimePickerModal } from "@/src/components/calendar/CalendarSheets";
import { addDays, durationLabel, minutesLabel, repeatLabel, shortDateLabel, untilAfter, WEEKDAYS_SHORT, weeklyDays } from "@/src/components/calendar/calendarUtils";
import { WebSessionsScreen } from "@/src/components/calendar/web/WebKitchenTimes";
import { DatePickerModal } from "@/src/components/forms";
import { Tap } from "@/src/components/ui/Tap";
import { createCalendarEvent, deleteCalendarEvent, getCalendars, getEventOccurrences, SESSION_TYPES, updateCalendarEvent, type EventOccurrence, type KitchenKind } from "@/src/services/calendarApi";
import { loadSettings } from "@/src/services/settingsService";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";
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
  // A desktop browser gets its own layout of the same thing; both in Orbit's
  // look, in the Calendar's blue.
  const wide = useWideWeb();
  return (
    <OrbitSection section="calendar">
      <OrbitPage>{wide ? <WebSessionsScreen key={kind} kind={kind} /> : <PhoneSessionsScreen key={kind} kind={kind} />}</OrbitPage>
    </OrbitSection>
  );
}

function PhoneSessionsScreen({ kind }: { kind: KitchenKind }) {
  const router = useRouter();
  const { colors: c, dark } = useOrbitTheme();
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

  // Orbit's pieces, light or dark.
  const card = { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, overflow: "hidden" as const };
  const line = { borderTopWidth: 1, borderTopColor: c.border };
  const dangerSoft = dark ? "rgba(248,113,113,0.14)" : "#FEF2F2";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }} edges={["top", "left", "right"]}>
      {/* The way back over a large title, on the page itself */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
          <Tap onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }} pressedStyle={{ backgroundColor: c.pill }}>
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </Tap>
        </View>
        <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>{plural}</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.muted }}>Your regular times, for the Kitchen calendar</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Eyebrow>Regular times</Eyebrow>
        <View style={card}>
          {series == null ? (
            <ActivityIndicator style={{ marginVertical: 20 }} color={c.muted} />
          ) : series.length === 0 ? (
            <Text style={{ paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, lineHeight: 20, color: c.muted }}>None yet. Set one up below, or book single {plural.toLowerCase()} from the week plan.</Text>
          ) : (
            series.map((item, index) => (
              <View key={item._id} style={[{ flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 8, minHeight: 62 }, index > 0 && line, editing?._id === item._id && { backgroundColor: c.accentSoft }]}>
                {/* Tapped, its details fill the form below to be changed. */}
                <Tap onPress={() => edit(editing?._id === item._id ? null : item)} style={{ flex: 1, paddingVertical: 10 }} pressedStyle={{ opacity: 0.6 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: c.text }} numberOfLines={1}>
                    {minutesLabel(item.startMinutes)}–{minutesLabel(item.endMinutes)}
                    <Text style={{ fontWeight: "400", color: c.muted }}> · {durationLabel(item.endMinutes - item.startMinutes)}</Text>
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 12, color: c.ink }} numberOfLines={1}>
                    {repeatLabel(item.repeat ?? null, item.date)}
                    {item.repeat?.until ? "" : " · no end"}
                  </Text>
                </Tap>
                <Tap onPress={() => confirmStop(item)} hitSlop={6} accessibilityLabel="Remove this regular time" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }} pressedStyle={{ backgroundColor: dangerSoft }}>
                  <Ionicons name="trash-outline" size={19} color={c.danger} />
                </Tap>
              </View>
            ))
          )}
        </View>

        <Eyebrow top={24}>{editing ? "Change this regular time" : "Add a regular time"}</Eyebrow>
        <View style={card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12 }}>
            {order.map((d) => {
              const on = days.includes(d);
              return (
                <Tap
                  key={d}
                  onPress={() => setDays((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]))}
                  accessibilityLabel={WEEKDAYS_SHORT[d]}
                  style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : c.pill }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: on ? c.onInk : c.onPill }}>{WEEKDAYS_SHORT[d]}</Text>
                </Tap>
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
          <View style={[{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, minHeight: 54 }, line]}>
            <Ionicons name="repeat-outline" size={20} color={c.muted} />
            <Text style={{ marginLeft: 12, flex: 1, fontSize: 16, color: c.text }}>Or after</Text>
            <TextInput
              value={times}
              onChangeText={(text) => setTimes(text.replace(/[^0-9]/g, ""))}
              placeholder="–"
              placeholderTextColor={c.faint}
              keyboardType="number-pad"
              returnKeyType="done"
              accessibilityLabel="Number of times"
              style={{ width: 56, borderRadius: 10, backgroundColor: c.pill, paddingHorizontal: 8, paddingVertical: 6, textAlign: "center", fontSize: 16, color: c.text }}
            />
            <Text style={{ marginLeft: 8, fontSize: 16, color: c.muted }}>times</Text>
          </View>
        </View>
        <Tap onPress={() => void add()} disabled={saving} style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: c.ink, opacity: saving ? 0.5 : 1 }} pressedStyle={{ opacity: 0.85 }}>
          <Ionicons name={editing ? "checkmark" : "add"} size={18} color={c.onInk} />
          <Text style={{ marginLeft: 4, fontSize: 15, fontWeight: "600", color: c.onInk }}>
            {editing ? "Save changes" : "Add"}
            {days.length ? ` · ${[...days].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((d) => WEEKDAYS_SHORT[d]).join(", ")} · ${ends}` : ""}
          </Text>
        </Tap>

        {editing && (
          <Tap onPress={() => edit(null)} style={{ marginTop: 8, alignItems: "center", borderRadius: 16, paddingVertical: 12, backgroundColor: c.pill }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: c.onPill }}>Cancel</Text>
          </Tap>
        )}

        <View style={{ marginTop: 20, flexDirection: "row", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.pill }}>
          <Ionicons name="information-circle-outline" size={18} color={c.muted} style={{ marginTop: 1 }} />
          <Text style={{ marginLeft: 8, flex: 1, fontSize: 13, lineHeight: 20, color: c.onPill }}>
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

// A small heading over a card.
function Eyebrow({ top = 0, children }: { top?: number; children: ReactNode }) {
  const { colors: c } = useOrbitTheme();
  return <Text style={{ marginTop: top, marginBottom: 8, marginLeft: 4, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", color: c.faint }}>{children}</Text>;
}

function Row({ icon, label, value, onPress, onClear }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress: () => void; onClear?: () => void }) {
  const { colors: c } = useOrbitTheme();
  return (
    <Tap onPress={onPress} style={{ flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 16, minHeight: 54 }} pressedStyle={{ backgroundColor: c.pill }}>
      <Ionicons name={icon} size={20} color={c.muted} />
      <Text style={{ marginLeft: 12, flex: 1, fontSize: 16, color: c.text }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: "500", color: c.ink }}>{value}</Text>
      {onClear ? (
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel={`Clear ${label.toLowerCase()}`} style={{ marginLeft: 6 }}>
          <Ionicons name="close-circle" size={18} color={c.faint} />
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={c.faint} style={{ marginLeft: 6 }} />
      )}
    </Tap>
  );
}
