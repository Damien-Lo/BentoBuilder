import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getIngredientIssues, type IngredientIssue, type IngredientIssueEntry } from "@/src/services/developerApi";

const ISSUE_LABELS: Record<IngredientIssue, string> = {
  "no-barcode": "No barcode",
  "dangling-generic-parent": "Broken generic-ingredient link",
};

const ISSUE_DESCRIPTIONS: Record<IngredientIssue, string> = {
  "no-barcode": "Specific/branded ingredients with nothing to match against a receipt scan.",
  "dangling-generic-parent": "Points at a generic ingredient that no longer exists — re-link it or make it standalone.",
};

function IssueBadge({ issue }: { issue: IngredientIssue }) {
  return (
    <View className="mr-1.5 mt-1 self-start rounded-full bg-amber-50 px-2 py-0.5">
      <Text className="text-[11px] font-semibold text-amber-700">{ISSUE_LABELS[issue]}</Text>
    </View>
  );
}

export default function DeveloperIngredientsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [entries, setEntries] = useState<IngredientIssueEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setLoadError(null);
    getIngredientIssues()
      .then(setEntries)
      .catch(() => setLoadError("Couldn't reach the server. Check it's running and try again."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  const groups = useMemo(() => {
    const byIssue = new Map<IngredientIssue, IngredientIssueEntry[]>();
    for (const entry of entries) {
      for (const issue of entry.issues) {
        if (!byIssue.has(issue)) byIssue.set(issue, []);
        byIssue.get(issue)!.push(entry);
      }
    }
    return byIssue;
  }, [entries]);

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      {/* Header */}
      <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-3">
        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full active:bg-slate-100"
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <View className="ml-1">
          <Text className="text-2xl font-bold text-slate-950">Ingredients Missing Data</Text>
          <Text className="mt-0.5 text-sm text-slate-500">
            {isLoading ? "Loading…" : loadError ? "Failed to load" : `${entries.length} flagged`}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#D97706" />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="cloud-offline-outline" size={40} color="#F87171" />
          <Text className="mt-3 text-center text-base text-slate-500">{loadError}</Text>
          <Pressable
            className="mt-4 rounded-full bg-amber-100 px-4 py-2 active:bg-amber-200"
            onPress={load}
          >
            <Text className="text-sm font-semibold text-amber-700">Retry</Text>
          </Pressable>
        </View>
      ) : entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="checkmark-circle-outline" size={40} color="#10B981" />
          <Text className="mt-3 text-center text-base text-slate-500">
            Nothing flagged — every active ingredient looks complete.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {[...groups.entries()].map(([issue, rows]) => (
            <View key={issue} className="mb-6">
              <Text className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                {ISSUE_LABELS[issue]} · {rows.length}
              </Text>
              <Text className="mb-2 text-xs text-slate-400">{ISSUE_DESCRIPTIONS[issue]}</Text>
              <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {rows.map((entry, i) => (
                  <Pressable
                    key={entry.id}
                    className={`flex-row items-center justify-between px-4 py-3.5 active:bg-slate-50 ${
                      i < rows.length - 1 ? "border-b border-slate-100" : ""
                    }`}
                    onPress={() => router.push({ pathname: "/ingredients/edit/[id]", params: { id: entry.id } })}
                  >
                    <View className="flex-1">
                      <Text className="text-base text-slate-700">{entry.name}</Text>
                      <View className="flex-row flex-wrap">
                        {entry.issues.map(i2 => <IssueBadge key={i2} issue={i2} />)}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
