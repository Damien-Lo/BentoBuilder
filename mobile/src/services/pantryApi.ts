import { API_BASE_URL } from "@/src/config/api";
import type { PantryItem } from "@/src/types/pantry";

export interface CreatePantryItemInput {
  name: string;
  description?: string;
  category: string;
  brand?: string;
  barcode?: string;

  storageLocation: string;
  quantityAvailable: number;
  quantityUnit: string;

  purchaseDate?: string;
  expiryDate?: string;
  purchasePrice?: number;
  lowStockThreshold?: number;
  notes?: string;

  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    fiber?: number;
    sodium?: number;
  };

  nutritionBasis?: "per-serving" | "per-100g";
}

interface PantryListResponse {
  success: boolean;
  count: number;
  data: PantryItem[];
}

interface PantryItemResponse {
  success: boolean;
  data: PantryItem;
}

interface ErrorResponse {
  success?: boolean;
  message?: string;
}

interface ErrorResponse {
  success?: boolean;
  message?: string;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value
  );
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      isErrorResponse(data) && typeof data.message === "string"
        ? data.message
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  if (data === null) {
    throw new Error("The server returned an empty response");
  }

  return data as T;
}

export async function getPantryItems(): Promise<PantryItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/pantry`);

  const result = await parseResponse<PantryListResponse>(response);

  return result.data;
}

export async function createPantryItem(
  input: CreatePantryItemInput
): Promise<PantryItem> {
  const response = await fetch(`${API_BASE_URL}/api/pantry/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const result = await parseResponse<PantryItemResponse>(response);

  return result.data;
}

export async function updatePantryItem(
  pantryItemId: string,
  updates: Partial<CreatePantryItemInput>
): Promise<PantryItem> {
  const response = await fetch(
    `${API_BASE_URL}/api/pantry/${pantryItemId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    }
  );

  const result = await parseResponse<PantryItemResponse>(response);

  return result.data;
}

export async function usePantryItem(
  pantryItemId: string,
  amount: number
): Promise<PantryItem> {
  const response = await fetch(
    `${API_BASE_URL}/api/pantry/${pantryItemId}/use`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
      }),
    }
  );

  const result = await parseResponse<PantryItemResponse>(response);

  return result.data;
}

export async function deletePantryItem(
  pantryItemId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/pantry/${pantryItemId}`,
    {
      method: "DELETE",
    }
  );

  await parseResponse<{
    success: boolean;
    message: string;
  }>(response);
}