import { API_BASE_URL } from "@/src/config/api";

export type MealType = "course" | "bento";

export interface MealTag {
  _id: string;
  name: string;
}

export interface MealRecipeRef {
  _id: string;
  name: string;
  mealCategory?: string[];
  nutrition?: {
    calories?: number | null;
    protein?: number | null;
    carbs?: number | null;
    fats?: number | null;
    fiber?: number | null;
    sodium?: number | null;
  } | null;
  servings?: number;
}

export interface CourseEntry {
  _id: string;
  label: string;
  recipe: MealRecipeRef | string | null;
  servings: number;
}

export interface BentoSection {
  _id: string;
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  recipe: MealRecipeRef | string | null;
  label?: string;
  color?: string;
}

export interface BentoLayout {
  rows: number;
  cols: number;
  sections: BentoSection[];
}

export interface Meal {
  _id: string;
  name: string;
  type: MealType;
  tags?: MealTag[];
  notes?: string;
  isArchived?: boolean;
  courses?: CourseEntry[];
  bentoLayout?: BentoLayout | null;
  createdAt?: string;
  updatedAt?: string;
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CourseInput {
  label?: string;
  recipe?: string | null;
  servings?: number;
}

export interface BentoSectionInput {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  recipe?: string | null;
  label?: string;
  color?: string;
}

export interface BentoLayoutInput {
  rows: number;
  cols: number;
  sections: BentoSectionInput[];
}

export interface CreateMealInput {
  name: string;
  type: MealType;
  tags?: string[];
  notes?: string;
  courses?: CourseInput[];
  bentoLayout?: BentoLayoutInput | null;
}

export type UpdateMealInput = Partial<CreateMealInput>;

// ── Internal response shapes ──────────────────────────────────────────────────

interface MealListResponse {
  success: boolean;
  count: number;
  data: Meal[];
}

interface MealResponse {
  success: boolean;
  data: Meal;
}

// ── Shared fetch helper ───────────────────────────────────────────────────────

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json() as { success: boolean; message?: string; data?: unknown };

  if (!res.ok) {
    const message = json.message ?? `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  if (json.data === undefined && res.status !== 200) {
    throw new Error("The server returned an empty response");
  }

  return json as T;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getMeals(): Promise<Meal[]> {
  const res = await fetch(`${API_BASE_URL}/api/meals`);
  const result = await parseResponse<MealListResponse>(res);
  return Array.isArray(result.data) ? result.data : [];
}

export async function getMealById(mealId: string): Promise<Meal> {
  const id = mealId.trim();
  if (!id) throw new Error("Meal ID is required");
  const res = await fetch(`${API_BASE_URL}/api/meals/${id}`);
  const result = await parseResponse<MealResponse>(res);
  return result.data;
}

export async function createMeal(input: CreateMealInput): Promise<Meal> {
  const name = input.name.trim();
  if (!name) throw new Error("Meal name is required");
  const res = await fetch(`${API_BASE_URL}/api/meals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, name }),
  });
  const result = await parseResponse<MealResponse>(res);
  return result.data;
}

export async function updateMeal(mealId: string, input: UpdateMealInput): Promise<Meal> {
  const id = mealId.trim();
  if (!id) throw new Error("Meal ID is required");
  const res = await fetch(`${API_BASE_URL}/api/meals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await parseResponse<MealResponse>(res);
  return result.data;
}

export async function deleteMeal(mealId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/meals/${mealId}`, { method: "DELETE" });
  await parseResponse<{ success: boolean; message: string }>(res);
}

// ── Meal tags ─────────────────────────────────────────────────────────────────

export async function getMealTags(): Promise<MealTag[]> {
  const res = await fetch(`${API_BASE_URL}/api/meal-tags`);
  const result = await parseResponse<{ success: boolean; data: MealTag[] }>(res);
  return Array.isArray(result.data) ? result.data : [];
}

export async function createMealTag(name: string): Promise<MealTag> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name is required");
  const res = await fetch(`${API_BASE_URL}/api/meal-tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: trimmed }),
  });
  const result = await parseResponse<{ success: boolean; data: MealTag }>(res);
  return result.data;
}
