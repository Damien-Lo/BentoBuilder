import { API_BASE_URL } from "@/src/config/api";
import type { Meal } from "./mealApi";
import type { Recipe } from "./recipeApi";
import type { Ingredient } from "./ingredientApi";
import type { RestaurantMeal } from "./restaurantMealApi";
import type { NutritionTotals } from "@/src/types/nutrition";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

// "planned" = tentative, not yet eaten; "confirmed" = logged as actually eaten
export type MealPlanEntryStatus = "planned" | "confirmed";

// Only populated when the entry was fetched with the deep populate this app
// uses everywhere (GET /api/meal-plan, /:id/confirm, /:id/unconfirm) — the
// fields actually needed to compute a confirmed entry's real nutrition from
// what was really deducted, not the full pantry item record.
export interface StockDeductionPantryItem {
  _id: string;
  ingredient: Ingredient;
  quantityUnit: string;
}

export interface StockDeduction {
  pantryItem: string | StockDeductionPantryItem;
  amount: number;
}

// A wholePiece ingredient the user says they used but never logged into
// pantry — no real pantry item backs this, so nutrition is computed
// straight from the ingredient's own rate at this real typed weight.
export interface ManualPieceEntry {
  ingredient: Ingredient;
  weight: number;
  weightUnit: string;
}

// The real, final nutrition for a confirmed entry — computed once, with
// full context, at the moment of confirming (see mobile's
// computeConfirmNutrition) and stored here so every reader (the planner
// row, the day total, a weekly report) shows the exact same number without
// needing to re-derive it. null while planned, or for an entry confirmed
// before this field existed.
export type ConfirmedNutrition = NutritionTotals;

// Which dish (by RestaurantMeal.dishes subdocument _id) and how many of it
// were had on one specific visit — quantity defaults to 1 server-side, but
// is always present once populated back from the API.
export interface RestaurantDishSelection {
  dish: string;
  quantity: number;
}

export interface MealPlanEntry {
  _id: string;
  // The usual meal that filled this in, if one did (see usualMealApi).
  // Removing such an entry skips that usual for the day.
  usual?: string | null;
  date: string; // "YYYY-MM-DD"
  slot: MealSlot;
  status: MealPlanEntryStatus;

  meal?: Meal;

  recipe?: Recipe;
  recipeServings?: number;

  ingredient?: Ingredient;
  ingredientQuantity?: number;
  ingredientUnit?: string;

  // A restaurant/eating-out visit — no ingredients, no pantry deduction.
  restaurantMeal?: RestaurantMeal;
  // Which dish(es) from restaurantMeal.dishes were actually eaten, and how
  // many of each — a restaurant can have several independent dishes, so
  // nutrition is summed from just these (each scaled by its quantity), not
  // the whole menu at 1x.
  restaurantDishSelections?: RestaurantDishSelection[];

  // Exactly what confirming this entry deducted from the pantry — replayed
  // in reverse on unconfirm/delete. Empty while planned.
  stockDeductions?: StockDeduction[];
  // wholePiece ingredients confirmed with a typed weight instead of a real
  // pantry item — see ManualPieceEntry. Cleared on unconfirm, same as
  // stockDeductions (nothing to reverse — no stock was ever touched).
  manualPieceEntries?: ManualPieceEntry[];
  // See ConfirmedNutrition. Cleared on unconfirm.
  confirmedNutrition?: ConfirmedNutrition | null;

  notes?: string;
  createdAt?: string;
  // An accepted suggestion, as against something picked by hand.
  suggested?: boolean;
}

export interface CreateMealPlanEntryInput {
  date: string;
  slot: MealSlot;
  status?: MealPlanEntryStatus;

  meal?: string; // meal _id

  recipe?: string; // recipe _id
  recipeServings?: number;

  ingredient?: string; // ingredient _id
  ingredientQuantity?: number;
  ingredientUnit?: string;

  restaurantMeal?: string; // restaurant meal _id
  restaurantDishSelections?: RestaurantDishSelection[]; // which of restaurantMeal's dishes were eaten, and how many of each

  notes?: string;
  // An accepted suggestion (see utils/recommend.ts).
  suggested?: boolean;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json() as { success: boolean; message?: string };
  if (!res.ok) throw new Error((json as { message?: string }).message ?? `Request failed: ${res.status}`);
  return json as T;
}

// The phone's own date, so the server fills usual meals in from the right
// "today" whatever timezone it runs in.
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Every entry from `from` to `to` (inclusive), for the calendar's meal events.
export async function getMealPlanRange(from: string, to: string): Promise<MealPlanEntry[]> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan/range?from=${from}&to=${to}&today=${localToday()}`);
  const result = await parseResponse<{ success: boolean; data: MealPlanEntry[] }>(res);
  return Array.isArray(result.data) ? result.data : [];
}

export async function getMealPlanForDate(date: string): Promise<MealPlanEntry[]> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan?date=${encodeURIComponent(date)}&today=${localToday()}`);
  const result = await parseResponse<{ success: boolean; data: MealPlanEntry[] }>(res);
  return Array.isArray(result.data) ? result.data : [];
}

// For each of the four plannable types, a map of id -> the most recent
// "YYYY-MM-DD" date it was used in the meal plan (non-archived entries
// only) — computed fresh from MealPlanEntry on every call, not cached on
// the referenced document, so it can never go stale after a delete/archive.
export interface LastUsedMap {
  meal: Record<string, string>;
  recipe: Record<string, string>;
  ingredient: Record<string, string>;
  restaurantMeal: Record<string, string>;
}

const EMPTY_LAST_USED: LastUsedMap = { meal: {}, recipe: {}, ingredient: {}, restaurantMeal: {} };

export async function getLastUsedMap(): Promise<LastUsedMap> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan/last-used`);
  const result = await parseResponse<{ success: boolean; data: LastUsedMap }>(res);
  return result.data ?? EMPTY_LAST_USED;
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

export async function updateMealPlanEntryStatus(id: string, status: MealPlanEntryStatus): Promise<MealPlanEntry> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const result = await parseResponse<{ success: boolean; data: MealPlanEntry }>(res);
  return result.data;
}

// Editing how much of an already-planned/confirmed ingredient, recipe, or
// restaurant visit was actually eaten. Only ever sends one of the three
// shapes - callers pass just the fields relevant to the entry's type.
export async function updateMealPlanEntryQuantity(
  id: string,
  fields:
    | { ingredientQuantity: number; ingredientUnit: string }
    | { recipeServings: number }
    | { restaurantDishSelections: RestaurantDishSelection[] },
): Promise<MealPlanEntry> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  const result = await parseResponse<{ success: boolean; data: MealPlanEntry }>(res);
  return result.data;
}

// Confirming deducts pantry stock — the caller works out which pantry items
// to draw from (brother-grouping, expiry order, any manual choice) and
// sends the flat result here. The server clamps each amount to what's
// actually available and never blocks on a shortfall. manualPieceEntries
// covers a wholePiece ingredient with nothing in pantry to draw from at
// all — a typed weight instead of a pantry item, so nutrition still comes
// from a real number rather than a shortfall being silently left out.
export async function confirmMealPlanEntry(
  id: string,
  instructions: { pantryItemId: string; amount: number }[],
  manualPieceEntries: { ingredientId: string; weight: number; unit: string }[] = [],
  confirmedNutrition?: ConfirmedNutrition,
): Promise<MealPlanEntry> {
  const deductions: StockDeduction[] = instructions.map((i) => ({
    pantryItem: i.pantryItemId,
    amount: i.amount,
  }));
  const manual = manualPieceEntries.map((m) => ({
    ingredient: m.ingredientId,
    weight: m.weight,
    weightUnit: m.unit,
  }));
  const res = await fetch(`${API_BASE_URL}/api/meal-plan/${id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deductions, manualPieceEntries: manual, confirmedNutrition }),
  });
  const result = await parseResponse<{ success: boolean; data: MealPlanEntry }>(res);
  return result.data;
}

export async function unconfirmMealPlanEntry(id: string): Promise<MealPlanEntry> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan/${id}/unconfirm`, {
    method: "POST",
  });
  const result = await parseResponse<{ success: boolean; data: MealPlanEntry }>(res);
  return result.data;
}

export async function deleteMealPlanEntry(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan/${id}`, { method: "DELETE" });
  await parseResponse<{ success: boolean }>(res);
}

// Every non-archived visit to one restaurant, most recent first — powers
// the restaurant detail page's "Past visits" section.
export async function getMealPlanHistoryForRestaurant(restaurantMealId: string): Promise<MealPlanEntry[]> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan/by-restaurant/${restaurantMealId}`);
  const result = await parseResponse<{ success: boolean; data: MealPlanEntry[] }>(res);
  return Array.isArray(result.data) ? result.data : [];
}

// For each of the four slots, the single most recent non-archived entry
// strictly before `before` (or null) — powers the planner's "swipe to add
// yesterday's breakfast again" quick-add on an empty slot.
export interface LastEntryBySlot {
  breakfast: MealPlanEntry | null;
  lunch: MealPlanEntry | null;
  dinner: MealPlanEntry | null;
  snack: MealPlanEntry | null;
}

const EMPTY_LAST_ENTRIES: LastEntryBySlot = { breakfast: null, lunch: null, dinner: null, snack: null };

export async function getLastEntriesBeforeDate(before: string): Promise<LastEntryBySlot> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan/last-entries?before=${encodeURIComponent(before)}`);
  const result = await parseResponse<{ success: boolean; data: LastEntryBySlot }>(res);
  return result.data ?? EMPTY_LAST_ENTRIES;
}

// Records what was done with a meal suggestion — taken, turned over for
// another, or waved away — with how it scored. Best-effort: a suggestion
// still works if the record doesn't save.
export function logSuggestionEvent(event: {
  date: string;
  slot: MealSlot;
  // "replaced": it was showing, and something else was planned there
  // instead (`chosen` says what).
  // "side-…": one side of the plate was swapped, dropped or added, the
  // rest left as offered (`sideFrom` / `sideTo` are recipe ids).
  action: "accepted" | "another" | "dismissed" | "replaced" | "side-swapped" | "side-removed" | "side-added";
  // False when it was worked out in the background, not on screen.
  shown?: boolean;
  sideFrom?: string | null;
  sideTo?: string | null;
  chosen?: string;
  // How what was chosen instead scores, by the same factors.
  chosenCalories?: number;
  chosenScore?: number;
  chosenFactors?: Record<string, number>;
  recipe?: string | null;
  meal?: string | null;
  sides?: string[];
  name: string;
  calories: number;
  rank: number;
  score: number;
  factors: Record<string, number>;
}): void {
  fetch(`${API_BASE_URL}/api/meal-plan/suggestion-events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) }).catch(() => {});
}

// One saved record of what was done with a suggestion (see logSuggestionEvent).
export interface SuggestionEventRecord {
  _id: string;
  createdAt: string;
  date: string;
  slot: MealSlot;
  action: string;
  shown: boolean;
  name: string;
  calories: number | null;
  rank: number;
  score: number | null;
  factors: Record<string, number>;
  chosen: string;
  chosenCalories: number | null;
  chosenScore: number | null;
  chosenFactors: Record<string, number> | null;
  sideFrom: string | null;
  sideTo: string | null;
}

// The whole record, newest first, with how many of each action there are.
export async function getSuggestionEvents(limit = 500): Promise<{ total: number; counts: Record<string, number>; events: SuggestionEventRecord[] }> {
  const res = await fetch(`${API_BASE_URL}/api/meal-plan/suggestion-events?limit=${limit}`);
  const result = await parseResponse<{ data?: { total: number; counts: Record<string, number>; events: SuggestionEventRecord[] } }>(res);
  return result.data ?? { total: 0, counts: {}, events: [] };
}
