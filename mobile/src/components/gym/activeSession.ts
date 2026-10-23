import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SetType, WorkoutExercise } from "@/src/services/gymApi";

// The workout being done right now, kept on this device as it goes — every
// tick and number — so leaving the screen, or the app closing, loses
// nothing. There's one at a time; it's cleared when it's finished or
// discarded.

export interface ActiveSet {
  id: string;
  weight: string;
  reps: string;
  // For a hold or cardio: the time as typed ("1:30") and the miles.
  time: string;
  distance: string;
  done: boolean;
  doneAt?: string | null; // when it was ticked (ISO) — lines heart rate up with it
  type?: SetType;
}
export interface ActiveExercise {
  key: string;
  exercise: WorkoutExercise["exercise"];
  restSeconds: number;
  note: string;
  noteOpen: boolean;
  sets: ActiveSet[];
}
export interface ActiveSession {
  workoutId: string | null;
  name: string;
  startedAt: string; // ISO
  exercises: ActiveExercise[];
  // A rest being counted down: when it ends (ms since 1970), and how long
  // it was.
  restEndsAt?: number | null;
  restLength?: number;
  // The reminder to start a workout on the Watch, put away.
  watchNoted?: boolean;
  // The planned workout (a Gym calendar event, on its day) it was started
  // from — marked done with it when it's finished.
  plan?: { event: string; date: string } | null;
}

const KEY = "gym.activeSession";

export async function loadActiveSession(): Promise<ActiveSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}
export const storeActiveSession = (session: ActiveSession) => AsyncStorage.setItem(KEY, JSON.stringify(session)).catch(() => {});
export const clearActiveSession = () => AsyncStorage.removeItem(KEY).catch(() => {});

let nextId = 0;
export const newId = () => `${Date.now().toString(36)}-${nextId++}`;

// "12:05", "1:02:40".
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
