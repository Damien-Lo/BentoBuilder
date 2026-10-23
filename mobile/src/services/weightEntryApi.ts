import { API_BASE_URL } from "@/src/config/api";

export interface WeightEntry {
  _id: string;
  weight: number;
  date: string; // "YYYY-MM-DD"
  // Synced from Apple Health, logged or edited here (a sync leaves these
  // alone), or from before Apple Health was connected.
  source?: "apple" | "manual" | null;
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

// A weigh-in corrected — yours from then on.
export async function updateWeightEntry(id: string, weight: number): Promise<WeightEntry> {
  const res = await fetch(`${API_BASE_URL}/api/weight-entries/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weight }),
  });
  const result = await parseResponse<{ success: boolean; data: WeightEntry }>(res);
  return result.data;
}

// Apple Health's weights, a day each (see the server's /sync: the first
// time, they take over from the weigh-ins from before).
export async function syncWeightEntries(entries: { date: string; weight: number }[]): Promise<{ added: number; updated: number; retired: number }> {
  const res = await fetch(`${API_BASE_URL}/api/weight-entries/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });
  const result = await parseResponse<{ success: boolean; data: { added: number; updated: number; retired: number } }>(res);
  return result.data;
}

// One you logged: gone. One synced from Apple Health: hidden (so a sync
// doesn't bring it back).
export async function deleteWeightEntry(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/weight-entries/${id}`, { method: "DELETE" });
  await parseResponse<{ success: boolean }>(res);
}
