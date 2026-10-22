import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { addDays, nowMinutes as currentMinutes } from "@/src/components/calendar/calendarUtils";
import { useCalendarData } from "@/src/components/calendar/useCalendarData";
import { loadActiveSession, type ActiveSession } from "@/src/components/gym/activeSession";
import { thisWeek } from "@/src/components/gym/schedule";
import { usePlanNeeds } from "@/src/components/planner/usePlanNeeds";
import { getSessions, type GymSessionRecord } from "@/src/services/gymApi";
import { getMealPlanRange, type MealPlanEntry } from "@/src/services/mealPlanApi";
import { getPantryItems } from "@/src/services/pantryApi";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "@/src/services/settingsService";
import { getSmartTasks, getTodoDashboard, type TodoDashboard, type TodoTask } from "@/src/services/todoApi";
import { getWeightEntries, type WeightEntry } from "@/src/services/weightEntryApi";
import type { PantryItem } from "@/src/types/pantry";
import { computeDayNutrition, todayStr } from "@/src/utils/mealPlan";

// Today, gathered for the home screen: what's on (events, meals at their
// times), what's been eaten against the day's goals, what's due, what's
// about to expire, how the weight is going, and the training week — reloaded whenever home is
// shown, and the time kept current.

const dayOf = (iso?: string | null) => (iso ? iso.slice(0, 10) : null);

export function useToday() {
  const today = todayStr();
  const calendar = useCalendarData(today);
  const plan = usePlanNeeds();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [dashboard, setDashboard] = useState<TodoDashboard | null>(null);
  const [myDay, setMyDay] = useState<TodoTask[]>([]);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [sessions, setSessions] = useState<GymSessionRecord[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<ActiveSession | null>(null);
  const [now, setNow] = useState(currentMinutes);

  const reload = useCallback(() => {
    calendar.reload();
    loadSettings().then(setSettings, () => {});
    getMealPlanRange(todayStr(), todayStr()).then(setEntries, () => {});
    getTodoDashboard().then(setDashboard, () => {});
    getSmartTasks("myday").then(setMyDay, () => {});
    getPantryItems().then(setPantry, () => {});
    getWeightEntries().then(setWeights, () => {});
    getSessions().then(setSessions, () => {});
    loadActiveSession().then(setActiveWorkout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(reload);
  useEffect(() => {
    const timer = setInterval(() => setNow(currentMinutes()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => {
    const conversions = settings.unitConversions;

    // The day's events (meals at their times among them), in order.
    const events = calendar.visibleEvents
      .filter((e) => today >= e.occurrenceDate && today <= e.occurrenceEndDate && !e.task)
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMinutes - b.startMinutes);
    const timed = events.filter((e) => !e.allDay);
    const happening = timed.find((e) => e.startMinutes <= now && now < e.endMinutes) ?? null;
    const upcoming = timed.filter((e) => e.startMinutes > now);
    const later = [...(happening ? [happening] : []), ...upcoming];
    const meals = timed.filter((e) => !!e.meal);
    const nextMeal = meals.find((e) => e.endMinutes > now) ?? null;

    // Eating: confirmed against the goal; what's still planned today.
    const eaten = computeDayNutrition(entries.filter((e) => e.status === "confirmed"), conversions);
    const planned = computeDayNutrition(plan.sized(entries.filter((e) => e.status === "planned")), conversions);
    const goal = settings.dailyCalorieLimit ?? 2000;
    const mealsPlanned = entries.length;
    const mealsEaten = entries.filter((e) => e.status === "confirmed").length;

    // Tasks: late, then today's — each once.
    const overdue = dashboard?.overdueTasks ?? [];
    const openToday = myDay.filter((t) => !t.completed);
    const tasks: { task: TodoTask; late: boolean }[] = [];
    for (const task of overdue) tasks.push({ task, late: true });
    for (const task of openToday) if (!tasks.some((t) => t.task._id === task._id)) tasks.push({ task, late: false });
    const doneToday = myDay.filter((t) => t.completed).length;

    // The pantry: what's past its date, and what's coming up this week.
    const inStock = pantry.filter((p) => !p.isFinished);
    const soon = addDays(today, 7);
    const expiring = inStock
      .filter((p) => {
        const d = dayOf(p.expiryDate);
        return !!d && d <= soon;
      })
      .sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""));

    // Weight: the latest, and the change over about a week.
    const sortedWeights = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sortedWeights[sortedWeights.length - 1] ?? null;
    const weekAgo = latest ? [...sortedWeights].reverse().find((w) => w.date <= addDays(latest.date, -6)) ?? null : null;
    const weightChange = latest && weekAgo ? Math.round((latest.weight - weekAgo.weight) * 10) / 10 : null;
    const start = settings.startingWeight;
    const target = settings.goalWeight;
    const weightProgress = latest && start != null && target != null && start !== target ? Math.max(0, Math.min(1, (start - latest.weight) / (start - target))) : 0;

    // Training: this week, the last one, one under way.
    const gym = { week: thisWeek(sessions), last: sessions[0] ?? null, active: activeWorkout };

    // How far through the waking day (7:00 to 23:00).
    const dayProgress = Math.max(0, Math.min(1, (now - 7 * 60) / (16 * 60)));

    return {
      today,
      now,
      loaded: calendar.loaded,
      settings,
      events,
      happening,
      upcoming,
      later,
      meals,
      nextMeal,
      eaten,
      planned,
      goal,
      mealsPlanned,
      mealsEaten,
      tasks,
      doneToday,
      myDayTotal: myDay.length,
      expiring,
      latestWeight: latest,
      weightChange,
      weightProgress,
      dayProgress,
      gym,
      reload,
    };
  }, [today, now, calendar.visibleEvents, calendar.loaded, settings, entries, plan, dashboard, myDay, pantry, weights, sessions, activeWorkout, reload]);
}

export type Today = ReturnType<typeof useToday>;
