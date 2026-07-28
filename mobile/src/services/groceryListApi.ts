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
  createdAt?: string;
}

export interface CreateGroceryItemInput {
  ingredient?: string | null;
  name: string;
  quantity?: number | null;
  unit?: string;
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
