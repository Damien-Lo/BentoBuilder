import { API_BASE_URL } from "@/src/config/api";
import type { Meal } from "@/src/services/mealApi";
import type { Recipe } from "@/src/services/recipeApi";

// The menu: recipes (or saved meals) you'd like to have soon, not yet on a
// day (see server/models/MenuItem.js). One "on the menu" is shopped for —
// its `servings`; one "someday" is kept for later. Once it's put on a day
// it goes back to "someday" by itself.
export interface MenuItem {
  _id: string;
  recipe?: Recipe | null;
  meal?: Meal | null;
  servings: number;
  state: "menu" | "someday";
  placed: number;
  createdAt?: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/menu${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message ?? "Something went wrong with the menu.");
  return result.data as T;
}

export const getMenu = () => call<MenuItem[]>("");
export const addToMenu = (what: { recipe: string } | { meal: string }, state: MenuItem["state"] = "menu") => call<MenuItem>("", { method: "POST", body: JSON.stringify({ ...what, state }) });
export const updateMenuItem = (id: string, changes: { state?: MenuItem["state"]; servings?: number }) => call<MenuItem>(`/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
export const removeFromMenu = (id: string) => call<void>(`/${id}`, { method: "DELETE" });

// The servings of an item still to put on a day.
export const menuLeft = (item: MenuItem) => Math.max(0, Math.round(((item.servings || 1) - (item.placed || 0)) * 100) / 100);
export const menuName = (item: MenuItem) => item.recipe?.name ?? item.meal?.name ?? "Something";
