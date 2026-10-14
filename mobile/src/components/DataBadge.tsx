import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Platform, Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getDatabaseState, type DatabaseState } from "@/src/services/databaseApi";

// A small marker, over everything, saying which data is on show — where
// there's a choice (a developer's machine: see services/databaseApi.ts).
// Tapping it opens the page that switches. On the deployed app there's no
// choice, and no marker.
export function DataBadge() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<DatabaseState | null>(null);

  useEffect(() => {
    const load = () => getDatabaseState().then(setState, () => setState(null));
    load();
    // (It may have been switched from another window.)
    const subscription = AppState.addEventListener("change", (next) => next === "active" && load());
    return () => subscription.remove();
  }, []);

  if (!state?.canSwitch) return null;
  const test = state.current === "test";
  return (
    <Pressable
      onPress={() => router.push("/developer/data")}
      accessibilityLabel={`${test ? "Test" : "Real"} data: switch`}
      // (Top right in a browser, clear of the section's tabs; top centre on a phone.)
      style={{ position: "absolute", top: insets.top + (Platform.OS === "web" ? 14 : 4), ...(Platform.OS === "web" ? { right: 16 } : { alignSelf: "center" as const }), zIndex: 1000, flexDirection: "row", alignItems: "center", height: 22, paddingHorizontal: 10, borderRadius: 11, backgroundColor: test ? "#F59E0B" : "#DC2626", opacity: 0.95 }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.3, color: "#FFFFFF" }}>{test ? "TEST DATA" : "REAL DATA"}</Text>
    </Pressable>
  );
}
