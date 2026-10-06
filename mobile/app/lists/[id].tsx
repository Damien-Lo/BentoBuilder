import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddTaskBar, type NewTaskInput } from "@/src/components/todo/AddTaskBar";
import { openListOptions } from "@/src/components/todo/listActions";
import { PriorityPill, ProgressBar, StatusPill, TaskNumber } from "@/src/components/todo/TaskBits";
import { TextPromptModal } from "@/src/components/todo/TextPromptModal";
import {
  friendlyDate,
  isOverdue,
  listAccent,
  longToday,
  showActions,
  SMART_LISTS,
  useTodoTheme,
  type TodoTheme,
} from "@/src/components/todo/theme";
import {
  createTodoTask,
  deleteTodoTask,
  getListTasks,
  getSmartTasks,
  getTodoOverview,
  updateTodoList,
  updateTodoTask,
  type SmartListId,
  type TodoGroup,
  type TodoList,
  type TodoTask,
} from "@/src/services/todoApi";
import { todayStr } from "@/src/utils/mealPlan";

// One list — a real one, or a smart list (My Day / Important / Planned /
// All) when `id` is one of those. Task cards, a collapsible Completed
// section, and an "Add a Task" bar pinned to the bottom.
export default function TodoListScreen() {
  const router = useRouter();
  const theme = useTodoTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const smart = SMART_LISTS.find((s) => s.id === id);

  const [list, setList] = useState<TodoList | null>(null);
  const [groups, setGroups] = useState<TodoGroup[]>([]);
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [showCompleted, setShowCompleted] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [renamingItem, setRenamingItem] = useState<TodoTask | null>(null);

  const accent = listAccent(smart?.color ?? list?.color, theme);
  const title = smart?.name ?? list?.name ?? "";
  const isChecklist = list?.type === "checklist";
  const noun = isChecklist ? "item" : "task";

  const refresh = useCallback(() => {
    const load = smart ? getSmartTasks(smart.id as SmartListId) : getListTasks(id);
    Promise.all([load, getTodoOverview()])
      .then(([loadedTasks, overview]) => {
        setTasks(loadedTasks);
        setGroups(overview.groups);
        if (!smart) setList(overview.lists.find((l) => l._id === id) ?? null);
      })
      .catch((error) => Alert.alert("Couldn't load tasks", error instanceof Error ? error.message : "Something went wrong."));
  }, [id, smart]);

  useFocusEffect(refresh);

  const fail = (error: unknown) =>
    Alert.alert("Something went wrong", error instanceof Error ? error.message : "Please try again.");

  function patchLocal(taskId: string, changes: Partial<TodoTask>) {
    setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, ...changes } : t)));
  }

  function setCompleted(task: TodoTask, completed: boolean, completeSubtasks = false) {
    patchLocal(task._id, { completed });
    updateTodoTask(task._id, { completed, completeSubtasks })
      .then((updated) => patchLocal(task._id, updated))
      .catch((error) => {
        patchLocal(task._id, { completed: task.completed });
        fail(error);
      });
  }

  // Ticking off a task that still has open subtasks warns first; going
  // ahead completes them too.
  function toggleComplete(task: TodoTask) {
    if (!task.completed && task.openSubtaskCount > 0) {
      const n = task.openSubtaskCount;
      Alert.alert(
        "Complete with open subtasks?",
        `"${task.title}" still has ${n} open subtask${n === 1 ? "" : "s"}. Completing it will complete ${n === 1 ? "it" : "them"} too.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Complete all", onPress: () => setCompleted(task, true, true) },
        ],
      );
      return;
    }
    setCompleted(task, !task.completed);
  }

  // Checklist items: tap to rename, with delete in the same menu.
  function openChecklistItem(task: TodoTask) {
    showActions(task.title, [
      { label: "Rename", onPress: () => setRenamingItem(task) },
      {
        label: "Delete",
        destructive: true,
        onPress: () => {
          setTasks((prev) => prev.filter((t) => t._id !== task._id));
          deleteTodoTask(task._id).catch((error) => {
            fail(error);
            refresh();
          });
        },
      },
    ]);
  }

  function toggleImportant(task: TodoTask) {
    patchLocal(task._id, { important: !task.important });
    updateTodoTask(task._id, { important: !task.important })
      .then(() => {
        if (smart?.id === "important") refresh();
      })
      .catch((error) => {
        patchLocal(task._id, { important: task.important });
        fail(error);
      });
  }

  function openTask(task: TodoTask) {
    if (isChecklist) openChecklistItem(task);
    else router.push({ pathname: "/lists/task/[id]", params: { id: task._id } });
  }

  async function addTask(input: NewTaskInput) {
    try {
      const created = await createTodoTask({
        title: input.title,
        list: smart ? undefined : id,
        myDayDate: input.myDay ? todayStr() : null,
        important: smart?.id === "important",
        dueDate: input.dueDate,
        doDate: input.doDate,
        description: input.description,
      });
      setTasks((prev) => [...prev, created]);
    } catch (error) {
      fail(error);
    }
  }

  const sortForView = (list: TodoTask[]) =>
    smart?.id === "planned"
      ? [...list].sort((a, b) => (a.doDate ?? a.dueDate ?? "").localeCompare(b.doDate ?? b.dueDate ?? ""))
      : list;
  const open = sortForView(tasks.filter((t) => !t.completed));
  const done = tasks
    .filter((t) => t.completed)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 12,
            backgroundColor: theme.headerBg,
            borderBottomWidth: 1,
            borderBottomColor: theme.cardBorder,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Back to lists"
            className="active:bg-slate-100"
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 4 }}>
            <Text style={{ fontSize: 24, fontWeight: "700", color: theme.title }} numberOfLines={1}>
              {title}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 14, color: theme.textMuted }} numberOfLines={1}>
              {smart?.id === "myday"
                ? longToday()
                : `${isChecklist ? "Checklist · " : ""}${open.length} ${noun}${open.length === 1 ? "" : "s"}${done.length ? ` · ${done.length} ${isChecklist ? "ticked" : "completed"}` : ""}`}
            </Text>
          </View>
          {list && (
            <Pressable
              accessibilityLabel="List options"
              onPress={() =>
                openListOptions({
                  list,
                  groups,
                  onRename: () => setRenaming(true),
                  onChanged: refresh,
                  onDeleted: () => router.back(),
                  // It now belongs on a different tab — go back to the tabs.
                  onMoved: () => router.back(),
                })
              }
              className="active:bg-slate-100"
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={theme.icon} />
            </Pressable>
          )}
        </View>

        <AddTaskBar
          accent={accent}
          checklist={isChecklist}
          defaults={{ myDay: smart?.id === "myday", dueDate: smart?.id === "planned" ? todayStr() : null }}
          onAdd={(input) => void addTask(input)}
        />

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}>

          {open.length === 0 && done.length === 0 && (
            <Text style={{ color: theme.textFaint, fontSize: 16, textAlign: "center", marginTop: 48 }}>
              {smart?.id === "myday" ? "Nothing planned for today yet." : `No ${noun}s yet.`}
            </Text>
          )}

          {open.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              theme={theme}
              accent={accent}
              showListName={!!smart}
              inMyDayView={smart?.id === "myday"}
              onToggle={() => toggleComplete(task)}
              onStar={() => toggleImportant(task)}
              checklist={isChecklist}
              onOpen={() => openTask(task)}
            />
          ))}

          {done.length > 0 && (
            <>
              <Pressable
                onPress={() => setShowCompleted((v) => !v)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  alignSelf: "flex-start",
                  marginTop: 12,
                  marginBottom: 8,
                  paddingHorizontal: 12,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: theme.pill,
                }}
              >
                <Ionicons name={showCompleted ? "chevron-down" : "chevron-forward"} size={16} color={theme.icon} />
                <Text style={{ marginLeft: 6, color: theme.icon, fontSize: 14, fontWeight: "600" }}>
                  {isChecklist ? "Ticked" : "Completed"}
                </Text>
                <Text style={{ marginLeft: 6, color: theme.textFaint, fontSize: 14 }}>{done.length}</Text>
              </Pressable>
              {showCompleted &&
                done.map((task) => (
                  <TaskCard
                    key={task._id}
                    task={task}
                    theme={theme}
                    accent={accent}
                    showListName={!!smart}
                    inMyDayView={smart?.id === "myday"}
                    onToggle={() => toggleComplete(task)}
                    onStar={() => toggleImportant(task)}
                    checklist={isChecklist}
                    onOpen={() => openTask(task)}
                  />
                ))}
            </>
          )}
        </ScrollView>

      </KeyboardAvoidingView>

      <TextPromptModal
        visible={renamingItem !== null}
        title="Rename item"
        placeholder="Item"
        initialValue={renamingItem?.title ?? ""}
        confirmLabel="Save"
        onCancel={() => setRenamingItem(null)}
        onSubmit={(value) => {
          const item = renamingItem;
          setRenamingItem(null);
          if (!item) return;
          patchLocal(item._id, { title: value });
          updateTodoTask(item._id, { title: value }).catch(fail);
        }}
      />

      {list && (
        <TextPromptModal
          visible={renaming}
          title="Rename list"
          placeholder="List name"
          initialValue={list.name}
          confirmLabel="Save"
          onCancel={() => setRenaming(false)}
          onSubmit={(name) => {
            setRenaming(false);
            updateTodoList(list._id, { name }).then(refresh, fail);
          }}
        />
      )}
    </SafeAreaView>
  );
}

function TaskCard({
  task,
  theme,
  accent,
  showListName,
  inMyDayView,
  checklist,
  onToggle,
  onStar,
  onOpen,
}: {
  task: TodoTask;
  theme: TodoTheme;
  accent: string;
  showListName: boolean;
  inMyDayView: boolean;
  // A checklist item: just the tick and the text.
  checklist: boolean;
  onToggle: () => void;
  onStar: () => void;
  onOpen: () => void;
}) {
  const meta: { text: string; icon?: keyof typeof Ionicons.glyphMap; color?: string }[] = [];
  if (!checklist) {
    if (showListName) meta.push({ text: task.list.name });
    if (!inMyDayView && task.myDayDate === todayStr()) meta.push({ text: "My Day", icon: "sunny-outline" });
    if (task.subtaskCount > 0) {
      meta.push({ text: `${task.subtaskCount - task.openSubtaskCount}/${task.subtaskCount}`, icon: "git-merge-outline" });
    }
    if (task.doDate) meta.push({ text: `Do ${friendlyDate(task.doDate)}`, icon: "play-circle-outline" });
    if (task.dueDate) {
      const overdue = !task.completed && isOverdue(task.dueDate);
      meta.push({ text: friendlyDate(task.dueDate), icon: "calendar-outline", color: overdue ? theme.danger : undefined });
    }
    if (task.showInCalendar) meta.push({ text: "", icon: "calendar-number-outline" });
    if (task.note.trim()) meta.push({ text: "", icon: "document-text-outline" });
  }
  const showPills = !checklist && !task.completed;
  const showProgress = showPills && (task.subtaskCount > 0 || task.progress > 0);

  return (
    <Pressable
      onPress={onOpen}
      className="active:opacity-80"
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: checklist ? 48 : 56,
        marginBottom: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.cardBorder,
        paddingLeft: 16,
        paddingRight: checklist ? 16 : 6,
        paddingVertical: 10,
        backgroundColor: theme.card,
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityLabel={task.completed ? "Mark as not completed" : "Mark as completed"}
        hitSlop={10}
      >
        {task.completed ? (
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: checklist ? 7 : 12,
              backgroundColor: accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          </View>
        ) : (
          <View
            style={{ width: 24, height: 24, borderRadius: checklist ? 7 : 12, borderWidth: 2, borderColor: theme.circle }}
          />
        )}
      </Pressable>
      <View style={{ flex: 1, marginLeft: 14, marginRight: 8 }}>
        {showPills && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <TaskNumber number={task.number} />
            <StatusPill status={task.status} />
            <PriorityPill priority={task.priority} />
          </View>
        )}
        <Text
          style={{
            fontSize: 16,
            lineHeight: 21,
            color: task.completed ? theme.textFaint : theme.text,
            textDecorationLine: task.completed ? "line-through" : "none",
          }}
        >
          {task.title}
        </Text>
        {meta.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 3 }}>
            {meta.map((m, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center" }}>
                {i > 0 && <Text style={{ color: theme.textFaint, fontSize: 13 }}>{"  •  "}</Text>}
                {m.icon && <Ionicons name={m.icon} size={13} color={m.color ?? theme.textFaint} style={{ marginRight: m.text ? 4 : 0 }} />}
                {!!m.text && <Text style={{ color: m.color ?? theme.textFaint, fontSize: 13 }}>{m.text}</Text>}
              </View>
            ))}
          </View>
        )}
        {showProgress && (
          <View style={{ marginTop: 6 }}>
            <ProgressBar value={task.progress} color={accent} />
          </View>
        )}
      </View>
      {!checklist && (
        <Pressable
          onPress={onStar}
          accessibilityLabel={task.important ? "Remove importance" : "Mark as important"}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name={task.important ? "star" : "star-outline"} size={22} color={task.important ? accent : theme.circle} />
        </Pressable>
      )}
    </Pressable>
  );
}
