import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";

import { OrbSphere } from "@/src/components/ui/OrbSphere";
import { API_BASE_URL } from "@/src/config/api";
import { useOrbitTheme } from "@/src/theme/orbit";

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
      {covered && <WakingCover slow={slow} onSkip={skip} />}
    </View>
  );
}

// In Orbit's look: its orb, on the canvas.
function WakingCover({ slow, onSkip }: { slow: boolean; onSkip: () => void }) {
  const { colors, dark } = useOrbitTheme();
  return (
    <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, backgroundColor: colors.canvas }}>
      <OrbSphere size={72} label="Orbit" colors={colors} dark={dark} />
      <Text style={{ marginTop: 22, fontSize: 30, fontWeight: "800", letterSpacing: -0.5, color: colors.text }}>Orbit</Text>
      <ActivityIndicator style={{ marginTop: 28 }} color={colors.muted} />
      <Text style={{ marginTop: 12, textAlign: "center", fontSize: 14, color: colors.muted }}>
        {slow ? "Still waking the server. This can take up to a minute." : "Getting things ready…"}
      </Text>
      {slow && (
        <Pressable onPress={onSkip} style={({ pressed }) => ({ marginTop: 24, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: pressed ? colors.track : colors.pill })}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onPill }}>Continue anyway</Text>
        </Pressable>
      )}
    </View>
  );
}
