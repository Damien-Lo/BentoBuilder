import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

import {
  createCalendar,
  deleteCalendar,
  getCalendars,
  getEventOccurrences,
  updateCalendar,
  type EventCalendar,
  type EventOccurrence,
} from "@/src/services/calendarApi";
import { getMealPlanRange } from "@/src/services/mealPlanApi";
import { loadSettings } from "@/src/services/settingsService";
import { getCalendarTasks, type CalendarTaskFeed } from "@/src/services/todoApi";
import { getUsualMeals, usualAppliesOn, usualName, type UsualMeal } from "@/src/services/usualMealApi";
import { todayStr } from "@/src/utils/mealPlan";

import { addDays } from "./calendarUtils";
import { buildMealFood, mealKey, type MealFood } from "./mealFood";
import { taskBlockToOccurrence, taskToOccurrence } from "./TaskChip";

// Events are fetched for a window around the focused date and refetched
// once the focus wanders near its edge. The planner's food is fetched for a
// narrower span: it's heavier, and only drawn on the days in view.
const WINDOW_DAYS = 45;
const EDGE_DAYS = 14;
const MEAL_WINDOW_DAYS = 35;

// Everything a calendar view draws, for the days around `focusDate`: the
// calendars, and every visible occurrence — events, the tasks switched on
// for the calendar, and meal events with their food from the planner.
// Used by the desktop calendar (the phone screen has the same logic inline).
export function useCalendarData(focusDate: string) {
  const today = todayStr();
  const [calendars, setCalendars] = useState<EventCalendar[]>([]);
  const [events, setEvents] = useState<EventOccurrence[]>([]);
  const [tasks, setTasks] = useState<CalendarTaskFeed>({ deadlines: [], blocks: [] });
  const [mealFood, setMealFood] = useState<Map<string, MealFood>>(new Map());
  const [usualMeals, setUsualMeals] = useState<UsualMeal[]>([]);
  const [weekStartDay, setWeekStartDay] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const windowRef = useRef<{ from: string; to: string } | null>(null);

  const loadEvents = useCallback(async (center: string) => {
    const from = addDays(center, -WINDOW_DAYS);
    const to = addDays(center, WINDOW_DAYS);
    try {
      const [loadedEvents, loadedTasks] = await Promise.all([
        getEventOccurrences(from, to),
        // Tasks are a bonus layer — never fail the calendar over them.
        getCalendarTasks(from, to).catch((): CalendarTaskFeed => ({ deadlines: [], blocks: [] })),
      ]);
      windowRef.current = { from, to };
      setEvents(loadedEvents);
      setTasks(loadedTasks);
      setLoaded(true);
      Promise.all([
        getMealPlanRange(addDays(center, -MEAL_WINDOW_DAYS), addDays(center, MEAL_WINDOW_DAYS)),
        loadSettings(),
      ])
        .then(([entries, settings]) => setMealFood(buildMealFood(entries, settings.unitConversions)))
        .catch(() => {});
      getUsualMeals().then(setUsualMeals).catch(() => {});
    } catch {
      // Keep whatever was showing.
    }
  }, []);

  const loadCalendars = useCallback(async () => {
    try {
      setCalendars(await getCalendars());
    } catch {
      Alert.alert("Couldn't load calendars", "Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    loadSettings().then((s) => setWeekStartDay(s.weekStartDay)).catch(() => {});
  }, []);

  // Refetch when the focus nears the edge of what's loaded (and at first).
  useEffect(() => {
    const w = windowRef.current;
    if (!w || focusDate < addDays(w.from, EDGE_DAYS) || focusDate > addDays(w.to, -EDGE_DAYS)) void loadEvents(focusDate);
  }, [focusDate, loadEvents]);

  const reload = useCallback(() => {
    void loadCalendars();
    void loadEvents(focusDate);
  }, [focusDate, loadCalendars, loadEvents]);

  const calendarsById = useMemo(() => new Map(calendars.map((c) => [c._id, c])), [calendars]);

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
      const usually =
        !food && e.occurrenceDate > today
          ? usualMeals
              .filter((u) => u.slot === e.mealSlot && usualAppliesOn(u, e.occurrenceDate))
              .map(usualName)
              .join(", ")
          : "";
      return { ...e, meal: { food, usually: usually || undefined } };
    });
    return [...taskOccurrences, ...withFood].filter((e) => calendarsById.get(e.calendar)?.visible ?? true);
  }, [events, tasks, mealFood, usualMeals, calendars, calendarsById, today]);

  async function toggleCalendar(calendar: EventCalendar) {
    const visible = !calendar.visible;
    setCalendars((prev) => prev.map((c) => (c._id === calendar._id ? { ...c, visible } : c)));
    try {
      await updateCalendar(calendar._id, { visible });
    } catch {
      setCalendars((prev) => prev.map((c) => (c._id === calendar._id ? { ...c, visible: !visible } : c)));
    }
  }

  // `target` null = a new calendar.
  async function saveCalendar(target: EventCalendar | null, name: string, color: string) {
    try {
      if (target) await updateCalendar(target._id, { name, color });
      else await createCalendar(name, color);
      await loadCalendars();
    } catch (error) {
      Alert.alert("Couldn't save calendar", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  async function removeCalendar(calendar: EventCalendar) {
    try {
      await deleteCalendar(calendar._id);
      reload();
    } catch (error) {
      Alert.alert("Couldn't delete calendar", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  return {
    today,
    loaded,
    weekStartDay,
    calendars,
    calendarsById,
    visibleEvents,
    reload,
    toggleCalendar,
    saveCalendar,
    removeCalendar,
  };
}
