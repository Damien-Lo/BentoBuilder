import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

// Your Watch's correction — your measured burn ÷ what the Watch says, from
// Your burn (energy.ts) — kept on this device whenever it's worked out, so
// Gym's pages can correct a session's measured calories the same way
// without working your burn out again. (Null until it's been measured.)

const KEY = "health.watchRatio";
let current: number | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const set = (r: number | null) => {
  current = r;
  listeners.forEach((l) => l());
};

export function rememberWatchRatio(r: number | null) {
  if (r == null || !Number.isFinite(r) || r === current) return;
  set(r);
  AsyncStorage.setItem(KEY, String(r)).catch(() => {});
}

export function useWatchRatio(): number | null {
  useEffect(() => {
    if (loaded) return;
    loaded = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const r = raw ? Number(raw) : NaN;
        if (current == null && Number.isFinite(r)) set(r);
      })
      .catch(() => {});
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
