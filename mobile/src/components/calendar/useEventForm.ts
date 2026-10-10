import { useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";

import {
  createCalendarEvent,
  deleteCalendarEvent,
  detachCalendarEvent,
  getCalendarEvent,
  MEAL_TYPES,
  splitCalendarEvent,
  updateCalendarEvent,
  type EventCalendar,
  type EventInput,
  type MealType,
  type RepeatFrequency,
  type SeriesScope,
} from "@/src/services/calendarApi";
import { parseLocalDate } from "@/src/utils/mealPlan";

import { addDays, daysBetween, weeklyDays } from "./calendarUtils";

// What the event form is for: a new event starting from a day and time, or
// an existing one. For a repeating event, `occurrence` is the day that was
// opened and `scope` says whether the edit is for it alone ("one"), it and
// the ones after ("following"), or the whole series ("all").
export type EventDraft =
  | { mode: "new"; date: string; startMinutes: number; endMinutes: number }
  | { mode: "edit"; id: string; occurrence?: string; scope?: SeriesScope | null };

// The event form's state and rules, apart from how it's drawn: what each
// field holds, how they move together (a new start keeps the length, an end
// before the start means the next day, a meal can't be all day), what's
// checked before saving, and which call a save or delete becomes.
//
// Used by the desktop event card. The phone's form (app/calendar/edit.tsx)
// has the same rules written into the screen itself; a change to one needs
// making in the other until the phone is moved onto this.
export function useEventForm(draft: EventDraft, calendars: EventCalendar[], onDone: () => void) {
  const editingId = draft.mode === "edit" ? draft.id : null;
  const occurrence = draft.mode === "edit" ? draft.occurrence : undefined;
  const scope: SeriesScope | null = draft.mode === "edit" && occurrence && draft.scope ? draft.scope : null;

  const initialDate = draft.mode === "new" ? draft.date : occurrence ?? "";
  const initialStart = draft.mode === "new" ? draft.startMinutes : 9 * 60;
  const initialEnd = draft.mode === "new" ? draft.endMinutes : initialStart + 60;

  const [loading, setLoading] = useState(draft.mode === "edit");
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [calendarId, setCalendarIdState] = useState("");
  const [allDay, setAllDayState] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialEnd > 1440 ? addDays(initialDate, 1) : initialDate);
  const [startMinutes, setStartMinutes] = useState(initialStart);
  const [endMinutes, setEndMinutes] = useState(Math.min(1440, initialEnd));
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency | null>(null);
  const [repeatUntil, setRepeatUntil] = useState<string | null>(null);
  // Weekly repeats: which days (0 = Sunday … 6 = Saturday).
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [remindMinutes, setRemindMinutes] = useState<number | null>(15);
  // Events in the Meals calendar: which meal this is (required there).
  const [mealSlot, setMealSlot] = useState<MealType | null>(null);

  // A new event goes in a calendar that's on show — the default one if it
  // is, else the first that is — so it doesn't vanish into a hidden calendar
  // the moment it's saved.
  useEffect(() => {
    if (draft.mode === "new" && !calendarId && calendars.length) {
      const usable = calendars.filter((c) => !c.isTasks && !c.isMeals);
      setCalendarIdState(
        (usable.find((c) => c.isDefault && c.visible) ?? usable.find((c) => c.visible) ?? usable.find((c) => c.isDefault) ?? usable[0] ?? calendars[0])._id,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendars.length]);

  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    getCalendarEvent(editingId)
      .then((event) => {
        if (cancelled) return;
        setTitle(event.title);
        setCalendarIdState(event.calendar);
        setAllDayState(event.allDay);
        // "Only this" / "this and following" open on the day that was
        // opened; the whole series opens on its start.
        const start = scope && scope !== "all" && occurrence ? occurrence : event.date;
        setDate(start);
        setEndDate(addDays(start, daysBetween(event.date, event.endDate)));
        setStartMinutes(event.startMinutes);
        setEndMinutes(event.endMinutes);
        // "Only this event" becomes a one-off.
        setRepeatFrequency(scope === "one" ? null : event.repeat?.frequency ?? null);
        setRepeatUntil(scope === "one" ? null : event.repeat?.until ?? null);
        if (scope === "one") {
          // no repeat
        } else if (event.repeat?.frequency === "weekdays") {
          // The old "every weekday" option is weekly on Mon–Fri.
          setRepeatFrequency("weekly");
          setRepeatDays([1, 2, 3, 4, 5]);
        } else if (event.repeat?.frequency === "weekly") {
          setRepeatDays(weeklyDays(event.repeat, event.date));
        }
        setLocation(event.location);
        setDescription(event.description);
        setRemindMinutes(event.remindMinutes);
        setMealSlot(event.mealSlot ?? null);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        Alert.alert("Couldn't load", error instanceof Error ? error.message : "Something went wrong.", [{ text: "OK", onPress: onDone }]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const calendar = calendars.find((c) => c._id === calendarId);
  const isMeal = !!calendar?.isMeals;
  // A timed event ending at or before its start runs into the next day.
  const overnight = !allDay && endDate > date;
  const duration = useMemo(
    () => daysBetween(date, endDate) * 1440 + endMinutes - startMinutes,
    [date, endDate, startMinutes, endMinutes],
  );

  function setCalendarId(next: string) {
    setCalendarIdState(next);
    // Meals are timed; other calendars have no meal type.
    if (calendars.find((c) => c._id === next)?.isMeals) setAllDayState(false);
    else setMealSlot(null);
  }

  function setAllDay(next: boolean) {
    if (next && isMeal) {
      Alert.alert("Meals have a time", "A meal needs a start and an end time.");
      return;
    }
    setAllDayState(next);
  }

  function pickMeal(slot: MealType) {
    // An untouched or default title follows the meal.
    const labels = MEAL_TYPES.map((m) => m.label);
    if (!title.trim() || labels.includes(title.trim())) setTitle(MEAL_TYPES.find((m) => m.value === slot)!.label);
    setMealSlot(slot);
  }

  function changeStartDate(next: string) {
    const span = daysBetween(date, endDate);
    // A weekly repeat that was just "the start date's day" follows the date.
    const oldDay = parseLocalDate(date).getDay();
    if (repeatDays.length <= 1 && (repeatDays.length === 0 || repeatDays[0] === oldDay)) {
      setRepeatDays([parseLocalDate(next).getDay()]);
    }
    setDate(next);
    setEndDate(addDays(next, span));
  }

  // All-day events: the last day can't be before the first.
  function changeEndDate(next: string) {
    setEndDate(next < date ? date : next);
  }

  function changeStartTime(next: number) {
    // Keep the length.
    const length = duration > 0 ? duration : 60;
    const end = next + length;
    setStartMinutes(next);
    setEndMinutes(end % 1440 === 0 && end > 0 ? 1440 : end % 1440);
    setEndDate(addDays(date, end > 1440 ? Math.floor((end - 1) / 1440) : 0));
  }

  function changeEndTime(next: number) {
    setEndMinutes(next === 0 ? 1440 : next);
    setEndDate(next !== 0 && next <= startMinutes ? addDays(date, 1) : date);
  }

  // Both ends at once — dragging the block in a day preview.
  function setTimes(start: number, end: number) {
    setStartMinutes(start);
    setEndMinutes(end);
    setEndDate(date);
  }

  function toggleRepeatDay(day: number) {
    const current = weeklyDays({ weekdays: repeatDays }, date);
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    // At least one day stays selected.
    if (next.length) setRepeatDays(next);
  }

  async function save() {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert("Add a title", "Give your event a title.");
      return;
    }
    if (isMeal && !mealSlot) {
      Alert.alert("Which meal is this?", "Pick breakfast, lunch, dinner or snack, so it can show that meal from your planner.");
      return;
    }
    if (isMeal && (allDay || endDate > date)) {
      Alert.alert("Check the time", "A meal needs a start and an end on the same day.");
      return;
    }
    if (repeatFrequency && repeatUntil && repeatUntil < date) {
      Alert.alert("Check the repeat", "The repeat's end date is before the event starts.");
      return;
    }
    const input: EventInput = {
      title: trimmed,
      calendar: calendarId,
      allDay,
      date,
      endDate: allDay ? (endDate < date ? date : endDate) : endDate,
      startMinutes,
      endMinutes,
      repeat: repeatFrequency
        ? {
            frequency: repeatFrequency,
            interval: 1,
            until: repeatUntil,
            weekdays: repeatFrequency === "weekly" ? weeklyDays({ weekdays: repeatDays }, date) : [],
          }
        : null,
      location: location.trim(),
      description: description.trim(),
      remindMinutes,
      mealSlot: isMeal ? mealSlot : null,
    };
    try {
      setSaving(true);
      if (editingId && scope === "one" && occurrence) await detachCalendarEvent(editingId, occurrence, input);
      else if (editingId && scope === "following" && occurrence) await splitCalendarEvent(editingId, occurrence, input);
      else if (editingId) await updateCalendarEvent(editingId, input);
      else await createCalendarEvent(input);
      onDone();
    } catch (error) {
      Alert.alert("Couldn't save event", error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!editingId) return;
    Alert.alert(
      scope === "one" ? "Delete this event?" : scope === "following" ? "Delete this and following events?" : "Delete event?",
      scope === "one"
        ? "The rest of the series stays."
        : scope === "following"
          ? "Earlier events in the series stay."
          : repeatFrequency
            ? "This deletes every occurrence of this repeating event."
            : undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void deleteCalendarEvent(editingId, scope ?? "all", occurrence).then(onDone, (error) =>
              Alert.alert("Couldn't delete", error instanceof Error ? error.message : "Something went wrong."),
            ),
        },
      ],
    );
  }

  return {
    editing: !!editingId,
    scope,
    loading,
    saving,
    calendar,
    isMeal,
    overnight,
    duration,
    title,
    setTitle,
    calendarId,
    setCalendarId,
    allDay,
    setAllDay,
    date,
    endDate,
    startMinutes,
    endMinutes,
    changeStartDate,
    changeEndDate,
    changeStartTime,
    changeEndTime,
    setTimes,
    repeatFrequency,
    setRepeatFrequency,
    repeatUntil,
    setRepeatUntil,
    repeatDays: weeklyDays({ weekdays: repeatDays }, date || "2000-01-01"),
    toggleRepeatDay,
    location,
    setLocation,
    description,
    setDescription,
    remindMinutes,
    setRemindMinutes,
    mealSlot,
    pickMeal,
    save,
    confirmDelete,
  };
}
