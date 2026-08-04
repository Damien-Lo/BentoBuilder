import { API_BASE_URL } from "@/src/config/api";
import type { SelectOption } from "@/src/services/optionsApi";
import type { DurationUnit } from "@/src/utils/date";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";

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

  // Generic ingredients (e.g. "Soy Sauce") represent the abstract item a
  // recipe asks for. Specific/branded ingredients point back at one via
  // genericParent.
  isGeneric?: boolean;
  genericParent?: string | Ingredient | null;

  defaultPortionAmount?: number;
  defaultPortionUnit?: string;

  nutrition?: IngredientNutrition;

  lowStockThreshold?: number;

  // When true, this ingredient never shows as low/out of stock (e.g. tap
  // water) — stock tracking is skipped for it entirely.
  isAlwaysAvailable?: boolean;

  // Where a new pantry entry usually goes, and how long one usually lasts —
  // both prefill (don't force) the log-to-pantry form. Duration fields are
  // set together or not at all.
  defaultStorageLocation?: string | SelectOption | null;
  defaultExpiryDurationAmount?: number | null;
  defaultExpiryDurationUnit?: DurationUnit | null;

  // Density-style overrides for this ingredient specifically (e.g. "1 tbsp
  // = 10 g" for ginger) — checked before this ingredient's genericParent's
  // own conversions, which are checked before the app-wide fallback list.
  unitConversions?: CustomUnitConversion[];

  // Optional link to the Recipe that produces this ingredient (e.g. a
  // "Dashi Stock" ingredient made from a "Dashi Stock" recipe) — set from
  // the recipe screens, not editable here. Cooking that recipe deposits
  // pantry stock of this ingredient; other recipes that call for it fall
  // back to this recipe's own ingredients for any shortfall.
  productionRecipe?: string | { _id: string; name: string } | null;

  // Only meaningful when productionRecipe is set, and only ever set from
  // the recipe's own "Prepares" section. true = a finished meal you
  // reheat/eat directly (never usable as a component ingredient elsewhere);
  // false (default) = a component ingredient like Dashi Stock.
  isMealPrep?: boolean;

  tags?: (string | SelectOption)[];

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

  // Either pass genericParent directly (existing generic picked in the UI),
  // or genericName as free text — the server will find-or-create a generic
  // ingredient with that name in the same category. Leave both unset for a
  // standalone ingredient with no generic parent.
  isGeneric?: boolean;
  genericParent?: string | null;
  genericName?: string;

  defaultPortionAmount?: number;
  defaultPortionUnit?: string;

  nutrition?: IngredientNutrition;

  lowStockThreshold?: number;

  isAlwaysAvailable?: boolean;

  defaultStorageLocation?: string | null;
  defaultExpiryDurationAmount?: number | null;
  defaultExpiryDurationUnit?: DurationUnit | null;

  unitConversions?: CustomUnitConversion[];

  productionRecipe?: string | null;
  isMealPrep?: boolean;

  tags?: string[];

  isArchived?: boolean;
}

export type UpdateIngredientInput = Partial<CreateIngredientInput>;

export interface IngredientAvailability {
  ingredientId: string;
  isGeneric: boolean;
  isAlwaysAvailable?: boolean;
  variantCount: number;
  unit?: string;
  totalInOwnUnit: number;
  lowStockThreshold?: number | null;
  isOutOfStock: boolean;
  isLowStock: boolean;
  byUnit: Record<string, number>;
}

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

interface IngredientAvailabilityResponse {
  success: boolean;
  data: IngredientAvailability;
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

export async function getArchivedIngredients(): Promise<Ingredient[]> {
  const response = await fetch(`${API_BASE_URL}/api/ingredients?archived=true`);

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

export async function getIngredientAvailability(
  ingredientId: string,
): Promise<IngredientAvailability> {
  const trimmedId = ingredientId.trim();

  if (!trimmedId) {
    throw new Error("Ingredient ID is required");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/ingredients/${trimmedId}/availability`,
  );

  const result = await parseResponse<IngredientAvailabilityResponse>(response);

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

export async function deleteIngredient(ingredientId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/ingredients/${ingredientId}`,
    { method: "DELETE" },
  );

  await parseResponse<{ success: boolean; message: string }>(response);
}

// Only meaningful from the Archive view — an already-archived ingredient
// deleted permanently, with no restore path back.
export async function deleteIngredientPermanently(ingredientId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/ingredients/${ingredientId}?permanent=true`,
    { method: "DELETE" },
  );

  await parseResponse<{ success: boolean; message: string }>(response);
}
