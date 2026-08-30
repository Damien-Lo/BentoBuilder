import { API_BASE_URL } from "@/src/config/api";

export interface WeightEntry {
  _id: string;
  weight: number;
  date: string; // "YYYY-MM-DD"
  createdAt?: string;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json() as { success: boolean; message?: string };
  if (!res.ok) throw new Error((json as { message?: string }).message ?? `Request failed: ${res.status}`);
  return json as T;
}

export async function getWeightEntries(): Promise<WeightEntry[]> {
  const res = await fetch(`${API_BASE_URL}/api/weight-entries`);
  const result = await parseResponse<{ success: boolean; data: WeightEntry[] }>(res);
  return Array.isArray(result.data) ? result.data : [];
}

// Upserts by date — logging again on a date that already has an entry
// updates it rather than creating a duplicate.
export async function logWeightEntry(weight: number, date: string): Promise<WeightEntry> {
  const res = await fetch(`${API_BASE_URL}/api/weight-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weight, date }),
  });
  const result = await parseResponse<{ success: boolean; data: WeightEntry }>(res);
  return result.data;
}

export async function deleteWeightEntry(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/weight-entries/${id}`, { method: "DELETE" });
  await parseResponse<{ success: boolean }>(res);
}
