import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";

import { KitchenSessionNeeds } from "@/src/components/planner/KitchenSessionNeeds";
import { showActions } from "@/src/components/todo/theme";
import { Button, hoverable, Segmented } from "@/src/components/web/ui";
import { deleteCalendarEvent, isAssistantCalendar, KITCHEN_KINDS, type EventCalendar, type EventOccurrence, type SeriesScope } from "@/src/services/calendarApi";
import { getTodoTask, scheduleTodoTask } from "@/src/services/todoApi";
import { parseLocalDate } from "@/src/utils/mealPlan";
import { SECTION_PALETTE, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

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
import { DangerButton, WebEventEditor } from "./WebEventEditor";

// The Calendar in a desktop browser, laid out like Outlook on the web: a
// left panel (new event, a mini month to jump around, the calendars to
// tick on and off) beside a toolbar and the day / work week / week / month
// view. Same data, colours and behaviour as the phone calendar. In Orbit's
// look, in the Calendar's blue: the toolbar on the page's canvas, the panel
// and the view as white cards.

type View_ = "day" | "workweek" | "week" | "month";
const VIEWS: { value: View_; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "workweek", label: "Work week" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const PANEL_WIDTH = 260;
type Hover = { hovered?: boolean };
type IconName = keyof typeof Ionicons.glyphMap;
// The Calendar's pale wash: the task-booking banner.
const TINT = SECTION_PALETTE.calendar.tint;

export function WebCalendarScreen() {
  const router = useRouter();
  const { colors: c } = useOrbitTheme();
  const [view, setView] = useState<View_>("week");
  const [focusDate, setFocusDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const data = useCalendarData(focusDate);
  const { today, weekStartDay, calendars, calendarsById, visibleEvents, reload, toggleCalendar } = data;
  const [now, setNow] = useState(currentMinutes());
  const [peek, setPeek] = useState<EventOccurrence | null>(null);
  const [openBlock, setOpenBlock] = useState<EventOccurrence | null>(null);
  // undefined = closed, null = a new calendar.
  const [editingCalendar, setEditingCalendar] = useState<EventCalendar | null | undefined>(undefined);
  // Calendars that are switched off sit in a collapsed section.
  const [showHidden, setShowHidden] = useState(false);
  // Calendars you keep yourself, and the ones the app's sections fill for
  // you (the Kitchen's meals and sessions, your tasks).
  const ownCalendars = calendars.filter((c) => !isAssistantCalendar(c));
  const assistants = calendars.filter(isAssistantCalendar);
  const shownCalendars = ownCalendars.filter((c) => c.visible);
  const hiddenCalendars = ownCalendars.filter((c) => !c.visible);
  // The event card: a new event's starting point, or the event being edited.
  const [editor, setEditor] = useState<EventDraft | null>(null);

  // Booking time for a task: while this is set, a click or drag on a day
  // books a block for the task instead of starting an event. `schedule=<id>`
  // in the address opens straight into it — a task's "Schedule" does that.
  const { schedule } = useLocalSearchParams<{ schedule?: string }>();
  const [scheduling, setScheduling] = useState<{ id: string; title: string; blocks: number; fromTask: boolean } | null>(null);
  function startScheduling(id: string, fromTask: boolean) {
    setScheduling({ id, title: "", blocks: 0, fromTask });
    // Blocks are drawn on the time grid.
    setView((v) => (v === "month" ? "week" : v));
    getTodoTask(id).then(
      (task) => setScheduling((prev) => (prev?.id === id ? { ...prev, title: task.title, blocks: task.workBlocks.length } : prev)),
      () => setScheduling((prev) => (prev?.id === id ? null : prev)),
    );
  }
  useEffect(() => {
    if (schedule) startScheduling(schedule, true);
  }, [schedule]);
  async function bookBlock(date: string, startMinutes: number, endMinutes: number) {
    if (!scheduling) return;
    try {
      await scheduleTodoTask(scheduling.id, { date, startMinutes, endMinutes });
      setScheduling((prev) => prev && { ...prev, blocks: prev.blocks + 1 });
      // Make sure it shows: booked time is drawn through the Tasks calendar.
      const tasksCalendar = calendars.find((c) => c.isTasks);
      if (tasksCalendar && !tasksCalendar.visible) void toggleCalendar(tasksCalendar);
      reload();
    } catch (error) {
      Alert.alert("Couldn't schedule", error instanceof Error ? error.message : "Something went wrong.");
    }
  }
  function stopScheduling() {
    const fromTask = scheduling?.fromTask;
    setScheduling(null);
    // Back to the task it was opened from.
    if (fromTask && router.canGoBack()) router.back();
    else if (schedule) router.setParams({ schedule: undefined });
  }

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
            style={hoverable(({ hovered }: Hover) => ({
              flexDirection: "row",
              alignItems: "center",
              height: 32,
              paddingHorizontal: 6,
              marginHorizontal: -6,
              borderRadius: 10,
              backgroundColor: hovered ? c.pill : "transparent",
            }))}
          >
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: calendar.visible ? color : c.surface,
                borderWidth: 2,
                borderColor: color,
              }}
            >
              {calendar.visible && <Ionicons name="checkmark" size={11} color="#FFFFFF" />}
            </View>
            <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontSize: 13, color: calendar.visible ? c.text : c.faint }}>
              {calendar.name}
            </Text>
            {calendar.isMeals && (
              <Pressable onPress={() => router.push("/calendar/meal-times")} accessibilityLabel="Meal times" hitSlop={4}>
                <Ionicons name="time-outline" size={15} color={c.ink} style={{ marginRight: 8 }} />
              </Pressable>
            )}
            <Pressable onPress={() => setEditingCalendar(calendar)} accessibilityLabel={`Edit ${calendar.name}`} hitSlop={4}>
              <Ionicons name="ellipsis-horizontal" size={15} color={c.faint} />
            </Pressable>
          </Pressable>
        );
  };

  // (The two cards: the panel and the view.)
  const card = { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 18, overflow: "hidden" as const };

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
      {/* Toolbar: the days on show as the page's title */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Button label="Today" onPress={() => setFocusDate(today)} />
        <RoundButton icon="chevron-back" label="Previous" onPress={() => step(-1)} colors={c} />
        <RoundButton icon="chevron-forward" label="Next" onPress={() => step(1)} colors={c} />
        <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: c.text }}>
          {title}
        </Text>
        <Segmented options={VIEWS} value={view} onChange={setView} />
        <View style={{ width: 4 }} />
        <Button label="New event" icon="add" kind="primary" onPress={() => newEvent(focusDate)} />
      </View>

      <View style={{ flex: 1, minHeight: 0, flexDirection: "row", gap: 16 }}>
        {/* Left panel: a mini month to jump around, the calendars to tick on and off */}
        <View style={[card, { width: PANEL_WIDTH }]}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            <WebMiniMonth focusDate={focusDate} today={today} weekStartDay={weekStartDay} shownDays={view === "month" ? [] : days} onPick={setFocusDate} />

            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 22, marginBottom: 6 }}>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: "700", letterSpacing: 1, color: c.faint }}>MY CALENDARS</Text>
              <Pressable
                onPress={() => setEditingCalendar(null)}
                accessibilityLabel="New calendar"
                style={hoverable(({ hovered }: Hover) => ({
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: hovered ? c.pill : "transparent",
                }))}
              >
                <Ionicons name="add" size={16} color={c.icon} />
              </Pressable>
            </View>

            {shownCalendars.map(calendarRow)}

            {/* Calendars that are switched off, tucked away until wanted. */}
            {hiddenCalendars.length > 0 && (
              <>
                <Pressable
                  onPress={() => setShowHidden((v) => !v)}
                  style={hoverable(({ hovered }: Hover) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    height: 32,
                    marginTop: 6,
                    paddingHorizontal: 6,
                    marginHorizontal: -6,
                    borderRadius: 10,
                    backgroundColor: hovered ? c.pill : "transparent",
                  }))}
                >
                  <Ionicons name={showHidden ? "chevron-down" : "chevron-forward"} size={14} color={c.muted} />
                  <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, fontWeight: "600", color: c.muted }}>
                    Hidden calendars ({hiddenCalendars.length})
                  </Text>
                </Pressable>
                {showHidden && hiddenCalendars.map(calendarRow)}
              </>
            )}

            {/* What the app's sections put on the calendar for you. */}
            <Text style={{ marginTop: 22, marginBottom: 6, fontSize: 11, fontWeight: "700", letterSpacing: 1, color: c.faint }}>ASSISTANTS</Text>
            {assistants.map((calendar) => (
              <View key={calendar._id}>
                {calendarRow(calendar)}
                {/* The Kitchen's kinds, each on or off by itself. */}
                {calendar.isKitchen &&
                  calendar.visible &&
                  KITCHEN_KINDS.map((kind) => {
                    const on = !(calendar.hiddenKinds ?? []).includes(kind.value);
                    const color = calendarColor(calendar);
                    return (
                      <Pressable
                        key={kind.value}
                        onPress={() => void data.toggleKind(calendar, kind.value)}
                        style={hoverable(({ hovered }: Hover) => ({ flexDirection: "row", alignItems: "center", height: 28, paddingLeft: 24, paddingRight: 6, marginHorizontal: -6, borderRadius: 10, backgroundColor: hovered ? c.pill : "transparent" }))}
                      >
                        <View style={{ width: 13, height: 13, borderRadius: 3, alignItems: "center", justifyContent: "center", backgroundColor: on ? color : c.surface, borderWidth: 1.5, borderColor: color }}>
                          {on && <Ionicons name="checkmark" size={9} color="#FFFFFF" />}
                        </View>
                        <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, color: on ? c.icon : c.faint }}>{kind.label}</Text>
                        {/* Its regular times: the meals', or this kind of session's. */}
                        <Pressable
                          onPress={() => router.push(kind.value === "meals" ? "/calendar/meal-times" : { pathname: "/calendar/sessions", params: { kind: kind.value } })}
                          accessibilityLabel={`${kind.label}: regular times`}
                          hitSlop={4}
                        >
                          <Ionicons name="settings-outline" size={13} color={c.faint} />
                        </Pressable>
                      </Pressable>
                    );
                  })}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* The view */}
        <View style={[card, { flex: 1 }]}>
        {scheduling && (
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: 50, paddingHorizontal: 16, gap: 10, backgroundColor: TINT, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Ionicons name="time-outline" size={18} color={c.ink} />
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, color: c.text }}>
              Booking time for <Text style={{ fontWeight: "700" }}>{scheduling.title || "…"}</Text>
            </Text>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: c.ink }}>
              {view === "month" ? "Switch to a day or week view, then drag" : "Click a time for an hour, or drag out a block"}
              {scheduling.blocks > 0 ? ` · ${scheduling.blocks} booked` : ""}
            </Text>
            <Button label="Done" kind="primary" small onPress={stopScheduling} />
          </View>
        )}

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
            onCreate={scheduling ? (date, start, end) => void bookBlock(date, start, end) : newEvent}
            onPressDay={(date) => {
              setFocusDate(date);
              setView("day");
            }}
          />
        )}
        </View>
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
        onScheduleAnother={(taskId) => {
          setOpenBlock(null);
          startScheduling(taskId, false);
        }}
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

// The toolbar's back and forward: white circles with a hairline.
function RoundButton({ icon, label, onPress, colors: c }: { icon: IconName; label: string; onPress: () => void; colors: OrbitColors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={hoverable(({ hovered }: Hover) => ({ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border, backgroundColor: hovered ? c.pill : c.surface }))}
    >
      <Ionicons name={icon} size={18} color={c.text} />
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
  const { colors: c } = useOrbitTheme();
  if (!event) return null;
  const color = calendarColor(calendar);
  const sameDay = event.occurrenceDate === event.occurrenceEndDate;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.scrim, padding: 24 }}>
        <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} />
        <View style={{ width: "100%", maxWidth: 420, borderRadius: 18, backgroundColor: c.surface, overflow: "hidden", boxShadow: "0 16px 40px rgba(15,23,42,0.25)" }}>
          <View style={{ height: 6, backgroundColor: color }} />
          <View style={{ padding: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: c.text }}>{event.title}</Text>
              <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
                <Ionicons name="close" size={20} color={c.muted} />
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
              <PeekRow icon={event.meal.food?.eaten ? "checkmark-circle" : "restaurant-outline"} tint={event.meal.food?.eaten ? c.success : undefined}>
                {mealLine(event)}
              </PeekRow>
            )}
            {!!event.description && <PeekRow icon="reorder-three-outline">{event.description}</PeekRow>}
            <PeekRow icon="calendar-outline">{calendar?.name ?? "Calendar"}</PeekRow>

            {/* A prep session or shopping trip: what it's for, from the plan. */}
            {!!event.kitchenKind && (
              <ScrollView style={{ marginTop: 14, maxHeight: 320 }}>
                <KitchenSessionNeeds eventId={event._id} date={event.occurrenceDate} kind={event.kitchenKind} onNavigate={onClose} />
              </ScrollView>
            )}

            <View style={{ marginTop: 18, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Button label="Edit" icon="create-outline" kind="primary" onPress={() => onEdit(event)} />
              <DangerButton label={event.repeat && event.mealAuto ? "Skip this day" : "Delete"} icon="trash-outline" onPress={() => onDelete(event)} colors={c} />
              <View style={{ flex: 1 }} />
              {/* A meal's page has its food: what's planned, ticking it off, adding more. */}
              {event.meal && <Button label="Open meal" icon="restaurant-outline" onPress={() => onOpen(event)} />}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PeekRow({ icon, tint, children }: { icon: IconName; tint?: string; children: React.ReactNode }) {
  const { colors: c } = useOrbitTheme();
  return (
    <View style={{ marginTop: 12, flexDirection: "row", alignItems: "flex-start" }}>
      <Ionicons name={icon} size={17} color={tint ?? c.muted} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, marginLeft: 10, fontSize: 14, lineHeight: 20, color: c.icon }}>{children}</Text>
    </View>
  );
}
