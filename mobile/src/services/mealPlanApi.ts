import { API_BASE_URL } from "@/src/config/api";
import type { Meal } from "./mealApi";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealPlanEntry {
  _id: string;
  date: string; // "YYYY-MM-DD"
  slot: MealSlot;
  meal: Meal;
  notes?: string;
  createdAt?: string;
}

export interface CreateMealPlanEntryInput {
  date: string;
  slot: MealSlot;
  meal: string; // meal _id
  notes?: string;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json() as { success: boolean; message?: string };
  if (!res.ok) throw new Error((json as { message?: string }).message ?? `Request failed: ${res.status}`);
  return json as T;
}

export async function getMealPlanForDate(date: string): Promise<MealPlanEntry[]> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan?date=${encodeURIComponent(date)}`);
  const result = await parseResponse<{ success: boolean; data: MealPlanEntry[] }>(res);
  return Array.isArray(result.data) ? result.data : [];
}

export async function createMealPlanEntry(input: CreateMealPlanEntryInput): Promise<MealPlanEntry> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await parseResponse<{ success: boolean; data: MealPlanEntry }>(res);
  return result.data;
}

export async function deleteMealPlanEntry(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan/${id}`, { method: "DELETE" });
  await parseResponse<{ success: boolean }>(res);
}
