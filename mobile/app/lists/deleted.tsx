import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TaskNumber } from "@/src/components/todo/TaskBits";
import { shortDateFromIso } from "@/src/components/todo/theme";
import {
  emptyDeletedTasks,
  getDeletedTasks,
  purgeDeletedTask,
  restoreTodoTask,
  type DeletedTask,
} from "@/src/services/todoApi";

// "Recently deleted": tasks that were deleted, kept for 30 days. Each can be
// put back (with the subtasks deleted alongside it) or removed for good.
export default function DeletedTasksScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<DeletedTask[] | null>(null);

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
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "left", "right"]}>
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

      {tasks == null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : tasks.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="trash-outline" size={40} color="#CBD5E1" />
          <Text className="mt-3 text-center text-base font-semibold text-slate-700">Nothing here</Text>
          <Text className="mt-1 text-center text-sm text-slate-500">
            Tasks you delete wait here for 30 days, so a mistake can be undone.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {tasks.map((task) => (
            <View key={task._id} className="mb-3 rounded-2xl border border-slate-200 bg-white p-4">
              <View className="flex-row items-center gap-2">
                <TaskNumber number={task.number} />
                <Text className="flex-1 text-xs text-slate-500" numberOfLines={1}>
                  {[task.list?.name ?? "Its list is gone", task.parentTitle].filter(Boolean).join("  ›  ")}
                </Text>
              </View>
              <Text
                className={`mt-1 text-base font-semibold ${task.completed ? "text-slate-400 line-through" : "text-slate-900"}`}
              >
                {task.title}
              </Text>
              <Text className="mt-1 text-xs text-slate-500">
                Deleted {shortDateFromIso(task.deletedAt)}
                {task.subtaskCount > 0 ? ` · with ${task.subtaskCount} subtask${task.subtaskCount === 1 ? "" : "s"}` : ""}
                {" · "}
                <Text className={task.daysLeft <= 3 ? "font-semibold text-red-600" : ""}>
                  {task.daysLeft === 0 ? "last day" : `${task.daysLeft} day${task.daysLeft === 1 ? "" : "s"} left`}
                </Text>
              </Text>
              <View className="mt-3 flex-row gap-2">
                <Pressable
                  onPress={() => restore(task)}
                  className="flex-1 flex-row items-center justify-center rounded-xl bg-blue-600 py-2.5 active:bg-blue-700"
                >
                  <Ionicons name="arrow-undo-outline" size={16} color="#FFFFFF" />
                  <Text className="ml-1.5 font-semibold text-white">Restore</Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmPurge(task)}
                  accessibilityLabel="Delete for good"
                  className="items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 active:bg-red-100"
                >
                  <Ionicons name="trash-outline" size={17} color="#DC2626" />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
