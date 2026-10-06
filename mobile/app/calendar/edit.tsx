import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OptionSheet, TimePickerModal } from "@/src/components/calendar/CalendarSheets";
import {
  addDays,
  calendarColor,
  daysBetween,
  durationLabel,
  minutesLabel,
  REMIND_OPTIONS,
  remindLabel,
  REPEAT_OPTIONS,
  shortDateLabel,
  WEEKDAYS_FULL,
  weeklyDays,
} from "@/src/components/calendar/calendarUtils";
import { loadSettings } from "@/src/services/settingsService";
import { DatePickerModal } from "@/src/components/forms";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  detachCalendarEvent,
  splitCalendarEvent,
  type SeriesScope,
  getCalendarEvent,
  getCalendars,
  updateCalendarEvent,
  type EventCalendar,
  type EventInput,
  type RepeatFrequency,
} from "@/src/services/calendarApi";
import { parseLocalDate, todayStr } from "@/src/utils/mealPlan";

// "Today", "Tomorrow", "Thursday", "Next Thursday" — the grey hint under
// the date, like Outlook's.
function relativeDay(date: string): string {
  const offset = daysBetween(todayStr(), date);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  const weekday = WEEKDAYS_FULL[parseLocalDate(date).getDay()];
  if (offset > 1 && offset < 7) return `This ${weekday}`;
  if (offset >= 7 && offset < 14) return `Next ${weekday}`;
  return "";
}

type DateTarget = "start" | "end" | "until" | null;
type TimeTarget = "start" | "end" | null;
type SheetTarget = "calendar" | "repeat" | "remind" | null;

// New event / edit event. Opened with `date` + `start`/`end` (minutes) from
// a dragged-out block or the + button, or with `id` to edit an event (a
// repeating event is edited as a whole series).
export default function EditCalendarEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    date?: string;
    start?: string;
    end?: string;
    // Editing a repeating event: which occurrence was tapped, and whether
    // the edit is for it alone, it and the following ones, or the series.
    occurrence?: string;
    scope?: SeriesScope;
  }>();
  const editingId = params.id;
  const occurrence = params.occurrence;
  const scope: SeriesScope | null = editingId && occurrence && params.scope ? params.scope : null;

  const initialDate = params.date ?? todayStr();
  const initialStart = params.start != null ? Number(params.start) : 9 * 60;
  const initialEnd = params.end != null ? Number(params.end) : initialStart + 60;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calendars, setCalendars] = useState<EventCalendar[]>([]);

  const [title, setTitle] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialEnd > 1440 ? addDays(initialDate, 1) : initialDate);
  const [startMinutes, setStartMinutes] = useState(initialStart);
  const [endMinutes, setEndMinutes] = useState(Math.min(1440, initialEnd));
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency | null>(null);
  const [repeatUntil, setRepeatUntil] = useState<string | null>(null);
  // Weekly repeats: which days (0 = Sunday … 6 = Saturday).
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [weekStartDay, setWeekStartDay] = useState(1);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [remindMinutes, setRemindMinutes] = useState<number | null>(15);

  const [dateTarget, setDateTarget] = useState<DateTarget>(null);
  const [timeTarget, setTimeTarget] = useState<TimeTarget>(null);
  const [sheet, setSheet] = useState<SheetTarget>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        loadSettings().then((s) => !cancelled && setWeekStartDay(s.weekStartDay)).catch(() => {});
        const [loadedCalendars, event] = await Promise.all([
          getCalendars(),
          editingId ? getCalendarEvent(editingId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCalendars(loadedCalendars);
        if (event) {
          setTitle(event.title);
          setCalendarId(event.calendar);
          setAllDay(event.allDay);
          // "Only this" / "this and following" open on the tapped occurrence;
          // the whole series opens on its start.
          const start = scope && scope !== "all" && occurrence ? occurrence : event.date;
          setDate(start);
          setEndDate(addDays(start, daysBetween(event.date, event.endDate)));
          setStartMinutes(event.startMinutes);
          setEndMinutes(event.endMinutes);
          // "Only this event" becomes a one-off.
          setRepeatFrequency(scope === "one" ? null : event.repeat?.frequency ?? null);
          setRepeatUntil(scope === "one" ? null : event.repeat?.until ?? null);
          // The old "every weekday" option is now weekly on Mon–Fri.
          if (scope === "one") {
            // no repeat
          } else if (event.repeat?.frequency === "weekdays") {
            setRepeatFrequency("weekly");
            setRepeatDays([1, 2, 3, 4, 5]);
          } else if (event.repeat?.frequency === "weekly") {
            setRepeatDays(weeklyDays(event.repeat, event.date));
          }
          setLocation(event.location);
          setDescription(event.description);
          setRemindMinutes(event.remindMinutes);
        } else {
          setCalendarId((loadedCalendars.find((c) => c.isDefault) ?? loadedCalendars[0])?._id ?? "");
        }
      } catch (error) {
        Alert.alert("Couldn't load", error instanceof Error ? error.message : "Something went wrong.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, router]);

  const calendar = calendars.find((c) => c._id === calendarId);
  const color = calendarColor(calendar);

  // A timed event ending at or before its start runs into the next day.
  const overnight = !allDay && endDate > date;
  const duration = useMemo(
    () => daysBetween(date, endDate) * 1440 + endMinutes - startMinutes,
    [date, endDate, startMinutes, endMinutes],
  );

  function changeStartDate(next: string) {
    const span = daysBetween(date, endDate);
    // A weekly repeat that was just "the start date's day" follows the date.
    const oldDay = parseLocalDate(date).getDay();
    if (repeatDays.length <= 1 && (repeatDays.length === 0 || repeatDays[0] === oldDay)) {
      setRepeatDays([parseLocalDate(next).getDay()]);
    }
    setDate(next);
    setEndDate(addDays(next, span));
  }

  function changeStartTime(next: number) {
    // Keep the duration, like Outlook.
    const length = duration > 0 ? duration : 60;
    const end = next + length;
    setStartMinutes(next);
    setEndMinutes(end % 1440 === 0 && end > 0 ? 1440 : end % 1440);
    setEndDate(addDays(date, end > 1440 ? Math.floor((end - 1) / 1440) : 0));
  }

  function changeEndTime(next: number) {
    setEndMinutes(next === 0 ? 1440 : next);
    setEndDate(next !== 0 && next <= startMinutes ? addDays(date, 1) : date);
  }

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert("Add a title", "Give your event a title.");
      return;
    }
    if (repeatFrequency && repeatUntil && repeatUntil < date) {
      Alert.alert("Check the repeat", "The repeat's end date is before the event starts.");
      return;
    }
    const input: EventInput = {
      title: trimmed,
      calendar: calendarId,
      allDay,
      date,
      endDate: allDay ? (endDate < date ? date : endDate) : endDate,
      startMinutes,
      endMinutes,
      repeat: repeatFrequency
        ? {
            frequency: repeatFrequency,
            interval: 1,
            until: repeatUntil,
            weekdays: repeatFrequency === "weekly" ? weeklyDays({ weekdays: repeatDays }, date) : [],
          }
        : null,
      location: location.trim(),
      description: description.trim(),
      remindMinutes,
    };
    try {
      setSaving(true);
      if (editingId && scope === "one" && occurrence) {
        await detachCalendarEvent(editingId, occurrence, input);
      } else if (editingId && scope === "following" && occurrence) {
        await splitCalendarEvent(editingId, occurrence, input);
      } else if (editingId) {
        await updateCalendarEvent(editingId, input);
      } else {
        await createCalendarEvent(input);
      }
      // A split-off edit makes a different event than the details page
      // showed, so go straight back to the calendar.
      if (scope === "one" || scope === "following") router.dismiss(2);
      else router.back();
    } catch (error) {
      Alert.alert("Couldn't save event", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!editingId) return;
    Alert.alert(
      scope === "one" ? "Delete this event?" : scope === "following" ? "Delete this and following events?" : "Delete event?",
      scope === "one"
        ? "The rest of the series stays."
        : scope === "following"
          ? "Earlier events in the series stay."
          : repeatFrequency
            ? "This deletes every occurrence of this repeating event."
            : undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCalendarEvent(editingId, scope ?? "all", occurrence);
              router.dismiss(2);
            } catch (error) {
              Alert.alert("Couldn't delete", error instanceof Error ? error.message : "Something went wrong.");
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header: cancel · title + calendar · save */}
        <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-2.5">
          <Pressable
            onPress={() => router.back()}
            disabled={saving}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100"
          >
            <Ionicons name="close" size={26} color="#0F172A" />
          </Pressable>
          <Pressable onPress={() => setSheet("calendar")} className="ml-1 flex-1 active:opacity-60">
            <Text className="text-lg font-bold text-slate-950">
              {!editingId
                ? "New event"
                : scope === "one"
                  ? "Edit this event"
                  : scope === "following"
                    ? "Edit this & following"
                    : scope === "all"
                      ? "Edit series"
                      : "Edit event"}
            </Text>
            <View className="flex-row items-center">
              <View className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <Text className="text-xs font-medium text-slate-500">{calendar?.name ?? "Calendar"}</Text>
              <Ionicons name="chevron-down" size={12} color="#64748B" style={{ marginLeft: 2 }} />
            </View>
          </Pressable>
          <Pressable
            onPress={() => void handleSave()}
            disabled={saving}
            className={`h-10 justify-center rounded-xl px-4 ${saving ? "bg-blue-300" : "bg-blue-600 active:bg-blue-700"}`}
          >
            <Text className="font-semibold text-white">{saving ? "Saving..." : "Save"}</Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {scope && occurrence && (
            <View className="mb-3 flex-row items-center rounded-2xl bg-blue-50 px-4 py-3">
              <Ionicons name="repeat" size={16} color="#1D4ED8" />
              <Text className="ml-2 flex-1 text-xs leading-4 text-blue-800">
                {scope === "one"
                  ? `Changes apply only to ${shortDateLabel(occurrence)}. It's split off the series as its own event.`
                  : scope === "following"
                    ? `Changes apply from ${shortDateLabel(occurrence)} on. Earlier events keep their current details.`
                    : "Changes apply to every event in the series."}
              </Text>
            </View>
          )}

          {/* Title */}
          <View className="mb-3 flex-row items-center rounded-3xl border border-slate-200 bg-white px-4">
            <View className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor="#94A3B8"
              autoFocus={!editingId}
              className="ml-3 flex-1 text-lg font-semibold text-slate-950"
              style={{ height: 60 }}
            />
          </View>

          {/* When */}
          <Card>
            <Row icon="time-outline" label="All day" onPress={() => setAllDay((v) => !v)} hideChevron>
              {/* Same toggle as the app's ToggleRow. */}
              <View className={`h-7 w-12 justify-center rounded-full px-1 ${allDay ? "bg-blue-600" : "bg-slate-200"}`}>
                <View
                  className="h-5 w-5 rounded-full bg-white shadow"
                  style={{ transform: [{ translateX: allDay ? 20 : 0 }] }}
                />
              </View>
            </Row>

            {allDay ? (
              <View className="flex-row border-t border-slate-100">
                <Pressable onPress={() => setDateTarget("start")} className="flex-1 px-4 py-3 active:bg-slate-50">
                  <Text className="text-xs font-medium text-slate-500">Starts</Text>
                  <Text className="mt-0.5 text-base font-semibold text-slate-950">{shortDateLabel(date)}</Text>
                  <Text className="text-xs text-slate-400">{relativeDay(date)}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setDateTarget("end")}
                  className="flex-1 border-l border-slate-100 px-4 py-3 active:bg-slate-50"
                >
                  <Text className="text-xs font-medium text-slate-500">Ends</Text>
                  <Text className="mt-0.5 text-base font-semibold text-slate-950">{shortDateLabel(endDate)}</Text>
                  <Text className="text-xs text-slate-400">
                    {daysBetween(date, endDate) + 1} day{daysBetween(date, endDate) === 0 ? "" : "s"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="flex-row border-t border-slate-100">
                <Pressable onPress={() => setDateTarget("start")} className="flex-1 px-4 py-3 active:bg-slate-50">
                  <Text className="text-xs font-medium text-slate-500">Date</Text>
                  <Text className="mt-0.5 text-base font-semibold text-slate-950">{shortDateLabel(date)}</Text>
                  <Text className="text-xs text-slate-400">{relativeDay(date)}</Text>
                </Pressable>
                <View className="flex-1 border-l border-slate-100 px-4 py-3">
                  <Text className="text-xs font-medium text-slate-500">Time</Text>
                  <View className="mt-0.5 flex-row items-center">
                    <Pressable onPress={() => setTimeTarget("start")} hitSlop={6} className="active:opacity-60">
                      <Text className="text-base font-semibold text-blue-600">{minutesLabel(startMinutes)}</Text>
                    </Pressable>
                    <Ionicons name="arrow-forward" size={14} color="#94A3B8" style={{ marginHorizontal: 6 }} />
                    <Pressable onPress={() => setTimeTarget("end")} hitSlop={6} className="active:opacity-60">
                      <Text className="text-base font-semibold text-blue-600">{minutesLabel(endMinutes)}</Text>
                    </Pressable>
                  </View>
                  <Text className="text-xs text-slate-400">
                    {durationLabel(duration)}
                    {overnight ? " · ends next day" : ""}
                  </Text>
                </View>
              </View>
            )}

            {scope !== "one" && (
            <Row icon="repeat" label="Repeat" onPress={() => setSheet("repeat")} border>
              <Text className="text-base text-slate-500">
                {REPEAT_OPTIONS.find((o) => o.value === repeatFrequency)?.label}
              </Text>
            </Row>
            )}
            {repeatFrequency === "weekly" && (
              <View className="border-t border-slate-100 px-4 py-3">
                <Text className="mb-2 text-xs font-medium text-slate-500">Repeat on</Text>
                <View className="flex-row justify-between">
                  {Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7).map((day) => {
                    const on = weeklyDays({ weekdays: repeatDays }, date).includes(day);
                    return (
                      <Pressable
                        key={day}
                        accessibilityLabel={WEEKDAYS_FULL[day]}
                        onPress={() => {
                          const current = weeklyDays({ weekdays: repeatDays }, date);
                          const next = on ? current.filter((d) => d !== day) : [...current, day];
                          // At least one day stays selected.
                          if (next.length) setRepeatDays(next);
                        }}
                        className={`h-10 w-10 items-center justify-center rounded-full ${on ? "bg-blue-600" : "bg-slate-100"}`}
                      >
                        <Text className={`text-sm font-semibold ${on ? "text-white" : "text-slate-600"}`}>
                          {WEEKDAYS_FULL[day][0]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            {repeatFrequency && (
              <Row icon="flag-outline" label="Until" onPress={() => setDateTarget("until")} border>
                <Text className="text-base text-slate-500">{repeatUntil ? shortDateLabel(repeatUntil) : "Forever"}</Text>
              </Row>
            )}
          </Card>

          {/* Where / details */}
          <Card>
            <View className="flex-row items-center px-4">
              <Ionicons name="location-outline" size={20} color="#64748B" />
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Location"
                placeholderTextColor="#94A3B8"
                className="ml-3 flex-1 text-base text-slate-950"
                style={{ height: 52 }}
              />
            </View>
            <View className="flex-row border-t border-slate-100 px-4 pt-3">
              <Ionicons name="reorder-three-outline" size={20} color="#64748B" />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
                placeholderTextColor="#94A3B8"
                multiline
                textAlignVertical="top"
                className="ml-3 flex-1 pb-3 text-base text-slate-950"
                style={{ minHeight: 80 }}
              />
            </View>
          </Card>

          {/* Reminder */}
          <Card>
            <Row icon="notifications-outline" label="Remind me" onPress={() => setSheet("remind")}>
              <Text className="text-base text-slate-500">{remindLabel(remindMinutes)}</Text>
            </Row>
          </Card>
          <Text className="-mt-1 mb-3 px-2 text-xs leading-4 text-slate-400">
            Reminders are saved with the event; phone notifications for them arrive in a later update.
          </Text>

          {editingId && (
            <Pressable
              onPress={handleDelete}
              className="mt-2 items-center rounded-2xl border border-red-200 bg-red-50 py-3.5 active:bg-red-100"
            >
              <Text className="font-semibold text-red-600">Delete event</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={dateTarget != null}
        title={dateTarget === "until" ? "Repeat until" : dateTarget === "end" ? "End date" : "Date"}
        value={dateTarget === "until" ? repeatUntil ?? date : dateTarget === "end" ? endDate : date}
        onCancel={() => setDateTarget(null)}
        onConfirm={(value) => {
          if (dateTarget === "start") changeStartDate(value);
          else if (dateTarget === "end") setEndDate(value < date ? date : value);
          else if (dateTarget === "until") setRepeatUntil(value);
          setDateTarget(null);
        }}
      />

      <TimePickerModal
        visible={timeTarget != null}
        title={timeTarget === "end" ? "Ends" : "Starts"}
        minutes={timeTarget === "end" ? endMinutes % 1440 : startMinutes}
        onCancel={() => setTimeTarget(null)}
        onConfirm={(value) => {
          if (timeTarget === "start") changeStartTime(value);
          else changeEndTime(value);
          setTimeTarget(null);
        }}
      />

      <OptionSheet
        visible={sheet === "calendar"}
        title="Calendar"
        options={calendars.filter((c) => !c.isTasks).map((c) => ({ value: c._id, label: c.name, color: calendarColor(c) }))}
        value={calendarId}
        onSelect={setCalendarId}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === "repeat"}
        title="Repeat"
        options={REPEAT_OPTIONS}
        value={repeatFrequency}
        onSelect={(value) => {
          setRepeatFrequency(value);
          if (!value) setRepeatUntil(null);
          if (value === "weekly" && repeatDays.length === 0) setRepeatDays([parseLocalDate(date).getDay()]);
        }}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === "remind"}
        title="Remind me"
        options={REMIND_OPTIONS}
        value={remindMinutes}
        onSelect={setRemindMinutes}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <View className="mb-3 overflow-hidden rounded-3xl border border-slate-200 bg-white">{children}</View>;
}

function Row({
  icon,
  label,
  children,
  onPress,
  border = false,
  hideChevron = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  children?: ReactNode;
  onPress?: () => void;
  border?: boolean;
  hideChevron?: boolean;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className={`px-4 active:bg-slate-50 ${border ? "border-t border-slate-100" : ""}`}
      style={{ minHeight: 54, flexDirection: "row", alignItems: "center" }}
    >
      <Ionicons name={icon} size={20} color="#64748B" />
      <Text className="ml-3 flex-1 text-base text-slate-900">{label}</Text>
      {children}
      {onPress && !hideChevron && (
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" style={{ marginLeft: 6 }} />
      )}
    </Pressable>
  );
}
