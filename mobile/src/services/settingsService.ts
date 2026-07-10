import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "@bentobuilder_settings";

export interface AppSettings {
  displayName: string;
  dailyCalorieLimit: number | null;
  dailyProteinLimit: number | null;
  dailyCarbsLimit: number | null;
  dailyFatsLimit: number | null;
  dailyFiberLimit: number | null;
  dailySodiumLimit: number | null;
}

const DEFAULTS: AppSettings = {
  displayName: "",
  dailyCalorieLimit: null,
  dailyProteinLimit: null,
  dailyCarbsLimit: null,
  dailyFatsLimit: null,
  dailyFiberLimit: null,
  dailySodiumLimit: null,
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) as Partial<AppSettings> };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
