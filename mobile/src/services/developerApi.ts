import { API_BASE_URL } from "@/src/config/api";

export type IngredientIssue = "no-barcode" | "dangling-generic-parent";

export interface IngredientIssueEntry {
  id: string;
  name: string;
  isGeneric: boolean;
  issues: IngredientIssue[];
}

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json() as { success: boolean; message?: string };
  if (!res.ok) throw new Error((json as { message?: string }).message ?? `Request failed: ${res.status}`);
  return json as T;
}

export async function getIngredientIssues(): Promise<IngredientIssueEntry[]> {
  const res = await fetch(`${API_BASE_URL}/api/developer/ingredient-issues`);
  const result = await parseResponse<{ success: boolean; data: IngredientIssueEntry[] }>(res);
  return Array.isArray(result.data) ? result.data : [];
}
