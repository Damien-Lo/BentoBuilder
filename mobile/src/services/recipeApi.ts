import { API_BASE_URL } from "@/src/config/api";
import type { SelectOption } from "@/src/services/optionsApi";
import type { CustomUnitConversion } from "@/src/utils/unitConversion";

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
  // Purely a display convenience - lets the ingredient-row editor pre-fill
  // a wholePiece line's unit field (e.g. "steak") when this ingredient has
  // one set, saving retyping it. Carries no weight range of its own.
  pieceLabel?: string | null;
  lowStockThreshold?: number | null;
  isGeneric?: boolean;
  isAlwaysAvailable?: boolean;
  unitConversions?: CustomUnitConversion[];
  genericParent?: string | { _id: string; name?: string; unitConversions?: CustomUnitConversion[] } | null;
  // A meal-prep ingredient's own producing recipe — lets the recipe detail
  // page's ingredient list expand to show what's inside it.
  productionRecipe?: string | { _id: string; name: string } | null;
  isMealPrep?: boolean;
}

// "quantity" (default, may be omitted) is an exact numeric target — split
// across pantry stock however needed to hit it. "wholePiece" is for
// ingredients naturally sold/used as discrete, irregularly-sized units (a
// fish fillet, a steak): `quantity` means "how many whole pieces" and
// `unit` is just a display label, while pieceMinWeight/pieceMaxWeight/
// pieceWeightUnit is the acceptable real weight range for one piece —
// pantryDeduction.ts uses it to take a whole matching pantry item rather
// than splitting by weight.
export type IngredientMatchMode = "quantity" | "wholePiece";

export interface RecipeIngredientEntry {
  ingredient: string | PopulatedIngredient;
  quantity: number;
  unit: string;
  // How much of this line's nutrition actually ends up in the dish — 1
  // (default, may be omitted) counts it in full, 0 omits it, and a fraction
  // covers ingredients that are mostly rinsed off or discarded rather than
  // eaten (e.g. the baking soda used to soften kelp noodles).
  nutritionFactor?: number;
  matchMode?: IngredientMatchMode;
  pieceMinWeight?: number | null;
  pieceMaxWeight?: number | null;
  pieceWeightUnit?: string;
}

export interface RecipeScore {
  _id: string;
  value: number;
  ratedAt: string;
  // Set once the meal planner can prompt for a rating — always null for a
  // manually-added score.
  mealPlanEntry?: string | null;
}

export interface Recipe {
  _id: string;
  name: string;
  description?: string;
  recipeCategory?: RecipeCategory | string | null;
  tags?: (string | SelectOption)[];
  mealCategory: MealCategory[];
  servings?: number;
  defaultPortionUnit?: string;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  nutrition?: RecipeNutrition;
  imageUrl?: string;
  notes?: string;
  isArchived?: boolean;
  // Manual curation flag — false ("want to try") is the default for a new
  // recipe, true means the user has confirmed it as a keeper. Distinct from
  // a meal-plan entry's own planned/confirmed status (whether a specific
  // calendar slot has been eaten yet).
  isConfirmed?: boolean;
  // Raw rating history, most-recent last — "current score" is an average
  // computed over the tail of this array, not a stored field.
  scores?: RecipeScore[];
  ingredientList: RecipeIngredientEntry[];
  instructions: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RecipeIngredientInput {
  ingredient: string;
  quantity: number;
  unit: string;
  nutritionFactor?: number;
  matchMode?: IngredientMatchMode;
  pieceMinWeight?: number | null;
  pieceMaxWeight?: number | null;
  pieceWeightUnit?: string;
}

export interface CreateRecipeInput {
  name: string;
  mealCategory: MealCategory[];
  description?: string;
  recipeCategory?: string | null;
  tags?: string[];
  servings?: number;
  defaultPortionUnit?: string;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  nutrition?: RecipeNutrition;
  imageUrl?: string;
  notes?: string;
  isConfirmed?: boolean;
  isArchived?: boolean;
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

export async function getArchivedRecipes(): Promise<Recipe[]> {
  const response = await fetch(`${API_BASE_URL}/api/recipes?archived=true`);
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

export async function renameRecipeCategory(id: string, name: string): Promise<RecipeCategory> {
  const response = await fetch(`${API_BASE_URL}/api/recipe-categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });

  const result = await parseResponse<{ success: boolean; data: RecipeCategory }>(response);
  return result.data;
}

// Recipes still pointing at a deleted category just lose the category —
// it's optional on Recipe, no fallback needed.
export async function deleteRecipeCategory(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/recipe-categories/${id}`, {
    method: "DELETE",
  });

  await parseResponse<{ success: boolean; message: string }>(response);
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/recipes/${recipeId}`, {
    method: "DELETE",
  });
  await parseResponse<{ success: boolean; message: string }>(response);
}

export async function restoreRecipe(recipeId: string): Promise<Recipe> {
  return updateRecipe(recipeId, { isArchived: false });
}

// Only meaningful from the Archive view — an already-archived recipe
// deleted permanently, with no restore path back.
export async function deleteRecipePermanently(recipeId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/recipes/${recipeId}?permanent=true`, {
    method: "DELETE",
  });
  await parseResponse<{ success: boolean; message: string }>(response);
}

// Both return the updated scores array (not the whole recipe) — the recipe
// already held locally has populated fields (category, ingredients) that a
// plain recipe re-fetch here would clobber with raw, unpopulated ones.
export async function addRecipeScore(
  recipeId: string,
  value: number,
  ratedAt?: string,
): Promise<RecipeScore[]> {
  const response = await fetch(`${API_BASE_URL}/api/recipes/${recipeId}/scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value, ratedAt }),
  });
  const result = await parseResponse<{ success: boolean; data: RecipeScore[] }>(response);
  return result.data;
}

export async function deleteRecipeScore(
  recipeId: string,
  scoreId: string,
): Promise<RecipeScore[]> {
  const response = await fetch(`${API_BASE_URL}/api/recipes/${recipeId}/scores/${scoreId}`, {
    method: "DELETE",
  });
  const result = await parseResponse<{ success: boolean; data: RecipeScore[] }>(response);
  return result.data;
}
