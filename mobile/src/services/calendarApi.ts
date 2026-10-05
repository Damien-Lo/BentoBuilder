import { API_BASE_URL } from "@/src/config/api";

export interface EventCalendar {
  _id: string;
  name: string;
  color: string; // TODO_LIST_COLORS key
  visible: boolean;
  order: number;
  isDefault: boolean;
}

export type RepeatFrequency = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export interface EventRepeat {
  frequency: RepeatFrequency;
  interval: number;
  until: string | null; // YYYY-MM-DD
  // Weekly only: 0 = Sunday … 6 = Saturday. Empty = the start date's day.
  weekdays?: number[];
}

// Times are wall-clock: a date plus minutes after midnight.
export interface CalendarEvent {
  _id: string;
  title: string;
  calendar: string;
  allDay: boolean;
  date: string;
  endDate: string;
  startMinutes: number;
  endMinutes: number;
  repeat: EventRepeat | null;
  excludedDates: string[];
  location: string;
  description: string;
  remindMinutes: number | null;
  // Set when this was one occurrence of a repeating event, edited on its
  // own and split off ("only this event").
  seriesId?: string | null;
  originalDate?: string | null;
}

// One occurrence of an event within a requested range.
export interface EventOccurrence extends CalendarEvent {
  occurrenceDate: string;
  occurrenceEndDate: string;
}

export type EventInput = Omit<CalendarEvent, "_id" | "excludedDates">;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/calendar${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await response.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
  if (!response.ok || !json?.success) {
    throw new Error(json?.message ?? `Request failed: ${response.status}`);
  }
  return json.data as T;
}

const body = (value: unknown) => JSON.stringify(value);

export const getCalendars = () => request<EventCalendar[]>("/calendars");
export const createCalendar = (name: string, color: string) =>
  request<EventCalendar>("/calendars", { method: "POST", body: body({ name, color }) });
export const updateCalendar = (id: string, changes: Partial<Pick<EventCalendar, "name" | "color" | "visible">>) =>
  request<EventCalendar>(`/calendars/${id}`, { method: "PATCH", body: body(changes) });
export const deleteCalendar = (id: string) => request<void>(`/calendars/${id}`, { method: "DELETE" });

export const getEventOccurrences = (from: string, to: string) =>
  request<EventOccurrence[]>(`/events?from=${from}&to=${to}`);
export const getCalendarEvent = (id: string) => request<CalendarEvent>(`/events/${id}`);
export const createCalendarEvent = (input: EventInput) =>
  request<CalendarEvent>("/events", { method: "POST", body: body(input) });
export const updateCalendarEvent = (id: string, input: Partial<EventInput>) =>
  request<CalendarEvent>(`/events/${id}`, { method: "PATCH", body: body(input) });
// Which occurrences an edit or delete of a repeating event applies to.
export type SeriesScope = "one" | "following" | "all";

// Deletes the whole event, or for a repeating one just `occurrence`
// ("one") or `occurrence` onwards ("following").
export const deleteCalendarEvent = (id: string, scope: SeriesScope = "all", occurrence?: string) => {
  const query =
    occurrence && scope === "one" ? `?occurrence=${occurrence}` : occurrence && scope === "following" ? `?from=${occurrence}` : "";
  return request<void>(`/events/${id}${query}`, { method: "DELETE" });
};

// "Only this event": the series skips `occurrence`, which becomes its own
// event with these details.
export const detachCalendarEvent = (id: string, occurrence: string, input: EventInput) =>
  request<CalendarEvent>(`/events/${id}/detach`, { method: "POST", body: body({ ...input, occurrence }) });

// "This and following events": the series ends before `occurrence` and a new
// series with these details starts from it.
export const splitCalendarEvent = (id: string, occurrence: string, input: EventInput) =>
  request<CalendarEvent>(`/events/${id}/split`, { method: "POST", body: body({ ...input, occurrence }) });
