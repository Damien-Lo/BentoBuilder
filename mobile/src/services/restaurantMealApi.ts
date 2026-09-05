import { File } from "expo-file-system";

import { API_BASE_URL } from "@/src/config/api";
import type { SelectOption } from "@/src/services/optionsApi";

export interface DishNutrition {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
  fiber?: number | null;
  sodium?: number | null;
}

export interface DishScore {
  _id: string;
  value: number;
  ratedAt: string;
  // Set once a dish is rated straight from a meal-plan confirm — always
  // null for a manually-added score.
  mealPlanEntry?: string | null;
}

export interface Dish {
  _id: string;
  name: string;
  notes?: string;
  // What this dish cost, if known — optional, purely for price tracking.
  price?: number | null;
  nutrition?: DishNutrition;
  // Raw rating history, most-recent last — same convention as Recipe.scores.
  scores?: DishScore[];
}

export interface RestaurantMeal {
  _id: string;
  restaurantName: string;
  dishes: Dish[];
  tags?: (string | SelectOption)[];
  notes?: string;
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DishInput {
  name: string;
  notes?: string;
  price?: number | null;
  nutrition?: DishNutrition;
}

export interface CreateRestaurantMealInput {
  restaurantName: string;
  dishes?: DishInput[];
  tags?: string[];
  notes?: string;
  isArchived?: boolean;
}

export type UpdateRestaurantMealInput = Partial<CreateRestaurantMealInput>;

interface RestaurantMealListResponse {
  success: boolean;
  count: number;
  data: RestaurantMeal[];
  message?: string;
}

interface RestaurantMealResponse {
  success: boolean;
  data: RestaurantMeal;
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

export async function getRestaurantMeals(): Promise<RestaurantMeal[]> {
  const response = await fetch(`${API_BASE_URL}/api/restaurant-meals`);
  const result = await parseResponse<RestaurantMealListResponse>(response);
  return Array.isArray(result.data) ? result.data : [];
}

export async function getArchivedRestaurantMeals(): Promise<RestaurantMeal[]> {
  const response = await fetch(`${API_BASE_URL}/api/restaurant-meals?archived=true`);
  const result = await parseResponse<RestaurantMealListResponse>(response);
  return Array.isArray(result.data) ? result.data : [];
}

export async function getRestaurantMealById(id: string): Promise<RestaurantMeal> {
  const trimmedId = id.trim();
  if (!trimmedId) throw new Error("Restaurant meal ID is required");
  const response = await fetch(`${API_BASE_URL}/api/restaurant-meals/${trimmedId}`);
  const result = await parseResponse<RestaurantMealResponse>(response);
  return result.data;
}

export async function createRestaurantMeal(input: CreateRestaurantMealInput): Promise<RestaurantMeal> {
  const restaurantName = input.restaurantName.trim();
  if (!restaurantName) throw new Error("Restaurant name is required");

  const response = await fetch(`${API_BASE_URL}/api/restaurant-meals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, restaurantName }),
  });

  const result = await parseResponse<RestaurantMealResponse>(response);
  return result.data;
}

export async function updateRestaurantMeal(
  id: string,
  input: UpdateRestaurantMealInput,
): Promise<RestaurantMeal> {
  const trimmedId = id.trim();
  if (!trimmedId) throw new Error("Restaurant meal ID is required");

  const response = await fetch(`${API_BASE_URL}/api/restaurant-meals/${trimmedId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const result = await parseResponse<RestaurantMealResponse>(response);
  return result.data;
}

export async function deleteRestaurantMeal(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/restaurant-meals/${id}`, {
    method: "DELETE",
  });
  await parseResponse<{ success: boolean; message: string }>(response);
}

export async function restoreRestaurantMeal(id: string): Promise<RestaurantMeal> {
  return updateRestaurantMeal(id, { isArchived: false });
}

// Only meaningful from the Archive view — an already-archived restaurant
// meal deleted permanently, with no restore path back.
export async function deleteRestaurantMealPermanently(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/restaurant-meals/${id}?permanent=true`, {
    method: "DELETE",
  });
  await parseResponse<{ success: boolean; message: string }>(response);
}

// Both return the updated dish scores array (not the whole restaurant
// meal) — same reasoning as Recipe's addRecipeScore/deleteRecipeScore.
export async function addDishScore(
  restaurantMealId: string,
  dishId: string,
  value: number,
  ratedAt?: string,
): Promise<DishScore[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/restaurant-meals/${restaurantMealId}/dishes/${dishId}/scores`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, ratedAt }),
    },
  );
  const result = await parseResponse<{ success: boolean; data: DishScore[] }>(response);
  return result.data;
}

export async function deleteDishScore(
  restaurantMealId: string,
  dishId: string,
  scoreId: string,
): Promise<DishScore[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/restaurant-meals/${restaurantMealId}/dishes/${dishId}/scores/${scoreId}`,
    { method: "DELETE" },
  );
  const result = await parseResponse<{ success: boolean; data: DishScore[] }>(response);
  return result.data;
}

// ── Meal-photo macro estimation ─────────────────────────────────────────────
// Preview only, same convention as the receipt scanner - doesn't write
// anything, the caller drops the result into the normal dish-row editing UI
// as a starting point rather than a separate review screen.

export interface EstimatedDish {
  name: string;
  estimatedNutrition: DishNutrition;
  // Short, honest caveat about what's uncertain in the estimate - always
  // present, never blank, even when confidence is high.
  portionNote: string;
  confidence: "high" | "medium" | "low";
}

interface MealPhotoEstimateResponse {
  success: boolean;
  data: { dishes: EstimatedDish[] };
  message?: string;
}

export async function estimateDishesFromPhoto(
  photoUri: string,
  restaurantName?: string,
): Promise<EstimatedDish[]> {
  const imageBase64 = await new File(photoUri).base64();

  const response = await fetch(`${API_BASE_URL}/api/restaurant-meals/estimate-photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mediaType: "image/jpeg", restaurantName }),
  });

  const result = await parseResponse<MealPhotoEstimateResponse>(response);
  return result.data.dishes;
}
