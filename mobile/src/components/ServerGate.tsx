import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";

import { API_BASE_URL } from "@/src/config/api";

// The deployed server goes to sleep when nothing has called it for a while,
// and its first answer after that can take most of a minute. Screens load
// their own data and don't all retry, so one opened during that minute can
// come up empty. This holds the app behind a loading screen until the
// server answers — on launch, and again after a long spell in the background.

const PING_TIMEOUT_MS = 8_000;
const RETRY_EVERY_MS = 2_000;
// Long enough away that the server may have gone back to sleep.
const RECHECK_AFTER_MS = 10 * 60_000;
// On coming back, only cover the app if the server is slow to answer.
const RESUME_GRACE_MS = 600;
// After this long, offer a way past (no connection, or the server is down).
const OFFER_SKIP_AFTER_MS = 20_000;

async function ping(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function ServerGate({ children }: { children: ReactNode }) {
  // Covered from the first frame, so nothing can be opened too early.
  const [covered, setCovered] = useState(true);
  const [slow, setSlow] = useState(false);
  // Bumped to abandon a check in progress (skipped, or a newer one began).
  const run = useRef(0);
  const leftAt = useRef<number | null>(null);

  const check = useCallback(async (coverAfterMs: number) => {
    const mine = ++run.current;
    setSlow(false);
    const coverTimer = setTimeout(() => run.current === mine && setCovered(true), coverAfterMs);
    const slowTimer = setTimeout(() => run.current === mine && setSlow(true), OFFER_SKIP_AFTER_MS);
    try {
      while (run.current === mine) {
        if (await ping()) break;
        await new Promise((resolve) => setTimeout(resolve, RETRY_EVERY_MS));
      }
    } finally {
      clearTimeout(coverTimer);
      clearTimeout(slowTimer);
    }
    if (run.current === mine) setCovered(false);
  }, []);

  useEffect(() => {
    void check(0);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        leftAt.current ??= Date.now();
        return;
      }
      const away = leftAt.current ? Date.now() - leftAt.current : 0;
      leftAt.current = null;
      if (away > RECHECK_AFTER_MS) void check(RESUME_GRACE_MS);
    });
    return () => {
      // Abandons any check still running.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      run.current++;
      subscription.remove();
    };
  }, [check]);

  function skip() {
    run.current++;
    setCovered(false);
  }

  return (
    <View style={{ flex: 1 }}>
      {children}
      {covered && (
        <View
          className="items-center justify-center bg-slate-50 px-10"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-blue-600">
            <Ionicons name="grid-outline" size={30} color="#FFFFFF" />
          </View>
          <Text className="mt-5 text-3xl font-bold text-slate-900">BentoBuilder</Text>
          <ActivityIndicator className="mt-8" color="#2563EB" />
          <Text className="mt-3 text-center text-sm text-slate-500">
            {slow ? "Still waking the server. This can take up to a minute." : "Getting things ready…"}
          </Text>
          {slow && (
            <Pressable onPress={skip} className="mt-6 rounded-full bg-slate-200 px-5 py-2.5 active:bg-slate-300">
              <Text className="text-sm font-semibold text-slate-700">Continue anyway</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
