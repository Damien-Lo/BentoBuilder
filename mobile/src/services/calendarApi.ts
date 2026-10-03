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
// With `occurrence`, removes just that day's occurrence of a repeating event.
export const deleteCalendarEvent = (id: string, occurrence?: string) =>
  request<void>(`/events/${id}${occurrence ? `?occurrence=${occurrence}` : ""}`, { method: "DELETE" });
