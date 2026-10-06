import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TaskDashboard } from "@/src/components/todo/TaskDashboard";
import { longToday } from "@/src/components/todo/theme";
import { getTodoDashboard, type TodoDashboard } from "@/src/services/todoApi";

// The Lists section's first tab: where your tasks stand — counts, overall
// completion, and what's overdue or recently touched. Checklists and
// shopping lists aren't counted.
export default function ListsOverviewScreen() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<TodoDashboard | null>(null);

  useFocusEffect(
    useCallback(() => {
      getTodoDashboard().then(setDashboard).catch(() => {});
    }, []),
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
      <View className="border-b border-slate-200 bg-white px-5 py-3">
        <Text className="text-3xl font-bold text-slate-950">Overview</Text>
        <Text className="mt-0.5 text-sm text-slate-500">{longToday()}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {dashboard && dashboard.total === 0 ? (
          <View className="items-center rounded-3xl border border-dashed border-slate-300 px-6 py-10">
            <Ionicons name="list-outline" size={36} color="#94A3B8" />
            <Text className="mt-3 text-base font-semibold text-slate-700">No tasks yet</Text>
            <Text className="mt-1 text-center text-sm leading-5 text-slate-500">
              Add tasks on the Tasks tab and they&apos;ll be summarised here.
            </Text>
          </View>
        ) : dashboard ? (
          <TaskDashboard
            dashboard={dashboard}
            sectionsOpen
            onOpenTask={(task) => router.push({ pathname: "/lists/task/[id]", params: { id: task._id } })}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
