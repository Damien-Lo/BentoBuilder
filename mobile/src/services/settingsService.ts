import { API_BASE_URL } from "@/src/config/api";

export interface AppSettings {
  displayName: string;
  dailyCalorieLimit: number | null;
  dailyProteinLimit: number | null;
  dailyCarbsLimit: number | null;
  dailyFatsLimit: number | null;
  dailyFiberLimit: number | null;
  dailySodiumLimit: number | null;
  // 0 = Sunday … 6 = Saturday, matching JS Date#getDay()
  weekStartDay: number;
}

const DEFAULTS: AppSettings = {
  displayName: "",
  dailyCalorieLimit: null,
  dailyProteinLimit: null,
  dailyCarbsLimit: null,
  dailyFatsLimit: null,
  dailyFiberLimit: null,
  dailySodiumLimit: null,
  weekStartDay: 1,
};

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json() as { success: boolean; message?: string };
  if (!res.ok) throw new Error((json as { message?: string }).message ?? `Request failed: ${res.status}`);
  return json as T;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/profile`);
    const result = await parseResponse<{ success: boolean; data: Record<string, unknown> }>(res);
    const d = result.data;
    // Only pick known AppSettings fields — never let _id / __v etc. into state
    return {
      displayName:       typeof d.displayName       === "string" ? d.displayName       : DEFAULTS.displayName,
      dailyCalorieLimit: typeof d.dailyCalorieLimit === "number" ? d.dailyCalorieLimit : DEFAULTS.dailyCalorieLimit,
      dailyProteinLimit: typeof d.dailyProteinLimit === "number" ? d.dailyProteinLimit : DEFAULTS.dailyProteinLimit,
      dailyCarbsLimit:   typeof d.dailyCarbsLimit   === "number" ? d.dailyCarbsLimit   : DEFAULTS.dailyCarbsLimit,
      dailyFatsLimit:    typeof d.dailyFatsLimit    === "number" ? d.dailyFatsLimit    : DEFAULTS.dailyFatsLimit,
      dailyFiberLimit:   typeof d.dailyFiberLimit   === "number" ? d.dailyFiberLimit   : DEFAULTS.dailyFiberLimit,
      dailySodiumLimit:  typeof d.dailySodiumLimit  === "number" ? d.dailySodiumLimit  : DEFAULTS.dailySodiumLimit,
      weekStartDay:      typeof d.weekStartDay      === "number" ? d.weekStartDay      : DEFAULTS.weekStartDay,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  await parseResponse<{ success: boolean }>(res);
}
