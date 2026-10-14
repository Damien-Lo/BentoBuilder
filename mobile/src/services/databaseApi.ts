import { API_BASE_URL } from "@/src/config/api";

// Which data the server is on: the real kitchen, or a test copy to try
// things out in (see server/config/database.js). It can only be changed
// where the server allows it — a developer's own machine; the deployed
// server is always on the real data, and says so (`canSwitch` false).
export type DatabaseId = "real" | "test";

export interface DatabaseState {
  current: DatabaseId;
  canSwitch: boolean;
  databases: { id: DatabaseId; label: string; description: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/developer/database${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  const json = (await response.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
  if (!response.ok || !json?.success) throw new Error(json?.message ?? `Request failed: ${response.status}`);
  return json.data as T;
}

export const getDatabaseState = () => request<DatabaseState>("");
// Switches the whole server over; everything on screen is then stale.
export const switchDatabase = (name: DatabaseId) => request<DatabaseState>("", { method: "POST", body: JSON.stringify({ name }) });
// Rebuilds the test data from the real: recipes and ingredients copied
// afresh, everything else emptied. The real data is only read.
export const resetTestData = () => request<DatabaseState & { copied: Record<string, number> }>("/reset-test", { method: "POST" });
