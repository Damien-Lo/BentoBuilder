import { API_BASE_URL } from "@/src/config/api";
import type { SelectOption } from "@/src/services/optionsApi";

export interface IngredientNutrition {
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  fiber?: number;
  sodium?: number;
}

export interface Ingredient {
  _id: string;
  name: string;

  barcode?: string | null;
  description?: string;
  imageUrl?: string;

  brand?: string | SelectOption | null;
  category?: string | SelectOption | null;

  defaultPortionAmount?: number;
  defaultPortionUnit?: string;

  nutritionBasis?: string;
  nutrition?: IngredientNutrition;

  lowStockThreshold?: number;

  isArchived?: boolean;

  createdAt?: string;
  updatedAt?: string;
}

export interface CreateIngredientInput {
  name: string;

  barcode?: string | null;
  description?: string;
  imageUrl?: string;

  brand?: string | null;
  category?: string | null;

  defaultPortionAmount?: number;
  defaultPortionUnit?: string;

  nutritionBasis?: string;
  nutrition?: IngredientNutrition;

  lowStockThreshold?: number;

  isArchived?: boolean;
}

export type UpdateIngredientInput = Partial<CreateIngredientInput>;

interface IngredientListResponse {
  success: boolean;
  data: Ingredient[];
  message?: string;
}

interface IngredientResponse {
  success: boolean;
  data: Ingredient;
  message?: string;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  if (data === null) {
    throw new Error("The server returned an empty response");
  }

  return data as T;
}

export async function getIngredients(): Promise<Ingredient[]> {
  const response = await fetch(`${API_BASE_URL}/api/ingredients`);

  const result = await parseResponse<IngredientListResponse>(response);

  return Array.isArray(result.data) ? result.data : [];
}

export async function getIngredientById(
  ingredientId: string,
): Promise<Ingredient> {
  const trimmedId = ingredientId.trim();

  if (!trimmedId) {
    throw new Error("Ingredient ID is required");
  }

  const response = await fetch(`${API_BASE_URL}/api/ingredients/${trimmedId}`);

  const result = await parseResponse<IngredientResponse>(response);

  return result.data;
}

export async function createIngredient(
  input: CreateIngredientInput,
): Promise<Ingredient> {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Ingredient name is required");
  }

  const payload: CreateIngredientInput = {
    ...input,
    name,

    barcode: input.barcode?.trim() || null,

    description: input.description?.trim() || "",

    imageUrl: input.imageUrl?.trim() || "",

    brand: input.brand || null,

    category: input.category || null,

    defaultPortionUnit: input.defaultPortionUnit?.trim() || "",

    nutrition: input.nutrition
      ? {
          calories: input.nutrition.calories,

          protein: input.nutrition.protein,

          carbs: input.nutrition.carbs,

          fats: input.nutrition.fats,

          fiber: input.nutrition.fiber,

          sodium: input.nutrition.sodium,
        }
      : undefined,
  };

  const response = await fetch(`${API_BASE_URL}/api/ingredients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<IngredientResponse>(response);

  return result.data;
}

export async function updateIngredient(
  ingredientId: string,
  input: UpdateIngredientInput,
): Promise<Ingredient> {
  const trimmedId = ingredientId.trim();

  if (!trimmedId) {
    throw new Error("Ingredient ID is required");
  }

  const payload: UpdateIngredientInput = {
    ...input,
  };

  if (typeof input.name === "string") {
    payload.name = input.name.trim();
  }

  if (typeof input.barcode === "string") {
    payload.barcode = input.barcode.trim() || null;
  }

  if (typeof input.description === "string") {
    payload.description = input.description.trim();
  }

  if (typeof input.imageUrl === "string") {
    payload.imageUrl = input.imageUrl.trim();
  }

  if (typeof input.defaultPortionUnit === "string") {
    payload.defaultPortionUnit = input.defaultPortionUnit.trim();
  }

  const response = await fetch(`${API_BASE_URL}/api/ingredients/${trimmedId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await parseResponse<IngredientResponse>(response);

  return result.data;
}

export async function archiveIngredient(
  ingredientId: string,
): Promise<Ingredient> {
  return updateIngredient(ingredientId, {
    isArchived: true,
  });
}

export async function restoreIngredient(
  ingredientId: string,
): Promise<Ingredient> {
  return updateIngredient(ingredientId, {
    isArchived: false,
  });
}
