import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { CalendarTimeGrid } from "@/src/components/calendar/CalendarTimeGrid";
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
  getCalendars,
  getEventOccurrences,
  updateCalendar,
  type EventCalendar,
  type EventOccurrence,
} from "@/src/services/calendarApi";
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
const LOAD_RETRIES = 3;
const LOAD_RETRY_MS = 2500;


// The Calendar section, modelled on Outlook for iPhone: a week strip that
// pulls down into the month, Day / 3-Day time grids (drag on empty time to
// create an event), Month and Agenda views, and a drawer of calendars.
export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = todayStr();

  const [focusDate, setFocusDate] = useState(today);
  const [view, setView] = useState<CalendarView>("day");
  const [weekStartDay, setWeekStartDay] = useState(0);
  const [calendars, setCalendars] = useState<EventCalendar[]>([]);
  const [events, setEvents] = useState<EventOccurrence[]>([]);
  const [tasks, setTasks] = useState<CalendarTaskFeed>({ deadlines: [], blocks: [] });
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
    return [...taskOccurrences, ...events].filter((e) => calendarsById.get(e.calendar)?.visible ?? true);
  }, [events, tasks, calendars, calendarsById, today]);
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

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "left", "right"]}>
      {/* Header */}
      <View className="flex-row items-center bg-white px-3 pb-2 pt-1">
        {/* No back button — the floating home button covers that. */}
        <Pressable
          onPress={() => setDrawerOpen(true)}
          accessibilityLabel="Calendars"
          className="ml-1 h-10 w-10 items-center justify-center rounded-xl bg-blue-50 active:bg-blue-100"
        >
          <Ionicons name="calendar" size={20} color="#2563EB" />
        </Pressable>
        <Text className="ml-3 flex-1 text-3xl font-bold text-slate-950" numberOfLines={1}>
          {title}
        </Text>
        {focusDate !== today && (
          <Pressable
            onPress={() => setFocusDate(today)}
            className="mr-1 h-9 justify-center rounded-full bg-slate-100 px-3 active:bg-slate-200"
          >
            <Text className="text-sm font-semibold text-slate-700">Today</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            setScheduling((v) => !v);
            setLockedTask(schedule);
            setSelectedTask(null);
          }}
          accessibilityLabel="Schedule tasks"
          className={`mr-1 h-10 w-10 items-center justify-center rounded-full ${scheduling ? "bg-blue-600" : "active:bg-slate-100"}`}
        >
          <Ionicons name="time-outline" size={22} color={scheduling ? "#FFFFFF" : "#334155"} />
        </Pressable>
        <Pressable
          onPress={() => setViewMenuOpen(true)}
          accessibilityLabel="Change view"
          className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100"
        >
          <Ionicons name={viewOption.icon} size={22} color="#334155" />
        </Pressable>
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
      <Pressable
        onPress={() => newEvent(focusDate)}
        accessibilityLabel="New event"
        className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-blue-600 active:bg-blue-700"
        style={{
          // Level with the floating home button.
          bottom: insets.bottom + (HOME_BAR_HEIGHT - 56) / 2,
          shadowColor: "#1E3A8A",
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Ionicons name="add" size={30} color="white" />
      </Pressable>

      {/* The same centre home button as the other sections, floating */}
      <FloatingHomeButton />
        </>
      )}

      {/* View menu */}
      <Modal visible={viewMenuOpen} transparent animationType="fade" onRequestClose={() => setViewMenuOpen(false)}>
        <Pressable className="flex-1 bg-black/20" onPress={() => setViewMenuOpen(false)}>
          <View
            className="absolute right-3 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white"
            style={{ top: insets.top + 52 }}
          >
            {VIEW_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => {
                  setView(option.value);
                  setViewMenuOpen(false);
                }}
                className="flex-row items-center border-b border-slate-100 px-4 py-3.5 active:bg-slate-50"
              >
                <Ionicons name={option.icon} size={19} color={option.value === view ? "#2563EB" : "#64748B"} />
                <Text className={`ml-3 flex-1 text-base ${option.value === view ? "font-semibold text-blue-600" : "text-slate-800"}`}>
                  {option.label}
                </Text>
                {option.value === view && <Ionicons name="checkmark" size={19} color="#2563EB" />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <CalendarsDrawer
        visible={drawerOpen}
        calendars={calendars}
        onClose={() => setDrawerOpen(false)}
        onToggle={(c) => void toggleCalendar(c)}
        onEdit={(c) => {
          afterDrawer.current = c;
          setDrawerOpen(false);
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
