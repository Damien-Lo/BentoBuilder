import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";

import { showActions } from "@/src/components/todo/theme";
import { deleteCalendarEvent, type EventCalendar, type EventOccurrence, type SeriesScope } from "@/src/services/calendarApi";
import { parseLocalDate } from "@/src/utils/mealPlan";

import { CalendarEditSheet, confirmDeleteCalendar } from "../CalendarSheets";
import {
  addDays,
  calendarColor,
  durationLabel,
  longDateLabel,
  minutesLabel,
  MONTHS_FULL,
  MONTHS_SHORT,
  nowMinutes as currentMinutes,
  shiftMonth,
  weekOf,
} from "../calendarUtils";
import { mealLine } from "../mealFood";
import { TaskBlockSheet } from "../TaskBlockSheet";
import { useCalendarData } from "../useCalendarData";
import type { EventDraft } from "../useEventForm";
import { WebMiniMonth, WebMonthGrid, WebTimeGrid } from "./WebCalendarGrids";
import { WebEventEditor } from "./WebEventEditor";

// The Calendar in a desktop browser, laid out like Outlook on the web: a
// left panel (new event, a mini month to jump around, the calendars to
// tick on and off) beside a toolbar and the day / work week / week / month
// view. Same data, colours and behaviour as the phone calendar.

type View_ = "day" | "workweek" | "week" | "month";
const VIEWS: { value: View_; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "workweek", label: "Work week" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const PANEL_WIDTH = 260;

export function WebCalendarScreen() {
  const router = useRouter();
  const [view, setView] = useState<View_>("week");
  const [focusDate, setFocusDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const data = useCalendarData(focusDate);
  const { today, weekStartDay, calendars, calendarsById, visibleEvents, reload } = data;
  const [now, setNow] = useState(currentMinutes());
  const [peek, setPeek] = useState<EventOccurrence | null>(null);
  const [openBlock, setOpenBlock] = useState<EventOccurrence | null>(null);
  // undefined = closed, null = a new calendar.
  const [editingCalendar, setEditingCalendar] = useState<EventCalendar | null | undefined>(undefined);
  // Calendars that are switched off sit in a collapsed section.
  const [showHidden, setShowHidden] = useState(false);
  const shownCalendars = calendars.filter((c) => c.visible);
  const hiddenCalendars = calendars.filter((c) => !c.visible);
  // The event card: a new event's starting point, or the event being edited.
  const [editor, setEditor] = useState<EventDraft | null>(null);

  // `new=<date>` in the address opens straight into a new event (Home's
  // "New event" button).
  const { new: newParam } = useLocalSearchParams<{ new?: string }>();
  useEffect(() => {
    if (!newParam || !/^\d{4}-\d{2}-\d{2}$/.test(newParam)) return;
    setFocusDate(newParam);
    const start = Math.min(23 * 60, (Math.floor(currentMinutes() / 60) + 1) * 60);
    setEditor({ mode: "new", date: newParam, startMinutes: start, endMinutes: Math.min(1440, start + 60) });
    router.setParams({ new: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParam]);

  useEffect(() => {
    const timer = setInterval(() => setNow(currentMinutes()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Back from adding or editing something: show it.
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const week = weekOf(focusDate, weekStartDay);
  const days =
    view === "day" ? [focusDate] : view === "workweek" ? week.filter((d) => ![0, 6].includes(parseLocalDate(d).getDay())) : week;

  const step = (direction: -1 | 1) =>
    setFocusDate((d) => (view === "month" ? shiftMonth(d, direction) : addDays(d, direction * (view === "day" ? 1 : 7))));

  const title = (() => {
    const f = parseLocalDate(focusDate);
    if (view === "month") return `${MONTHS_FULL[f.getMonth()]} ${f.getFullYear()}`;
    if (view === "day") return longDateLabel(focusDate);
    const a = parseLocalDate(days[0]);
    const b = parseLocalDate(days[days.length - 1]);
    if (a.getMonth() === b.getMonth()) return `${MONTHS_FULL[a.getMonth()]} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}`;
    return `${MONTHS_SHORT[a.getMonth()]} ${a.getDate()} – ${MONTHS_SHORT[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
  })();

  function newEvent(date: string, start?: number, end?: number) {
    const startMinutes = start ?? Math.min(23 * 60, (Math.floor(now / 60) + 1) * 60);
    setEditor({ mode: "new", date, startMinutes, endMinutes: end ?? Math.min(1440, startMinutes + 60) });
  }

  // A repeating event asks which occurrences the edit is for first. A
  // regular meal time can only be changed a day at a time here.
  function editEvent(event: EventOccurrence) {
    const open = (scope: SeriesScope | null) => {
      setPeek(null);
      setEditor({ mode: "edit", id: event._id, occurrence: event.occurrenceDate, scope });
    };
    if (!event.repeat) open(null);
    else if (event.mealAuto) open("one");
    else
      showActions("Edit repeating event", [
        { label: "Only this event", onPress: () => open("one") },
        { label: "This and following events", onPress: () => open("following") },
        { label: "All events in the series", onPress: () => open("all") },
      ]);
  }

  function deleteEvent(event: EventOccurrence) {
    const remove = (scope: SeriesScope) => {
      setPeek(null);
      deleteCalendarEvent(event._id, scope, event.occurrenceDate).then(reload, (error) =>
        Alert.alert("Couldn't delete", error instanceof Error ? error.message : "Something went wrong."),
      );
    };
    if (event.repeat && event.mealAuto) {
      Alert.alert("Skip this meal?", "Only this day's block is removed. To stop it every week, change your meal times.", [
        { text: "Cancel", style: "cancel" },
        { text: "Skip this day", style: "destructive", onPress: () => remove("one") },
      ]);
    } else if (event.repeat) {
      showActions("Delete repeating event", [
        { label: "Delete this event", destructive: true, onPress: () => remove("one") },
        { label: "Delete this and following events", destructive: true, onPress: () => remove("following") },
        { label: "Delete all events in the series", destructive: true, onPress: () => remove("all") },
      ]);
    } else {
      Alert.alert(`Delete "${event.title}"?`, undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => remove("all") },
      ]);
    }
  }

  function openTask(task: NonNullable<EventOccurrence["task"]>) {
    router.push({
      pathname: "/lists/task/[id]",
      params: task.depth > 0 ? { id: task.rootId, open: task.id } : { id: task.id },
    });
  }

  function pressEvent(event: EventOccurrence) {
    if (event.task && event._id.startsWith("block-")) setOpenBlock(event);
    else if (event.task) openTask(event.task);
    else setPeek(event);
  }

  const openEvent = (event: EventOccurrence) =>
    router.push({ pathname: "/calendar/event/[id]", params: { id: event._id, date: event.occurrenceDate } });

  const calendarRow = (calendar: EventCalendar) => {
        const color = calendarColor(calendar);
        return (
          <Pressable
            key={calendar._id}
            onPress={() => void data.toggleCalendar(calendar)}
            style={({ hovered }: { hovered?: boolean }) => ({
              flexDirection: "row",
              alignItems: "center",
              height: 32,
              paddingHorizontal: 6,
              marginHorizontal: -6,
              borderRadius: 8,
              backgroundColor: hovered ? "#EEF2F7" : "transparent",
            })}
          >
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: calendar.visible ? color : "#FFFFFF",
                borderWidth: 2,
                borderColor: color,
              }}
            >
              {calendar.visible && <Ionicons name="checkmark" size={11} color="#FFFFFF" />}
            </View>
            <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontSize: 13, color: calendar.visible ? "#0F172A" : "#94A3B8" }}>
              {calendar.name}
            </Text>
            {calendar.isMeals && (
              <Pressable onPress={() => router.push("/calendar/meal-times")} accessibilityLabel="Meal times" hitSlop={4}>
                <Ionicons name="time-outline" size={15} color="#2563EB" style={{ marginRight: 8 }} />
              </Pressable>
            )}
            <Pressable onPress={() => setEditingCalendar(calendar)} accessibilityLabel={`Edit ${calendar.name}`} hitSlop={4}>
              <Ionicons name="ellipsis-horizontal" size={15} color="#94A3B8" />
            </Pressable>
          </Pressable>
        );
  };

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: "#FFFFFF" }}>
      {/* Left panel */}
      <View style={{ width: PANEL_WIDTH, borderRightWidth: 1, borderRightColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
        <View style={{ padding: 16, paddingBottom: 12 }}>
          <Pressable
            onPress={() => newEvent(focusDate)}
            style={({ hovered }: { hovered?: boolean }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              height: 40,
              borderRadius: 12,
              backgroundColor: hovered ? "#1D4ED8" : "#2563EB",
            })}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>New event</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <WebMiniMonth focusDate={focusDate} today={today} weekStartDay={weekStartDay} shownDays={view === "month" ? [] : days} onPick={setFocusDate} />

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 22, marginBottom: 6 }}>
            <Text style={{ flex: 1, fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#94A3B8" }}>MY CALENDARS</Text>
            <Pressable
              onPress={() => setEditingCalendar(null)}
              accessibilityLabel="New calendar"
              style={({ hovered }: { hovered?: boolean }) => ({
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: hovered ? "#E2E8F0" : "transparent",
              })}
            >
              <Ionicons name="add" size={16} color="#475569" />
            </Pressable>
          </View>

          {shownCalendars.map(calendarRow)}

          {/* Calendars that are switched off, tucked away until wanted. */}
          {hiddenCalendars.length > 0 && (
            <>
              <Pressable
                onPress={() => setShowHidden((v) => !v)}
                style={({ hovered }: { hovered?: boolean }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  height: 32,
                  marginTop: 6,
                  paddingHorizontal: 6,
                  marginHorizontal: -6,
                  borderRadius: 8,
                  backgroundColor: hovered ? "#EEF2F7" : "transparent",
                })}
              >
                <Ionicons name={showHidden ? "chevron-down" : "chevron-forward"} size={14} color="#64748B" />
                <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, fontWeight: "600", color: "#64748B" }}>
                  Hidden calendars ({hiddenCalendars.length})
                </Text>
              </Pressable>
              {showHidden && hiddenCalendars.map(calendarRow)}
            </>
          )}
        </ScrollView>
      </View>

      {/* Toolbar + view */}
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            height: 56,
            paddingHorizontal: 16,
            gap: 8,
            borderBottomWidth: 1,
            borderBottomColor: "#E2E8F0",
          }}
        >
          <ToolbarButton label="Today" onPress={() => setFocusDate(today)} outlined />
          <IconButton icon="chevron-back" label="Previous" onPress={() => step(-1)} />
          <IconButton icon="chevron-forward" label="Next" onPress={() => step(1)} />
          <Text numberOfLines={1} style={{ flex: 1, marginLeft: 6, fontSize: 19, fontWeight: "700", color: "#0F172A" }}>
            {title}
          </Text>
          <View style={{ flexDirection: "row", borderRadius: 10, backgroundColor: "#F1F5F9", padding: 3 }}>
            {VIEWS.map((option) => {
              const on = view === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setView(option.value)}
                  style={({ hovered }: { hovered?: boolean }) => ({
                    paddingHorizontal: 12,
                    height: 30,
                    justifyContent: "center",
                    borderRadius: 8,
                    backgroundColor: on ? "#FFFFFF" : hovered ? "#E2E8F0" : "transparent",
                    boxShadow: on ? "0 1px 2px rgba(15,23,42,0.12)" : undefined,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: on ? "700" : "500", color: on ? "#1D4ED8" : "#475569" }}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {view === "month" ? (
          <WebMonthGrid
            focusDate={focusDate}
            today={today}
            weekStartDay={weekStartDay}
            events={visibleEvents}
            calendarsById={calendarsById}
            onPressEvent={pressEvent}
            onPressDay={(date) => {
              setFocusDate(date);
              setView("day");
            }}
          />
        ) : (
          <WebTimeGrid
            // A different set of columns starts scrolled to the morning again.
            key={view}
            days={days}
            today={today}
            nowMinutes={now}
            events={visibleEvents}
            calendarsById={calendarsById}
            onPressEvent={pressEvent}
            onCreate={newEvent}
            onPressDay={(date) => {
              setFocusDate(date);
              setView("day");
            }}
          />
        )}
      </View>

      <EventPeek
        event={peek}
        calendar={peek ? calendarsById.get(peek.calendar) : undefined}
        onClose={() => setPeek(null)}
        onOpen={(event) => {
          setPeek(null);
          openEvent(event);
        }}
        onEdit={editEvent}
        onDelete={deleteEvent}
      />

      <WebEventEditor
        draft={editor}
        calendars={calendars}
        calendarsById={calendarsById}
        events={visibleEvents}
        weekStartDay={weekStartDay}
        today={today}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null);
          reload();
        }}
      />

      <TaskBlockSheet
        block={openBlock}
        onClose={() => setOpenBlock(null)}
        onChanged={reload}
        onRemoved={() => {
          setOpenBlock(null);
          reload();
        }}
        onOpenTask={openTask}
        // Booking more time by dragging is a phone gesture for now.
        onScheduleAnother={(taskId) => router.push({ pathname: "/lists/task/[id]", params: { id: taskId } })}
      />

      <CalendarEditSheet
        visible={editingCalendar !== undefined}
        calendar={editingCalendar ?? null}
        onClose={() => setEditingCalendar(undefined)}
        onSave={(name, color) => {
          const target = editingCalendar ?? null;
          setEditingCalendar(undefined);
          void data.saveCalendar(target, name, color);
        }}
        onDelete={(calendar) =>
          confirmDeleteCalendar(calendar, () => {
            setEditingCalendar(undefined);
            void data.removeCalendar(calendar);
          })
        }
      />
    </View>
  );
}

function ToolbarButton({ label, onPress, outlined }: { label: string; onPress: () => void; outlined?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: { hovered?: boolean }) => ({
        height: 34,
        paddingHorizontal: 14,
        justifyContent: "center",
        borderRadius: 10,
        borderWidth: outlined ? 1 : 0,
        borderColor: "#CBD5E1",
        backgroundColor: hovered ? "#F1F5F9" : "#FFFFFF",
      })}
    >
      <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155" }}>{label}</Text>
    </Pressable>
  );
}

function IconButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ hovered }: { hovered?: boolean }) => ({
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: hovered ? "#F1F5F9" : "transparent",
      })}
    >
      <Ionicons name={icon} size={18} color="#334155" />
    </Pressable>
  );
}

// A quick look at an event without leaving the grid, as Outlook's card does.
function EventPeek({
  event,
  calendar,
  onClose,
  onOpen,
  onEdit,
  onDelete,
}: {
  event: EventOccurrence | null;
  calendar: EventCalendar | undefined;
  onClose: () => void;
  onOpen: (event: EventOccurrence) => void;
  onEdit: (event: EventOccurrence) => void;
  onDelete: (event: EventOccurrence) => void;
}) {
  if (!event) return null;
  const color = calendarColor(calendar);
  const sameDay = event.occurrenceDate === event.occurrenceEndDate;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.3)", padding: 24 }}>
        <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} />
        <View style={{ width: "100%", maxWidth: 420, borderRadius: 20, backgroundColor: "#FFFFFF", overflow: "hidden", boxShadow: "0 16px 40px rgba(15,23,42,0.25)" }}>
          <View style={{ height: 6, backgroundColor: color }} />
          <View style={{ padding: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#0F172A" }}>{event.title}</Text>
              <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            <PeekRow icon="time-outline">
              {longDateLabel(event.occurrenceDate)}
              {event.allDay
                ? sameDay
                  ? " · All day"
                  : ` – ${longDateLabel(event.occurrenceEndDate)}`
                : `\n${minutesLabel(event.startMinutes)} – ${minutesLabel(event.endMinutes)}${
                    sameDay ? ` (${durationLabel(event.endMinutes - event.startMinutes)})` : ""
                  }`}
            </PeekRow>
            {!!event.repeat && <PeekRow icon="repeat">Repeats</PeekRow>}
            {!!event.location && <PeekRow icon="location-outline">{event.location}</PeekRow>}
            {event.meal && (
              <PeekRow icon={event.meal.food?.eaten ? "checkmark-circle" : "restaurant-outline"} tint={event.meal.food?.eaten ? "#16A34A" : undefined}>
                {mealLine(event)}
              </PeekRow>
            )}
            {!!event.description && <PeekRow icon="reorder-three-outline">{event.description}</PeekRow>}
            <PeekRow icon="calendar-outline">{calendar?.name ?? "Calendar"}</PeekRow>

            <View style={{ marginTop: 18, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <PeekButton label="Edit" icon="create-outline" primary onPress={() => onEdit(event)} />
              <PeekButton label={event.repeat && event.mealAuto ? "Skip this day" : "Delete"} icon="trash-outline" danger onPress={() => onDelete(event)} />
              <View style={{ flex: 1 }} />
              {/* A meal's page has its food: what's planned, ticking it off, adding more. */}
              {event.meal && <PeekButton label="Open meal" icon="restaurant-outline" onPress={() => onOpen(event)} />}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PeekButton({
  label,
  icon,
  primary,
  danger,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  primary?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const text = primary ? "#FFFFFF" : danger ? "#DC2626" : "#334155";
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: { hovered?: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: primary ? 0 : 1,
        borderColor: danger ? "#FECACA" : "#CBD5E1",
        backgroundColor: primary ? (hovered ? "#1D4ED8" : "#2563EB") : hovered ? (danger ? "#FEF2F2" : "#F1F5F9") : "#FFFFFF",
      })}
    >
      <Ionicons name={icon} size={15} color={text} style={{ marginRight: 6 }} />
      <Text style={{ fontSize: 13, fontWeight: "700", color: text }}>{label}</Text>
    </Pressable>
  );
}

function PeekRow({ icon, tint, children }: { icon: keyof typeof Ionicons.glyphMap; tint?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 12, flexDirection: "row", alignItems: "flex-start" }}>
      <Ionicons name={icon} size={17} color={tint ?? "#64748B"} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, marginLeft: 10, fontSize: 14, lineHeight: 20, color: "#334155" }}>{children}</Text>
    </View>
  );
}
