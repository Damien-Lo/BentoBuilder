import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { API_BASE_URL } from "@/src/config/api";
import { getSuggestionEvents, type SuggestionEventRecord } from "@/src/services/mealPlanApi";

// The record of what's been done with meal suggestions — every accept,
// "another", dismissal, side change and replacement, as saved (the
// SuggestionEvent collection). Here to look through by hand; the same data,
// whole, is at RAW_URL as JSON.
const RAW_URL = `${API_BASE_URL}/api/meal-plan/suggestion-events?limit=5000`;

const ACTIONS = ["accepted", "replaced", "another", "dismissed", "side-swapped", "side-added", "side-removed"];
const FACTORS = ["fit", "variety", "protein", "rating", "onHand", "habit", "useUp"];

const number = (n: number | null | undefined, places = 2) => (n == null ? "–" : n.toFixed(places));

function Factors({ label, factors, score }: { label: string; factors: Record<string, number> | null; score: number | null }) {
  if (!factors) return null;
  return (
    <Text className="mt-1 text-[11px] text-slate-500">
      <Text className="font-semibold text-slate-600">{label}</Text> {number(score, 3)}
      {"  "}
      {FACTORS.map((f) => `${f} ${number(factors[f])}`).join(" · ")}
    </Text>
  );
}

export default function DeveloperSuggestionsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<{ total: number; counts: Record<string, number>; events: SuggestionEventRecord[] }>({ total: 0, counts: {}, events: [] });

  function load() {
    setIsLoading(true);
    setLoadError(null);
    getSuggestionEvents()
      .then(setData)
      .catch(() => setLoadError("Couldn't reach the server. Check it's running and try again."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      {/* Header */}
      <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-3">
        <Pressable className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100" onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <View className="ml-1 flex-1">
          <Text className="text-2xl font-bold text-slate-950">Suggestion Record</Text>
          <Text className="mt-0.5 text-sm text-slate-500">{isLoading ? "Loading…" : loadError ? "Failed to load" : `${data.total} saved`}</Text>
        </View>
        <Pressable className="mr-1 rounded-full bg-amber-100 px-3 py-2 active:bg-amber-200" onPress={() => void Linking.openURL(RAW_URL)}>
          <Text className="text-sm font-semibold text-amber-700">Raw JSON</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#D97706" />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="cloud-offline-outline" size={40} color="#F87171" />
          <Text className="mt-3 text-center text-base text-slate-500">{loadError}</Text>
          <Pressable className="mt-4 rounded-full bg-amber-100 px-4 py-2 active:bg-amber-200" onPress={load}>
            <Text className="text-sm font-semibold text-amber-700">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">By action</Text>
          <View className="mb-6 flex-row flex-wrap rounded-2xl border border-slate-200 bg-white px-2 py-2">
            {ACTIONS.map((action) => (
              <View key={action} className="w-1/4 px-2 py-2">
                <Text className="text-xl font-bold text-slate-900">{data.counts[action] ?? 0}</Text>
                <Text className="text-xs text-slate-500">{action}</Text>
              </View>
            ))}
          </View>

          <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            Newest first{data.events.length < data.total ? ` · showing ${data.events.length}` : ""}
          </Text>
          {data.events.length === 0 ? (
            <Text className="text-sm text-slate-500">Nothing recorded yet.</Text>
          ) : (
            <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {data.events.map((event, i) => (
                <View key={event._id} className={`px-4 py-3 ${i < data.events.length - 1 ? "border-b border-slate-100" : ""}`}>
                  <View className="flex-row items-center">
                    <View className="rounded-full bg-amber-50 px-2 py-0.5">
                      <Text className="text-[11px] font-semibold text-amber-700">{event.action}</Text>
                    </View>
                    {event.shown === false && (
                      <View className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5">
                        <Text className="text-[11px] font-semibold text-slate-500">not on screen</Text>
                      </View>
                    )}
                    <Text className="ml-2 flex-1 text-xs text-slate-500">
                      {event.date} · {event.slot} · offer #{event.rank + 1}
                    </Text>
                    <Text className="text-[11px] text-slate-400">{new Date(event.createdAt).toLocaleString()}</Text>
                  </View>
                  <Text className="mt-1.5 text-sm text-slate-800">
                    {event.name}
                    {event.calories != null ? ` · ${event.calories} kcal` : ""}
                  </Text>
                  <Factors label="score" factors={event.factors} score={event.score} />
                  {!!event.chosen && (
                    <>
                      <Text className="mt-1.5 text-sm text-slate-800">
                        <Text className="font-semibold">{event.action === "replaced" ? "instead: " : "to: "}</Text>
                        {event.chosen}
                        {event.chosenCalories != null ? ` · ${event.chosenCalories} kcal` : ""}
                      </Text>
                      <Factors label="score" factors={event.chosenFactors} score={event.chosenScore} />
                    </>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
