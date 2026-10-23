import { useCallback, useState } from "react";

import { getCalendars, getEventOccurrences, gymStatusOn, type EventOccurrence, type GymStatus } from "@/src/services/calendarApi";
import { getWorkouts, type GymWorkout } from "@/src/services/gymApi";

// Your planned workouts — the Gym calendar's events — between two days,
// each with its routine and how it stands on its day. (Gym's Overview and
// its Plan page; the calendar has its own.)

export type PlannedDay = { event: EventOccurrence; date: string; routine: GymWorkout | null; status: GymStatus; session: string | null };

export function useGymPlan(): [PlannedDay[] | null, (from: string, to: string, today: string) => Promise<void>] {
  const [plan, setPlan] = useState<PlannedDay[] | null>(null);
  const load = useCallback(async (from: string, to: string, today: string) => {
    try {
      const [calendars, events, routines] = await Promise.all([getCalendars(), getEventOccurrences(from, to), getWorkouts().catch(() => [] as GymWorkout[])]);
      const gym = calendars.find((c) => c.isGym);
      const byId = new Map(routines.map((w) => [w._id, w]));
      setPlan(
        events
          .filter((e) => gym && e.calendar === gym._id)
          .map((e) => {
            const planned = e.plannedWorkout !== undefined ? e.plannedWorkout : e.gymWorkout;
            return { event: e, date: e.occurrenceDate, routine: planned ? byId.get(planned) ?? null : null, ...gymStatusOn(e, e.occurrenceDate, today) };
          }),
      );
    } catch {
      setPlan((p) => p ?? []);
    }
  }, []);
  return [plan, load];
}
