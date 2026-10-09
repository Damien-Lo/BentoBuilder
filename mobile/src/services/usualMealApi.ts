import { API_BASE_URL } from "@/src/config/api";
import { todayStr } from "@/src/utils/mealPlan";

import type { MealSlot } from "./mealPlanApi";

// A food you usually have for a meal on certain days of the week. The
// planner fills itself with planned entries for it a couple of weeks ahead.
export interface UsualMeal {
  _id: string;
  slot: MealSlot;
  // 0 = Sunday … 6 = Saturday.
  weekdays: number[];
  meal?: { _id: string; name: string } | null;
  recipe?: { _id: string; name: string } | null;
  ingredient?: { _id: string; name: string } | null;
  restaurantMeal?: { _id: string; restaurantName: string } | null;
  startDate: string;
  endDate: string | null;
  // Days it was removed from on their own.
  skippedDates: string[];
  active: boolean;
}

export function usualName(usual: UsualMeal): string {
  return usual.meal?.name ?? usual.recipe?.name ?? usual.ingredient?.name ?? usual.restaurantMeal?.restaurantName ?? "Food";
}

// Whether `usual` applies on `date` (it's on, covers that weekday, and the
// day is within its run and wasn't skipped).
export function usualAppliesOn(usual: UsualMeal, date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  return (
    usual.active &&
    usual.weekdays.includes(new Date(y, m - 1, d).getDay()) &&
    date >= usual.startDate &&
    (!usual.endDate || date <= usual.endDate) &&
    !usual.skippedDates.includes(date)
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/usual-meals${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await response.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
  if (!response.ok || !json?.success) throw new Error(json?.message ?? `Request failed: ${response.status}`);
  return json.data as T;
}

export const getUsualMeals = () => request<UsualMeal[]>(`?today=${todayStr()}`);

// "Have this every Monday": turns a planner entry into a usual on `weekdays`.
export const makeUsualFromEntry = (entryId: string, weekdays: number[]) =>
  request<UsualMeal>(`/from-entry/${entryId}`, {
    method: "POST",
    body: JSON.stringify({ weekdays, today: todayStr() }),
  });

export const updateUsualMeal = (id: string, changes: { active?: boolean; weekdays?: number[] }) =>
  request<UsualMeal>(`/${id}`, { method: "PATCH", body: JSON.stringify({ ...changes, today: todayStr() }) });

// Stops it from `from` on (that day and every later one). Anything already
// eaten stays.
export const stopUsualMeal = (id: string, from: string = todayStr()) =>
  request<void>(`/${id}?from=${from}`, { method: "DELETE" });
