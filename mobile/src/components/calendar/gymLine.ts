import { useCallback, useEffect, useState } from "react";

import { durationLabel } from "@/src/components/gym/schedule";
import { gymStatusOn, type EventCalendar, type EventOccurrence } from "@/src/services/calendarApi";
import { getSessions, getWorkouts, sessionTotals, type GymSessionRecord, type GymWorkout } from "@/src/services/gymApi";

// A planned workout's line in the calendar, like a meal's food: the routine
// planned ("Upper B (Friday) · 7 exercises"), the session that did it once
// done ("Upper B (Friday) · 1h 6m · 23 sets", ticked), or skipped or missed.
// (The phone's calendar and the desktop's both use it.)

export function useGymLines(): [(e: EventOccurrence, calendar: EventCalendar | undefined, today: string) => EventOccurrence, () => void] {
  const [routines, setRoutines] = useState<Map<string, GymWorkout>>(new Map());
  const [sessions, setSessions] = useState<Map<string, GymSessionRecord>>(new Map());
  const load = useCallback(() => {
    getWorkouts()
      .then((list) => setRoutines(new Map(list.map((w) => [w._id, w]))))
      .catch(() => {});
    getSessions()
      .then((list) => setSessions(new Map(list.map((s) => [s._id, s]))))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const withWorkout = useCallback(
    (e: EventOccurrence, calendar: EventCalendar | undefined, today: string): EventOccurrence => {
      if (!calendar?.isGym) return e;
      const { status, session: sessionId } = gymStatusOn(e, e.occurrenceDate, today);
      const routine = e.gymWorkout ? routines.get(e.gymWorkout) : null;
      const name = routine?.name ?? "Any workout";
      const session = sessionId ? sessions.get(sessionId) : null;
      const exercises = routine?.exercises.filter((x) => x.exercise).length ?? 0;
      const line =
        status === "done"
          ? session
            ? `${session.name} · ${durationLabel(sessionTotals(session).seconds)} · ${sessionTotals(session).sets} sets`
            : name
          : status === "skipped"
            ? `Skipped · ${name}`
            : status === "missed"
              ? `Missed · ${name}`
              : `${name}${exercises ? ` · ${exercises} exercises` : ""}`;
      return { ...e, workout: { status, line } };
    },
    [routines, sessions],
  );
  return [withWorkout, load];
}
