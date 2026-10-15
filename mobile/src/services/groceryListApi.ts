import { API_BASE_URL } from "@/src/config/api";

export interface GroceryItemIngredientRef {
  _id: string;
  name: string;
  isGeneric?: boolean;
  defaultPortionUnit?: string;
}

// toBuy -> pendingLog happens when the shopper checks the item off.
// pendingLog -> completed happens once it's been logged as a pantry entry
// (storage location, expiry, etc. confirmed) — not a plain toggle.
export type GroceryItemStatus = "toBuy" | "pendingLog" | "completed";

// One demand source contributing to this item's quantity — a specific
// meal-plan entry's shortfall, or the user's own manual add. The item's
// quantity is server-maintained as the sum of these.
export interface GroceryItemContribution {
  source: "mealPlanEntry" | "plan" | "menu" | "manual";
  mealPlanEntry?: string | null;
  amount: number;
}

export interface GroceryItem {
  _id: string;
  ingredient: GroceryItemIngredientRef | string | null;
  name: string;
  quantity: number | null;
  unit: string;
  status: GroceryItemStatus;
  // The pantry entry that logging this item created, once completed — see
  // GroceryItem.js for the undo/delete semantics around this field.
  pantryItem?: string | null;
  requestedBy?: GroceryItemContribution[];
  createdAt?: string;
}

export interface CreateGroceryItemInput {
  ingredient?: string | null;
  name: string;
  quantity?: number | null;
  unit?: string;
  // Where it's from: the plan's or the menu's To buy; by hand if not said.
  source?: "plan" | "menu";
}

// Where an item on the list came from, as its tags show it: the plan (its
// To buy, or a meal's "add missing"), the menu, or added by hand. An item
// from before this was kept counts as added by hand.
export function groceryItemTags(item: GroceryItem): ("Plan" | "Menu" | "Added")[] {
  const sources = new Set((item.requestedBy ?? []).map((c) => c.source));
  const tags: ("Plan" | "Menu" | "Added")[] = [];
  if (sources.has("plan") || sources.has("mealPlanEntry")) tags.push("Plan");
  if (sources.has("menu")) tags.push("Menu");
  if (sources.has("manual") || !sources.size) tags.push("Added");
  return tags;
}

export type UpdateGroceryItemInput = Partial<
  Pick<CreateGroceryItemInput, "name" | "quantity" | "unit" | "ingredient"> & {
    status: GroceryItemStatus;
    pantryItem: string | null;
  }
>;

interface GroceryListResponse {
  success: boolean;
  count: number;
  data: GroceryItem[];
}

interface GroceryItemResponse {
  success: boolean;
  data: GroceryItem;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  if (data === null) {
    throw new Error("The server returned an empty response");
  }

  return data as T;
}

export async function getGroceryItems(): Promise<GroceryItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/grocery-list`);
  const result = await parseResponse<GroceryListResponse>(response);
  return Array.isArray(result.data) ? result.data : [];
}

export async function createGroceryItem(
  input: CreateGroceryItemInput,
): Promise<GroceryItem> {
  const response = await fetch(`${API_BASE_URL}/api/grocery-list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await parseResponse<GroceryItemResponse>(response);
  return result.data;
}

// Sets what the plan (or the menu) has on the list to what it needs for the
// next shopping trip: added, changed or taken off; what was added by hand,
// and anything bought, are left alone. How many items changed.
export async function syncGroceryList(source: "plan" | "menu", needs: { ingredient: string; name: string; amount: number; unit: string }[]): Promise<number> {
  const response = await fetch(`${API_BASE_URL}/api/grocery-list/sync`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, needs }) });
  const result = await parseResponse<{ success: boolean; data: { changed: number } }>(response);
  return result.data.changed;
}

export interface UpsertMealPlanContributionInput {
  mealPlanEntry: string;
  ingredient: string;
  name: string;
  amount: number;
  unit: string;
}

// Idempotent per (ingredient, mealPlanEntry) — re-calling for the same entry
// updates its existing contribution amount in place instead of duplicating,
// so re-pressing "add missing to grocery list" closer to shopping day
// refreshes a stale shortfall rather than piling up extra demand.
export async function upsertMealPlanEntryContribution(
  input: UpsertMealPlanContributionInput,
): Promise<GroceryItem> {
  const response = await fetch(`${API_BASE_URL}/api/grocery-list/contributions/meal-plan-entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await parseResponse<GroceryItemResponse>(response);
  return result.data;
}

export async function updateGroceryItem(
  id: string,
  updates: UpdateGroceryItemInput,
): Promise<GroceryItem> {
  const response = await fetch(`${API_BASE_URL}/api/grocery-list/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const result = await parseResponse<GroceryItemResponse>(response);
  return result.data;
}

export async function deleteGroceryItem(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/grocery-list/${id}`, {
    method: "DELETE",
  });
  await parseResponse<{ success: boolean; message: string }>(response);
}

export async function clearCompletedGroceryItems(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/grocery-list/completed`, {
    method: "DELETE",
  });
  await parseResponse<{ success: boolean; message: string }>(response);
}
