import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
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

  const loadEvents = useCallback(async (center: string) => {
    const from = addDays(center, -WINDOW_DAYS);
    const to = addDays(center, WINDOW_DAYS);
    try {
      const loaded = await getEventOccurrences(from, to);
      windowRef.current = { from, to };
      setEvents(loaded);
    } catch {
      // Keep whatever was showing; the next focus/refresh retries.
    }
  }, []);

  const loadCalendars = useCallback(async () => {
    try {
      setCalendars(await getCalendars());
    } catch {
      Alert.alert("Couldn't load calendars", "Check your connection and try again.");
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
  const visibleEvents = useMemo(
    () => events.filter((e) => calendarsById.get(e.calendar)?.visible ?? true),
    [events, calendarsById],
  );
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

  function openEvent(event: EventOccurrence) {
    router.push({ pathname: "/calendar/event/[id]", params: { id: event._id, date: event.occurrenceDate } });
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
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100"
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </Pressable>
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
          onCreate={(date, start, end) => newEvent(date, start, end)}
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
    </SafeAreaView>
  );
}
