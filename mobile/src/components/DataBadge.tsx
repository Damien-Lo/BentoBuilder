import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getDatabaseState, type DatabaseState } from "@/src/services/databaseApi";
import { useWideWeb } from "@/src/utils/useWideWeb";

// A small marker, over everything, saying which data is on show — where
// there's a choice (a developer's machine: see services/databaseApi.ts).
// Tapping it opens the page that switches. On the deployed app there's no
// choice, and no marker — a release build doesn't even ask.
export function DataBadge() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useWideWeb();
  const [state, setState] = useState<DatabaseState | null>(null);

  useEffect(() => {
    if (!__DEV__) return;
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
      // (Bottom right in a desktop browser, clear of the controls pages
      // keep along the top; top centre at a phone's width, clear of the
      // buttons pages keep at the top right.)
      style={{ position: "absolute", ...(wide ? { bottom: 14, right: 16 } : { top: insets.top + 4, alignSelf: "center" as const }), zIndex: 1000, flexDirection: "row", alignItems: "center", height: 22, paddingHorizontal: 10, borderRadius: 11, backgroundColor: test ? "#F59E0B" : "#DC2626", opacity: 0.95 }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 0.3, color: "#FFFFFF" }}>{test ? "TEST DATA" : "REAL DATA"}</Text>
    </Pressable>
  );
}
