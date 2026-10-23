import { useCallback, useEffect, useState } from "react";

import { durationLabel } from "@/src/components/gym/schedule";
import { gymStatusOn, type EventCalendar, type EventOccurrence } from "@/src/services/calendarApi";
import { getSessions, getWorkouts, sessionTotals, type GymSessionRecord, type GymWorkout } from "@/src/services/gymApi";

// A planned workout's line in the calendar, like a meal's food: the routine
// planned ("Upper B (Friday) · 7 exercises"), the session that did it once
// done ("Upper B (Friday) · 1h 6m · 23 sets", ticked), or skipped or missed.
// Sessions done without one planned are shown in the Gym calendar too, the
// same way, ticked. (The phone's calendar and the desktop's both use it.)

type Lines = [
  (e: EventOccurrence, calendar: EventCalendar | undefined, today: string) => EventOccurrence,
  () => void,
  // The sessions done that no planned workout was done with, as entries in
  // the Gym calendar (given the events, to know which were).
  (events: EventOccurrence[], gym: EventCalendar | undefined) => EventOccurrence[],
];

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function useGymLines(): Lines {
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
  const unplanned = useCallback(
    (events: EventOccurrence[], gym: EventCalendar | undefined): EventOccurrence[] => {
      if (!gym) return [];
      const linked = new Set(events.flatMap((e) => (e.gymDone ?? []).map((d) => d.session).filter(Boolean)));
      return [...sessions.values()]
        .filter((s) => !linked.has(s._id))
        .map((s) => {
          const start = new Date(s.startedAt);
          const end = new Date(s.finishedAt);
          const date = dayOf(start);
          const startMinutes = start.getHours() * 60 + start.getMinutes();
          const endMinutes = dayOf(end) === date ? Math.max(startMinutes + 15, end.getHours() * 60 + end.getMinutes()) : 1440;
          const totals = sessionTotals(s);
          return {
            _id: `session-${s._id}`,
            title: "Gym",
            calendar: gym._id,
            allDay: false,
            date,
            endDate: date,
            startMinutes,
            endMinutes: Math.min(1440, endMinutes),
            repeat: null,
            excludedDates: [],
            location: "",
            description: "",
            remindMinutes: null,
            occurrenceDate: date,
            occurrenceEndDate: date,
            gymSession: s._id,
            workout: { status: "done" as const, line: `${s.name} · ${durationLabel(totals.seconds)} · ${totals.sets} sets` },
          };
        });
    },
    [sessions],
  );
  return [withWorkout, load, unplanned];
}
