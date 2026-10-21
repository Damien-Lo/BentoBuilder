import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WebTasksOverviewScreen } from "@/src/components/todo/web/WebTasksOverviewScreen";
import { TaskDashboard } from "@/src/components/todo/TaskDashboard";
import { longToday } from "@/src/components/todo/theme";
import { getTodoDashboard, type TodoDashboard } from "@/src/services/todoApi";
import { OrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import { useWideWeb } from "@/src/utils/useWideWeb";

// The Lists section's first tab: where your tasks stand — counts, overall
// completion, and what's overdue or recently touched. Checklists and
// shopping lists aren't counted.
// In a wide browser window the overview is a page laid out for the desktop;
// on the phone it's in Orbit's look.
export default function ListsOverviewScreen() {
  const wide = useWideWeb();
  return wide ? (
    <WebTasksOverviewScreen />
  ) : (
    <OrbitPage>
      <PhoneListsOverviewScreen />
    </OrbitPage>
  );
}

function PhoneListsOverviewScreen() {
  const router = useRouter();
  const { colors } = useOrbitTheme();
  const [dashboard, setDashboard] = useState<TodoDashboard | null>(null);

  useFocusEffect(
    useCallback(() => {
      getTodoDashboard().then(setDashboard).catch(() => {});
    }, []),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.5 }}>Overview</Text>
        <Text style={{ marginTop: 2, marginBottom: 20, fontSize: 14, color: colors.muted }}>{longToday()}</Text>
        {dashboard && dashboard.total === 0 ? (
          <View style={{ alignItems: "center", borderRadius: 20, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, paddingHorizontal: 24, paddingVertical: 40 }}>
            <Ionicons name="list-outline" size={36} color={colors.faint} />
            <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "600", color: colors.text }}>No tasks yet</Text>
            <Text style={{ marginTop: 4, textAlign: "center", fontSize: 14, lineHeight: 20, color: colors.muted }}>
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
