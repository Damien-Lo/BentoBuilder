import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useWideForm } from "@/src/components/forms/wideForm";
import { TaskNumber } from "@/src/components/todo/TaskBits";
import { shortDateFromIso } from "@/src/components/todo/theme";
import { Tap } from "@/src/components/ui/Tap";
import { OrbitPage, OrbitSection, useOrbitTheme } from "@/src/theme/orbit";
import {
  emptyDeletedTasks,
  getDeletedTasks,
  purgeDeletedTask,
  restoreTodoTask,
  type DeletedTask,
} from "@/src/services/todoApi";

// "Recently deleted": tasks that were deleted, kept for 30 days. Each can be
// put back (with the subtasks deleted alongside it) or removed for good.
// In Orbit's look, in the Tasks section's violet — in a desktop browser
// too, as a page of a reading width with each task on one row.
export default function DeletedTasksScreen() {
  return (
    <OrbitSection section="tasks">
      <DeletedTasksPage />
    </OrbitSection>
  );
}

function DeletedTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<DeletedTask[] | null>(null);
  const layout = useWideForm();
  const { colors, dark } = useOrbitTheme();
  const o = colors;
  // (Orbit: the soft red of something to delete.)
  const dangerTint = dark ? "rgba(248,113,113,0.14)" : "#FEF2F2";

  const load = useCallback(() => {
    getDeletedTasks()
      .then(setTasks)
      .catch((error) => {
        setTasks((prev) => prev ?? []);
        Alert.alert("Couldn't load", error instanceof Error ? error.message : "Something went wrong.");
      });
  }, []);

  useFocusEffect(load);

  const fail = (title: string) => (error: unknown) => {
    Alert.alert(title, error instanceof Error ? error.message : "Something went wrong.");
    load();
  };

  function restore(task: DeletedTask) {
    restoreTodoTask(task._id).then(load, fail("Couldn't restore"));
  }

  function confirmPurge(task: DeletedTask) {
    Alert.alert(`Delete "${task.title}" for good?`, "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => purgeDeletedTask(task._id).then(load, fail("Couldn't delete")),
      },
    ]);
  }

  function confirmEmpty() {
    Alert.alert("Empty Recently deleted?", "Everything here will be deleted for good. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Empty", style: "destructive", onPress: () => emptyDeletedTasks().then(load, fail("Couldn't empty")) },
    ]);
  }

  return (
    <OrbitPage>
    <SafeAreaView className="flex-1" edges={["top", "left", "right"]} style={{ backgroundColor: o.canvas }}>
      {/* (In a desktop browser: the page held to a reading width.) */}
      <View style={[{ flex: 1 }, layout.page]}>
      {/* Header: a round back button and an Empty pill over a large title
          on the page itself */}
      <View style={{ paddingHorizontal: 16, paddingTop: layout.wide ? 20 : 4, paddingBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -4, minHeight: 40 }}>
          <Tap onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }} pressedStyle={{ backgroundColor: o.pill }}>
            <Ionicons name="chevron-back" size={22} color={o.text} />
          </Tap>
          <View style={{ flex: 1 }} />
          {!!tasks?.length && (
            <Tap onPress={confirmEmpty} style={{ height: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: dangerTint }} pressedStyle={{ opacity: 0.7 }}>
              <Ionicons name="trash-outline" size={16} color={o.danger} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: o.danger }}>Empty</Text>
            </Tap>
          )}
        </View>
        <Text style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>Recently deleted</Text>
        <Text style={{ marginTop: 4, fontSize: 14, color: o.muted }}>Kept for 30 days, then removed for good</Text>
      </View>

      {tasks == null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={o.muted} />
        </View>
      ) : tasks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="trash-outline" size={40} color={o.faint} />
          <Text className="mt-3 text-center text-base font-semibold" style={{ color: o.text }}>Nothing here</Text>
          <Text className="mt-1 text-center text-sm" style={{ color: o.muted }}>
            Tasks you delete wait here for 30 days, so a mistake can be undone.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {tasks.map((task) => (
            // In a desktop browser a task is one row, its buttons at the end.
            <View
              key={task._id}
              className="mb-3 border p-4"
              style={[{ backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 }, layout.wide && { flexDirection: "row", alignItems: "center" }]}
            >
              <View style={layout.column}>
              <View className="flex-row items-center gap-2">
                <TaskNumber number={task.number} />
                <Text className="flex-1 text-xs" numberOfLines={1} style={{ color: o.muted }}>
                  {[task.list?.name ?? "Its list is gone", task.parentTitle].filter(Boolean).join("  ›  ")}
                </Text>
              </View>
              <Text
                className={`mt-1 text-base font-semibold ${task.completed ? "line-through" : ""}`}
                style={{ color: task.completed ? o.faint : o.text }}
              >
                {task.title}
              </Text>
              <Text className="mt-1 text-xs" style={{ color: o.muted }}>
                Deleted {shortDateFromIso(task.deletedAt)}
                {task.subtaskCount > 0 ? ` · with ${task.subtaskCount} subtask${task.subtaskCount === 1 ? "" : "s"}` : ""}
                {" · "}
                <Text className={task.daysLeft <= 3 ? "font-semibold" : ""} style={task.daysLeft <= 3 ? { color: o.danger } : undefined}>
                  {task.daysLeft === 0 ? "last day" : `${task.daysLeft} day${task.daysLeft === 1 ? "" : "s"} left`}
                </Text>
              </Text>
              </View>
              <View className="mt-3 flex-row gap-2" style={layout.wide ? { marginTop: 0, marginLeft: 16, width: 200 } : undefined}>
                {/* (The section's main button, and the soft red one; at a
                    button's size in a desktop browser.) */}
                <Tap
                  onPress={() => restore(task)}
                  className="flex-1 flex-row items-center justify-center"
                  style={{ height: layout.wide ? 40 : 44, borderRadius: layout.wide ? 12 : 14, backgroundColor: o.ink }}
                  pressedStyle={{ opacity: 0.85 }}
                >
                  <Ionicons name="arrow-undo-outline" size={16} color={o.onInk} />
                  <Text className="ml-1.5 font-semibold" style={{ color: o.onInk }}>Restore</Text>
                </Tap>
                <Tap
                  onPress={() => confirmPurge(task)}
                  accessibilityLabel="Delete for good"
                  className="items-center justify-center border px-4"
                  style={{ borderRadius: layout.wide ? 12 : 14, backgroundColor: dangerTint, borderColor: dangerTint }}
                  pressedStyle={{ opacity: 0.7 }}
                >
                  <Ionicons name="trash-outline" size={17} color={o.danger} />
                </Tap>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      </View>
    </SafeAreaView>
    </OrbitPage>
  );
}
