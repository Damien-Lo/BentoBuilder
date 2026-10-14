import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, DevSettings, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useWideForm } from "@/src/components/forms/wideForm";
import { getDatabaseState, resetTestData, switchDatabase, type DatabaseId, type DatabaseState } from "@/src/services/databaseApi";

// Developer → Data: which data the app is working on, the real kitchen or
// the test copy, and switching between them. Only this machine's server can
// be switched; the deployed app is always on the real data, and this page
// just says so there.

// Everything on screen came from the other data: start again from the top.
function restart() {
  if (Platform.OS === "web") globalThis.location?.assign("/");
  else DevSettings.reload();
}

export default function DeveloperDataScreen() {
  const router = useRouter();
  const [state, setState] = useState<DatabaseState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<"switch" | "reset" | null>(null);
  const layout = useWideForm();

  useEffect(() => {
    getDatabaseState().then(setState, () => setLoadError(true));
  }, []);

  async function choose(id: DatabaseId) {
    if (!state || busy || id === state.current) return;
    try {
      setBusy("switch");
      await switchDatabase(id);
      restart();
    } catch (error) {
      Alert.alert("Couldn't switch", error instanceof Error ? error.message : "Something went wrong.");
      setBusy(null);
    }
  }

  function confirmReset() {
    Alert.alert("Reset the test data?", "Everything in the test data is thrown away and your recipes, ingredients and settings are copied in fresh from the real data. The real data isn't changed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          try {
            setBusy("reset");
            const result = await resetTestData();
            setState(result);
            if (result.current === "test") restart();
            else Alert.alert("Test data reset", `${result.copied.recipes ?? 0} recipes and ${result.copied.ingredients ?? 0} ingredients copied in.`);
          } catch (error) {
            Alert.alert("Couldn't reset", error instanceof Error ? error.message : "Something went wrong.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={layout.page}>
      <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-3">
        <Pressable className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <View className="ml-1">
          <Text className="text-2xl font-bold text-slate-950">Data</Text>
          <Text className="mt-0.5 text-sm text-slate-500">Your real kitchen, or a copy to try things in</Text>
        </View>
      </View>

      {loadError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="cloud-offline-outline" size={40} color="#F87171" />
          <Text className="mt-3 text-center text-base text-slate-500">Couldn&apos;t reach the server.</Text>
        </View>
      ) : !state ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#D97706" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 60, maxWidth: layout.wide ? undefined : 560, width: "100%", alignSelf: "center" }}>
          <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Working on</Text>
          {/* In a desktop browser, the real and test data side by side. */}
          <View style={layout.wide ? [layout.columns, { alignItems: "stretch" }] : undefined}>
          {state.databases.map((database) => {
            const on = database.id === state.current;
            const allowed = state.canSwitch || on;
            return (
              <Pressable
                key={database.id}
                onPress={() => void choose(database.id)}
                disabled={!allowed || on}
                accessibilityLabel={`Use the ${database.label.toLowerCase()}`}
                className={`mb-3 flex-row items-center rounded-3xl border bg-white px-4 py-4 ${on ? "border-blue-500" : "border-slate-200 active:bg-slate-50"} ${allowed ? "" : "opacity-50"}`}
                style={[layout.column, on ? { borderWidth: 2 } : undefined]}
              >
                <View className={`h-11 w-11 items-center justify-center rounded-full ${database.id === "test" ? "bg-amber-100" : "bg-red-100"}`}>
                  <Ionicons name={database.id === "test" ? "flask-outline" : "home-outline"} size={22} color={database.id === "test" ? "#B45309" : "#B91C1C"} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-lg font-semibold text-slate-900">{database.label}</Text>
                  <Text className="mt-0.5 text-sm leading-5 text-slate-500">{database.description}</Text>
                </View>
                {on ? <Ionicons name="checkmark-circle" size={24} color="#2563EB" /> : busy === "switch" ? <ActivityIndicator color="#2563EB" /> : allowed ? <Text className="text-sm font-semibold text-blue-700">Switch</Text> : null}
              </Pressable>
            );
          })}
          </View>

          {state.canSwitch ? (
            <>
              <Text className="mt-2 px-1 text-xs leading-5 text-slate-500">
                Switching changes it for this whole server, so every window and the simulator follow, and the app starts again from the top. A marker at the top of the screen always says which you&apos;re on.
              </Text>

              <Text className="mb-2 mt-7 text-xs font-bold uppercase tracking-widest text-slate-400">Test data</Text>
              <View style={layout.columns}>
              <View style={layout.column}>
              <Pressable onPress={confirmReset} disabled={!!busy} className="flex-row items-center rounded-3xl border border-slate-200 bg-white px-4 py-4 active:bg-slate-50">
                <Ionicons name="refresh" size={20} color="#B45309" />
                <View className="ml-3 flex-1">
                  <Text className="text-base font-semibold text-slate-900">{busy === "reset" ? "Resetting…" : "Reset the test data"}</Text>
                  <Text className="mt-0.5 text-sm leading-5 text-slate-500">Your recipes, ingredients, saved meals and settings copied in fresh; pantry, meal plan, calendar and tasks emptied.</Text>
                </View>
              </Pressable>
              </View>
              {layout.wide && <View style={layout.column} />}
              </View>
            </>
          ) : (
            <Text className="mt-2 px-1 text-xs leading-5 text-slate-500">This is the deployed app: it only has the real data. The test data is on the development machine.</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
