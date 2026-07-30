import { API_BASE_URL } from "@/src/config/api";

export type MealCategory = "breakfast" | "lunch" | "dinner" | "snack";

export interface RecipeNutrition {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
  fiber?: number | null;
  sodium?: number | null;
}

export interface RecipeCategory {
  _id: string;
  name: string;
}

export interface PopulatedIngredient {
  _id: string;
  name: string;
  nutrition?: RecipeNutrition;
  defaultPortionAmount?: number;
  defaultPortionUnit?: string;
  lowStockThreshold?: number | null;
  isGeneric?: boolean;
  isAlwaysAvailable?: boolean;
  genericParent?: string | { _id: string; name?: string } | null;
}

export interface RecipeIngredientEntry {
  ingredient: string | PopulatedIngredient;
  quantity: number;
  unit: string;
}

export interface Recipe {
  _id: string;
  name: string;
  description?: string;
  recipeCategory?: RecipeCategory | string | null;
  mealCategory: MealCategory[];
  servings?: number;
  defaultPortionUnit?: string;
  nutrition?: RecipeNutrition;
  nutritionBasis?: string;
  imageUrl?: string;
  notes?: string;
  isArchived?: boolean;
  // Manual curation flag — false ("want to try") is the default for a new
  // recipe, true means the user has confirmed it as a keeper. Distinct from
  // a meal-plan entry's own planned/confirmed status (whether a specific
  // calendar slot has been eaten yet).
  isConfirmed?: boolean;
  ingredientList: RecipeIngredientEntry[];
  instructions: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RecipeIngredientInput {
  ingredient: string;
  quantity: number;
  unit: string;
}

export interface CreateRecipeInput {
  name: string;
  mealCategory: MealCategory[];
  description?: string;
  recipeCategory?: string | null;
  servings?: number;
  defaultPortionUnit?: string;
  nutrition?: RecipeNutrition;
  nutritionBasis?: string;
  imageUrl?: string;
  notes?: string;
  isConfirmed?: boolean;
  ingredientList?: RecipeIngredientInput[];
  instructions?: string[];
}

export type UpdateRecipeInput = Partial<CreateRecipeInput>;

interface RecipeListResponse {
  success: boolean;
  count: number;
  data: Recipe[];
  message?: string;
}

interface RecipeResponse {
  success: boolean;
  data: Recipe;
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

export async function getRecipes(): Promise<Recipe[]> {
  const response = await fetch(`${API_BASE_URL}/api/recipes`);
  const result = await parseResponse<RecipeListResponse>(response);
  return Array.isArray(result.data) ? result.data : [];
}

export async function getRecipeById(recipeId: string): Promise<Recipe> {
  const id = recipeId.trim();
  if (!id) throw new Error("Recipe ID is required");
  const response = await fetch(`${API_BASE_URL}/api/recipes/${id}`);
  const result = await parseResponse<RecipeResponse>(response);
  return result.data;
}

export async function createRecipe(input: CreateRecipeInput): Promise<Recipe> {
  const name = input.name.trim();
  if (!name) throw new Error("Recipe name is required");

  const response = await fetch(`${API_BASE_URL}/api/recipes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, name }),
  });

  const result = await parseResponse<RecipeResponse>(response);
  return result.data;
}

export async function updateRecipe(
  recipeId: string,
  input: UpdateRecipeInput,
): Promise<Recipe> {
  const id = recipeId.trim();
  if (!id) throw new Error("Recipe ID is required");

  const response = await fetch(`${API_BASE_URL}/api/recipes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const result = await parseResponse<RecipeResponse>(response);
  return result.data;
}

export async function getRecipeCategories(): Promise<RecipeCategory[]> {
  const response = await fetch(`${API_BASE_URL}/api/recipe-categories`);
  const result = await parseResponse<{ success: boolean; data: RecipeCategory[] }>(response);
  return Array.isArray(result.data) ? result.data : [];
}

export async function createRecipeCategory(name: string): Promise<RecipeCategory> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");

  const response = await fetch(`${API_BASE_URL}/api/recipe-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: trimmed }),
  });

  const result = await parseResponse<{ success: boolean; data: RecipeCategory }>(response);
  return result.data;
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/recipes/${recipeId}`, {
    method: "DELETE",
  });
  await parseResponse<{ success: boolean; message: string }>(response);
}
