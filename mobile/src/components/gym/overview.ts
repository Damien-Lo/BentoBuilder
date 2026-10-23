import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { addDays } from "@/src/components/calendar/calendarUtils";
import { loadActiveSession, type ActiveSession } from "@/src/components/gym/activeSession";
import { useGymPlan, type PlannedDay } from "@/src/components/gym/plan";
import { sessionCalories, weightOn } from "@/src/components/gym/sessionEnergy";
import { useWatchRatio } from "@/src/components/health/watchCorrection";
import { getSessions, type GymSessionRecord } from "@/src/services/gymApi";
import { getWeightEntries, type WeightEntry } from "@/src/services/weightEntryApi";
import { parseLocalDate, todayStr } from "@/src/utils/mealPlan";

// What Gym's Overview shows, on the phone and the desktop alike: the
// sessions you've done, the one under way, this week's plan (the Gym
// calendar's), and your weigh-ins and the Watch's correction (for each
// session's calories) — loaded each time the page shows.

export function useGymOverview() {
  const [sessions, setSessions] = useState<GymSessionRecord[] | null>(null);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [failed, setFailed] = useState(false);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const ratio = useWatchRatio();
  const [plan, loadPlan] = useGymPlan();
  const today = todayStr();
  useFocusEffect(
    useCallback(() => {
      const monday = addDays(today, -((parseLocalDate(today).getDay() + 6) % 7));
      void loadPlan(monday, addDays(monday, 6), today);
      getWeightEntries().then(setWeights, () => {});
      getSessions().then(
        (s) => {
          setSessions(s);
          setFailed(false);
        },
        () => setFailed(true),
      );
      loadActiveSession().then(setActive);
    }, [loadPlan, today]),
  );
  return { sessions, active, failed, weights, ratio, plan, today };
}

// Today's planned workouts, by time.
export const todayPlanned = (plan: PlannedDay[] | null, today: string) => (plan ?? []).filter((p) => p.date === today).sort((a, b) => a.event.startMinutes - b.event.startMinutes);

// The days this week with a workout planned (and not skipped).
export const plannedDays = (plan: PlannedDay[] | null) => new Set((plan ?? []).filter((p) => p.status !== "skipped").map((p) => p.date));

// Where a planned workout starts: its routine, as a session tied to the
// plan — or, with no routine, Workouts to pick one.
export const startPlannedPath = (p: PlannedDay) => (p.routine ? `/gym/session?workout=${p.routine._id}&plan=${p.event._id}&planDate=${p.date}` : "/gym/workouts");

// The calories some sessions burned, together — and whether any of it is
// estimated (a session the Watch didn't measure).
export function caloriesOf(some: GymSessionRecord[], all: GymSessionRecord[], weights: WeightEntry[], ratio: number | null) {
  const cals = some.map((s) => sessionCalories(s, all, weightOn(weights, s.startedAt), ratio));
  return { kcal: cals.reduce((n, x) => n + (x?.kcal ?? 0), 0), estimated: cals.some((x) => x && !x.measured) };
}
