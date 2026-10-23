import { useEffect } from "react";
import { AppState } from "react-native";

import { healthAvailable, lastSynced, syncAppleHealth } from "@/src/services/healthSync";

// Keeps Apple Health synced without asking: whenever the app opens or comes
// back to the front — on any screen — once Apple Health is connected (it's
// been synced before) and the last sync is an hour old or more. Quietly:
// a failed sync waits for the next time. (Mounted once, signed in.)
const HOUR = 3_600_000;

async function syncIfDue() {
  if (!healthAvailable()) return;
  const last = await lastSynced();
  if (!last || Date.now() - last.getTime() < HOUR) return;
  await syncAppleHealth().catch(() => {});
}

export function HealthAutoSync() {
  useEffect(() => {
    void syncIfDue();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncIfDue();
    });
    return () => sub.remove();
  }, []);
  return null;
}
