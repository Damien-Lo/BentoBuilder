import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
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
// On a phone in Orbit's look, in the Tasks section's violet; in a desktop
// browser as it was.
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
  const o = layout.wide ? null : colors;
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
    <OrbitPage on={!!o}>
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]} style={layout.page ?? (o && { backgroundColor: o.canvas })}>
      {/* Header (phone, Orbit: a round back button and an Empty pill over a
          large title on the page itself; desktop: its bar) */}
      {o ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 }}>
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
      ) : (
        <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-2.5">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Back"
            className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100"
          >
            <Ionicons name="chevron-back" size={26} color="#0F172A" />
          </Pressable>
          <View className="ml-1 flex-1">
            <Text className="text-lg font-bold text-slate-950">Recently deleted</Text>
            <Text className="text-xs text-slate-500">Kept for 30 days, then removed for good</Text>
          </View>
          {!!tasks?.length && (
            <Pressable onPress={confirmEmpty} className="h-10 justify-center rounded-xl px-3 active:bg-red-50">
              <Text className="font-semibold text-red-600">Empty</Text>
            </Pressable>
          )}
        </View>
      )}

      {tasks == null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={o?.muted ?? "#2563EB"} />
        </View>
      ) : tasks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="trash-outline" size={40} color={o?.faint ?? "#CBD5E1"} />
          <Text className="mt-3 text-center text-base font-semibold text-slate-700" style={o && { color: o.text }}>Nothing here</Text>
          <Text className="mt-1 text-center text-sm text-slate-500" style={o && { color: o.muted }}>
            Tasks you delete wait here for 30 days, so a mistake can be undone.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {tasks.map((task) => (
            // In a desktop browser a task is one row, its buttons at the end.
            <View
              key={task._id}
              className="mb-3 rounded-2xl border border-slate-200 bg-white p-4"
              style={layout.wide ? { flexDirection: "row", alignItems: "center" } : o && { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 }}
            >
              <View style={layout.column}>
              <View className="flex-row items-center gap-2">
                <TaskNumber number={task.number} />
                <Text className="flex-1 text-xs text-slate-500" numberOfLines={1} style={o && { color: o.muted }}>
                  {[task.list?.name ?? "Its list is gone", task.parentTitle].filter(Boolean).join("  ›  ")}
                </Text>
              </View>
              <Text
                className={`mt-1 text-base font-semibold ${task.completed ? "text-slate-400 line-through" : "text-slate-900"}`}
                style={o && { color: task.completed ? o.faint : o.text }}
              >
                {task.title}
              </Text>
              <Text className="mt-1 text-xs text-slate-500" style={o && { color: o.muted }}>
                Deleted {shortDateFromIso(task.deletedAt)}
                {task.subtaskCount > 0 ? ` · with ${task.subtaskCount} subtask${task.subtaskCount === 1 ? "" : "s"}` : ""}
                {" · "}
                <Text className={task.daysLeft <= 3 ? "font-semibold text-red-600" : ""} style={o && task.daysLeft <= 3 ? { color: o.danger } : undefined}>
                  {task.daysLeft === 0 ? "last day" : `${task.daysLeft} day${task.daysLeft === 1 ? "" : "s"} left`}
                </Text>
              </Text>
              </View>
              <View className="mt-3 flex-row gap-2" style={layout.wide ? { marginTop: 0, marginLeft: 16, width: 200 } : undefined}>
                {/* (Orbit: the section's main button, and the soft red one.) */}
                <Tap
                  onPress={() => restore(task)}
                  className="flex-1 flex-row items-center justify-center rounded-xl bg-blue-600 py-2.5 active:bg-blue-700"
                  style={o && { height: 44, paddingVertical: 0, borderRadius: 14, backgroundColor: o.ink }}
                  pressedStyle={o ? { opacity: 0.85 } : {}}
                >
                  <Ionicons name="arrow-undo-outline" size={16} color={o?.onInk ?? "#FFFFFF"} />
                  <Text className="ml-1.5 font-semibold text-white" style={o && { color: o.onInk }}>Restore</Text>
                </Tap>
                <Tap
                  onPress={() => confirmPurge(task)}
                  accessibilityLabel="Delete for good"
                  className="items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 active:bg-red-100"
                  style={o && { borderRadius: 14, backgroundColor: dangerTint, borderColor: dangerTint }}
                  pressedStyle={o ? { opacity: 0.7 } : {}}
                >
                  <Ionicons name="trash-outline" size={17} color={o?.danger ?? "#DC2626"} />
                </Tap>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
    </OrbitPage>
  );
}
