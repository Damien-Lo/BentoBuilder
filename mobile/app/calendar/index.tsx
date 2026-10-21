import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { CalendarTimeGrid } from "@/src/components/calendar/CalendarTimeGrid";
import { WebCalendarScreen } from "@/src/components/calendar/web/WebCalendarScreen";
import { useWideWeb } from "@/src/utils/useWideWeb";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";
import { FloatingHomeButton, HOME_BAR_HEIGHT } from "@/src/components/CustomTabBar";
import { AgendaView, MonthView, WeekStrip } from "@/src/components/calendar/CalendarViews";
import {
  CalendarEditSheet,
  CalendarsDrawer,
  confirmDeleteCalendar,
} from "@/src/components/calendar/CalendarSheets";
import { addDays, MONTHS_FULL, nowMinutes, shiftMonth } from "@/src/components/calendar/calendarUtils";
import {
  createCalendar,
  deleteCalendar,
  eventShown,
  getCalendars,
  getEventOccurrences,
  reorderCalendars,
  updateCalendar,
  type EventCalendar,
  type EventOccurrence,
} from "@/src/services/calendarApi";
import { buildMealFood, mealKey, type MealFood } from "@/src/components/calendar/mealFood";
import { getMealPlanRange } from "@/src/services/mealPlanApi";
import { getUsualMeals, usualAppliesOn, usualName, type UsualMeal } from "@/src/services/usualMealApi";
import { loadSettings } from "@/src/services/settingsService";
import {
  getCalendarTasks,
  scheduleTodoTask,
  type CalendarTaskFeed,
} from "@/src/services/todoApi";
import {
  SCHEDULE_STRIP_HEIGHT,
  SCHEDULE_STRIP_LOCKED_HEIGHT,
  ScheduleStrip,
  type ScheduleTarget,
} from "@/src/components/calendar/ScheduleStrip";
import { TaskBlockSheet } from "@/src/components/calendar/TaskBlockSheet";
import { taskBlockToOccurrence, taskToOccurrence } from "@/src/components/calendar/TaskChip";
import { parseLocalDate, todayStr } from "@/src/utils/mealPlan";

type CalendarView = "agenda" | "day" | "threeDay" | "month";

const VIEW_OPTIONS: { value: CalendarView; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "agenda", label: "Agenda", icon: "list-outline" },
  { value: "day", label: "Day", icon: "square-outline" },
  { value: "threeDay", label: "3-Day", icon: "grid-outline" },
  { value: "month", label: "Month", icon: "calendar-outline" },
];

// Events are fetched for a window around the focused date and refetched
// once the focus wanders near its edge.
const WINDOW_DAYS = 45;
const AGENDA_DAYS = 30;
// The planner's food is fetched for a narrower span: it's heavier, and only
// drawn on the days in view.
const MEAL_WINDOW_DAYS = 35;
const LOAD_RETRIES = 3;
const LOAD_RETRY_MS = 2500;


// The Calendar section, modelled on Outlook for iPhone: a week strip that
// pulls down into the month, Day / 3-Day time grids (drag on empty time to
// create an event), Month and Agenda views, and a drawer of calendars.
export default function CalendarScreen() {
  // A desktop browser gets its own layout; the phone screen is below, in
  // Orbit's look in the Calendar's blue (the desktop keeps its own look).
  const wide = useWideWeb();
  return (
    <OrbitSection section="calendar">
      <OrbitPage on={!wide}>{wide ? <WebCalendarScreen /> : <PhoneCalendarScreen />}</OrbitPage>
    </OrbitSection>
  );
}

function PhoneCalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = todayStr();
  const { colors: o } = useOrbitTheme();

  const [focusDate, setFocusDate] = useState(today);
  const [view, setView] = useState<CalendarView>("day");
  const [weekStartDay, setWeekStartDay] = useState(0);
  const [calendars, setCalendars] = useState<EventCalendar[]>([]);
  const [events, setEvents] = useState<EventOccurrence[]>([]);
  const [tasks, setTasks] = useState<CalendarTaskFeed>({ deadlines: [], blocks: [] });
  // The planner's food by day and meal, shown on the Meals calendar's events.
  const [mealFood, setMealFood] = useState<Map<string, MealFood>>(new Map());
  const [usualMeals, setUsualMeals] = useState<UsualMeal[]>([]);
  // Scheduling mode: pick a task from the strip, drag on the day to block
  // time for it. `schedule=<taskId>` in the URL opens straight into it
  // locked to that one task (a task's Do date row).
  const { schedule } = useLocalSearchParams<{ schedule?: string }>();
  const [scheduling, setScheduling] = useState(!!schedule);
  // The one task the strip is locked to: from the URL, or a booking's
  // "Schedule another time".
  const [lockedTask, setLockedTask] = useState(schedule);
  // What the strip has highlighted — what a drag books time for.
  const [selectedTask, setSelectedTask] = useState<ScheduleTarget | null>(null);
  const [stripRefresh, setStripRefresh] = useState(0);
  // The booked work block whose card is showing.
  const [openBlock, setOpenBlock] = useState<EventOccurrence | null>(null);
  const windowRef = useRef<{ from: string; to: string } | null>(null);
  const [now, setNow] = useState(nowMinutes());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  // undefined = closed, null = new calendar.
  const [editingCalendar, setEditingCalendar] = useState<EventCalendar | null | undefined>(undefined);
  // What to open once the drawer has finished closing (same shape).
  const afterDrawer = useRef<EventCalendar | null | undefined>(undefined);

  useEffect(() => {
    loadSettings().then((s) => setWeekStartDay(s.weekStartDay)).catch(() => {});
    const timer = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // A failed load tries again a few times by itself (the server can be slow
  // to answer when it has been idle) before giving up until the next visit.
  const loadEvents = useCallback(async (center: string, attempt = 0) => {
    const from = addDays(center, -WINDOW_DAYS);
    const to = addDays(center, WINDOW_DAYS);
    try {
      const [loaded, loadedTasks] = await Promise.all([
        getEventOccurrences(from, to),
        // Tasks are a bonus layer — never fail the calendar over them.
        getCalendarTasks(from, to).catch((): CalendarTaskFeed => ({ deadlines: [], blocks: [] })),
      ]);
      windowRef.current = { from, to };
      setEvents(loaded);
      setTasks(loadedTasks);
      // A bonus layer too: meal events still show without their food.
      Promise.all([
        getMealPlanRange(addDays(center, -MEAL_WINDOW_DAYS), addDays(center, MEAL_WINDOW_DAYS)),
        loadSettings(),
      ])
        .then(([entries, settings]) => setMealFood(buildMealFood(entries, settings.unitConversions)))
        .catch(() => {});
      getUsualMeals().then(setUsualMeals).catch(() => {});
    } catch {
      // Keep whatever was showing.
      if (attempt < LOAD_RETRIES) setTimeout(() => void loadEvents(center, attempt + 1), LOAD_RETRY_MS);
    }
  }, []);

  const loadCalendars = useCallback(async (attempt = 0) => {
    try {
      setCalendars(await getCalendars());
    } catch {
      if (attempt < LOAD_RETRIES) setTimeout(() => void loadCalendars(attempt + 1), LOAD_RETRY_MS);
      else Alert.alert("Couldn't load calendars", "Check your connection and try again.");
    }
  }, []);

  // Refetch on every return to this screen (an event may have been added
  // or edited).
  useFocusEffect(
    useCallback(() => {
      void loadCalendars();
      void loadEvents(focusDate);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Refetch when the focus nears the edge of what's loaded.
  useEffect(() => {
    const w = windowRef.current;
    if (!w || focusDate < addDays(w.from, 14) || focusDate > addDays(w.to, -AGENDA_DAYS - 3)) {
      void loadEvents(focusDate);
    }
  }, [focusDate, loadEvents]);

  const calendarsById = useMemo(() => new Map(calendars.map((c) => [c._id, c])), [calendars]);
  // Events, plus the tasks switched on for the calendar (through the
  // built-in Tasks calendar, so they hide and show with it).
  const visibleEvents = useMemo(() => {
    const tasksCalendar = calendars.find((c) => c.isTasks);
    const taskOccurrences = tasksCalendar
      ? [
          ...tasks.deadlines.map((t) => taskToOccurrence(t, tasksCalendar._id, today)),
          ...tasks.blocks.map((b) => taskBlockToOccurrence(b, tasksCalendar._id)),
        ]
      : [];
    const withFood = events.map((e) => {
      if (!e.mealSlot) return e;
      const food = mealFood.get(mealKey(e.occurrenceDate, e.mealSlot)) ?? null;
      // Usual meals are only filled in a couple of weeks ahead; beyond
      // that, name what's due instead of "Nothing planned".
      const usually =
        !food && e.occurrenceDate > today
          ? usualMeals
              .filter((u) => u.slot === e.mealSlot && usualAppliesOn(u, e.occurrenceDate))
              .map(usualName)
              .join(", ")
          : "";
      return { ...e, meal: { food, usually: usually || undefined } };
    });
    return [...taskOccurrences, ...withFood].filter((e) => eventShown(e, calendarsById.get(e.calendar)));
  }, [events, tasks, mealFood, usualMeals, calendars, calendarsById, today]);
  const eventDays = useMemo(() => {
    const days = new Set<string>();
    for (const e of visibleEvents) {
      for (let d = e.occurrenceDate; d <= e.occurrenceEndDate; d = addDays(d, 1)) days.add(d);
    }
    return days;
  }, [visibleEvents]);

  const focus = parseLocalDate(focusDate);
  const title = `${MONTHS_FULL[focus.getMonth()]}${focus.getFullYear() !== new Date().getFullYear() ? ` ${focus.getFullYear()}` : ""}`;
  const viewOption = VIEW_OPTIONS.find((o) => o.value === view)!;

  function openTask(task: NonNullable<EventOccurrence["task"]>) {
    // A subtask opens as the sheet over its top-level task.
    router.push({
      pathname: "/lists/task/[id]",
      params: task.depth > 0 ? { id: task.rootId, open: task.id } : { id: task.id },
    });
  }

  function openEvent(event: EventOccurrence) {
    const task = event.task;
    if (task && event._id.startsWith("block-")) {
      // Booked time gets its own card: removing it there frees the time
      // and leaves the task alone.
      setOpenBlock(event);
      return;
    }
    if (task) {
      openTask(task);
      return;
    }
    router.push({ pathname: "/calendar/event/[id]", params: { id: event._id, date: event.occurrenceDate } });
  }

  useEffect(() => {
    // The time grid is where blocks are drawn.
    if (scheduling) setView((v) => (v === "month" || v === "agenda" ? "day" : v));
  }, [scheduling]);

  // A block dragged out in scheduling mode books time for the selected task.
  async function scheduleBlock(date: string, startMinutes: number, endMinutes: number) {
    if (!selectedTask) {
      Alert.alert("Pick a task first", "Choose a list and a task in the strip at the bottom, then hold and drag on the day.");
      return;
    }
    try {
      await scheduleTodoTask(selectedTask._id, { date, startMinutes, endMinutes });
      // Make sure it shows: blocks are drawn through the Tasks calendar.
      const tasksCalendar = calendars.find((c) => c.isTasks);
      if (tasksCalendar && !tasksCalendar.visible) void toggleCalendar(tasksCalendar);
      await loadEvents(focusDate);
      setStripRefresh((k) => k + 1);
    } catch (error) {
      Alert.alert("Couldn't schedule", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  function newEvent(date: string, start?: number, end?: number) {
    const startMinutes = start ?? Math.min(23 * 60, (Math.floor(now / 60) + 1) * 60);
    router.push({
      pathname: "/calendar/edit",
      params: { date, start: String(startMinutes), end: String(end ?? Math.min(1440, startMinutes + 60)) },
    });
  }

  async function toggleCalendar(calendar: EventCalendar) {
    const visible = !calendar.visible;
    setCalendars((prev) => prev.map((c) => (c._id === calendar._id ? { ...c, visible } : c)));
    try {
      await updateCalendar(calendar._id, { visible });
    } catch {
      setCalendars((prev) => prev.map((c) => (c._id === calendar._id ? { ...c, visible: !visible } : c)));
    }
  }

  // Shows or hides one kind of thing in a calendar (the Kitchen's meals,
  // prep sessions or shopping trips).
  async function toggleKind(calendar: EventCalendar, kind: string) {
    const before = calendar.hiddenKinds ?? [];
    const hiddenKinds = before.includes(kind) ? before.filter((k) => k !== kind) : [...before, kind];
    setCalendars((prev) => prev.map((c) => (c._id === calendar._id ? { ...c, hiddenKinds } : c)));
    try {
      await updateCalendar(calendar._id, { hiddenKinds });
    } catch {
      setCalendars((prev) => prev.map((c) => (c._id === calendar._id ? { ...c, hiddenKinds: before } : c)));
    }
  }

  async function saveCalendar(name: string, color: string) {
    const target = editingCalendar;
    setEditingCalendar(undefined);
    try {
      if (target) await updateCalendar(target._id, { name, color });
      else await createCalendar(name, color);
      await loadCalendars();
    } catch (error) {
      Alert.alert("Couldn't save calendar", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  function removeCalendar(calendar: EventCalendar) {
    confirmDeleteCalendar(calendar, async () => {
      setEditingCalendar(undefined);
      try {
        await deleteCalendar(calendar._id);
        await Promise.all([loadCalendars(), loadEvents(focusDate)]);
      } catch (error) {
        Alert.alert("Couldn't delete calendar", error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  const dayCount = view === "threeDay" ? 3 : 1;
  // The header's round buttons.
  const roundButton = {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: o.surface,
    borderWidth: 1,
    borderColor: o.border,
  };

  return (
    <SafeAreaView className="flex-1" edges={["top", "left", "right"]} style={{ backgroundColor: o.canvas }}>
      {/* Header: on the page itself — round buttons either side of the
          month, large. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        {/* No back button — the floating home button covers that. */}
        <Tap
          onPress={() => setDrawerOpen(true)}
          accessibilityLabel="Calendars"
          style={roundButton}
          pressedStyle={{ backgroundColor: o.pill }}
        >
          <Ionicons name="calendar" size={19} color={o.ink} />
        </Tap>
        <Text style={{ flex: 1, marginLeft: 4, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }} numberOfLines={1}>
          {title}
        </Text>
        {focusDate !== today && (
          <Tap
            onPress={() => setFocusDate(today)}
            style={{ height: 32, justifyContent: "center", paddingHorizontal: 14, borderRadius: 16, backgroundColor: o.ink }}
            pressedStyle={{ opacity: 0.8 }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: o.onInk }}>Today</Text>
          </Tap>
        )}
        <Tap
          onPress={() => {
            setScheduling((v) => !v);
            setLockedTask(schedule);
            setSelectedTask(null);
          }}
          accessibilityLabel="Schedule tasks"
          accessibilityState={{ selected: scheduling }}
          // On while scheduling: filled in the Calendar's blue.
          style={[roundButton, scheduling && { backgroundColor: o.ink, borderColor: o.ink }]}
          pressedStyle={scheduling ? { opacity: 0.8 } : { backgroundColor: o.pill }}
        >
          <Ionicons name="time-outline" size={21} color={scheduling ? o.onInk : o.icon} />
        </Tap>
        <Tap
          onPress={() => setViewMenuOpen(true)}
          accessibilityLabel="Change view"
          style={roundButton}
          pressedStyle={{ backgroundColor: o.pill }}
        >
          <Ionicons name={viewOption.icon} size={20} color={o.icon} />
        </Tap>
      </View>

      {view !== "month" && (
        <WeekStrip
          focusDate={focusDate}
          today={today}
          weekStartDay={weekStartDay}
          eventDays={eventDays}
          onChangeFocus={setFocusDate}
        />
      )}

      {view === "day" || view === "threeDay" ? (
        <CalendarTimeGrid
          startDate={focusDate}
          dayCount={dayCount}
          today={today}
          nowMinutes={now}
          events={visibleEvents}
          calendarsById={calendarsById}
          onPressEvent={openEvent}
          onCreate={(date, start, end) => (scheduling ? void scheduleBlock(date, start, end) : newEvent(date, start, end))}
          onShiftDays={(days) => setFocusDate((d) => addDays(d, days))}
          onPressDay={(date) => {
            setFocusDate(date);
            setView("day");
          }}
        />
      ) : view === "month" ? (
        <MonthView
          focusDate={focusDate}
          today={today}
          weekStartDay={weekStartDay}
          events={visibleEvents}
          calendarsById={calendarsById}
          onShift={(direction) => setFocusDate((d) => shiftMonth(d, direction))}
          onPressDay={(date) => {
            setFocusDate(date);
            setView("day");
          }}
        />
      ) : (
        <AgendaView
          focusDate={focusDate}
          today={today}
          days={AGENDA_DAYS}
          events={visibleEvents}
          calendarsById={calendarsById}
          onPressEvent={openEvent}
        />
      )}

      {/* Room for the strip, so the end of the day can scroll clear of it. */}
      {scheduling && (
        <View style={{ height: (lockedTask ? SCHEDULE_STRIP_LOCKED_HEIGHT : SCHEDULE_STRIP_HEIGHT) + insets.bottom }} />
      )}

      {scheduling ? (
        <ScheduleStrip
          key={lockedTask ?? "browse"}
          lockedTaskId={lockedTask}
          bottomInset={insets.bottom}
          refreshKey={stripRefresh}
          onTarget={setSelectedTask}
          onDone={() => {
            setScheduling(false);
            setSelectedTask(null);
            // Opened from a task's Do date: go back to it. (From a booking's
            // "Schedule another time" it just returns to the calendar.)
            if (schedule && lockedTask === schedule && router.canGoBack()) router.back();
            setLockedTask(schedule);
          }}
        />
      ) : (
        <>
      {/* New event */}
      <Tap
        onPress={() => newEvent(focusDate)}
        accessibilityLabel="New event"
        style={{
          position: "absolute",
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: o.ink,
          // Level with the floating home button.
          bottom: insets.bottom + (HOME_BAR_HEIGHT - 56) / 2,
          shadowColor: o.fill,
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
        pressedStyle={{ opacity: 0.85 }}
      >
        <Ionicons name="add" size={30} color={o.onInk} />
      </Tap>

      {/* The same centre home button as the other sections, floating */}
      <FloatingHomeButton />
        </>
      )}

      {/* View menu */}
      <Modal visible={viewMenuOpen} transparent animationType="fade" onRequestClose={() => setViewMenuOpen(false)}>
        <Pressable className="flex-1" style={{ backgroundColor: o.scrim }} onPress={() => setViewMenuOpen(false)}>
          <View
            style={{
              position: "absolute",
              right: 16,
              top: insets.top + 52,
              width: 208,
              overflow: "hidden",
              borderRadius: 18,
              borderWidth: 1,
              borderColor: o.border,
              backgroundColor: o.surface,
            }}
          >
            {VIEW_OPTIONS.map((option, i) => {
              const on = option.value === view;
              return (
                <Tap
                  key={option.value}
                  onPress={() => {
                    setView(option.value);
                    setViewMenuOpen(false);
                  }}
                  accessibilityState={{ selected: on }}
                  style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: o.border }}
                  pressedStyle={{ backgroundColor: o.pill }}
                >
                  <Ionicons name={option.icon} size={19} color={on ? o.ink : o.muted} />
                  <Text style={{ marginLeft: 12, flex: 1, fontSize: 16, fontWeight: on ? "600" : "400", color: on ? o.ink : o.text }}>
                    {option.label}
                  </Text>
                  {on && <Ionicons name="checkmark" size={19} color={o.ink} />}
                </Tap>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      <CalendarsDrawer
        visible={drawerOpen}
        calendars={calendars}
        onClose={() => setDrawerOpen(false)}
        onToggle={(c) => void toggleCalendar(c)}
        onToggleKind={(c, kind) => void toggleKind(c, kind)}
        onKindSettings={(kind) => {
          setDrawerOpen(false);
          router.push(kind === "meals" ? "/calendar/meal-times" : { pathname: "/calendar/sessions", params: { kind } });
        }}
        onEdit={(c) => {
          afterDrawer.current = c;
          setDrawerOpen(false);
        }}
        onMealTimes={() => {
          setDrawerOpen(false);
          router.push("/calendar/meal-times");
        }}
        onReorder={(ids) => {
          // Show it at once; the saved order follows.
          setCalendars((prev) => [...prev].sort((a, b) => ids.indexOf(a._id) - ids.indexOf(b._id)));
          reorderCalendars(ids).then(setCalendars).catch(() => void loadCalendars());
        }}
        onAdd={() => {
          afterDrawer.current = null;
          setDrawerOpen(false);
        }}
        onClosed={() => {
          if (afterDrawer.current !== undefined) {
            setEditingCalendar(afterDrawer.current);
            afterDrawer.current = undefined;
          }
        }}
      />

      <CalendarEditSheet
        visible={editingCalendar !== undefined}
        calendar={editingCalendar ?? null}
        onClose={() => setEditingCalendar(undefined)}
        onSave={(name, color) => void saveCalendar(name, color)}
        onDelete={removeCalendar}
      />
      <TaskBlockSheet
        block={openBlock}
        onClose={() => setOpenBlock(null)}
        onChanged={() => {
          setStripRefresh((k) => k + 1);
          void loadEvents(focusDate);
        }}
        onRemoved={() => {
          setOpenBlock(null);
          setStripRefresh((k) => k + 1);
          void loadEvents(focusDate);
        }}
        onOpenTask={openTask}
        onScheduleAnother={(taskId) => {
          setSelectedTask(null);
          setLockedTask(taskId);
          setScheduling(true);
        }}
      />
    </SafeAreaView>
  );
}
