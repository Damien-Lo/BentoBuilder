import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { openListOptions } from "@/src/components/todo/listActions";
import { TextPromptModal } from "@/src/components/todo/TextPromptModal";
import {
  friendlyDate,
  isOverdue,
  listAccent,
  longToday,
  SMART_LISTS,
  useTodoTheme,
  type TodoTheme,
} from "@/src/components/todo/theme";
import {
  createTodoTask,
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
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const accent = listAccent(smart?.color ?? list?.color, theme);
  const title = smart?.name ?? list?.name ?? "";

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

  function toggleComplete(task: TodoTask) {
    patchLocal(task._id, { completed: !task.completed });
    updateTodoTask(task._id, { completed: !task.completed })
      .then(({ next }) => {
        // A repeating task spawned its next occurrence — reload so it shows
        // wherever it belongs.
        if (next) refresh();
      })
      .catch((error) => {
        patchLocal(task._id, { completed: task.completed });
        fail(error);
      });
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

  async function addTask() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    try {
      const created = await createTodoTask({
        title: text,
        list: smart ? undefined : id,
        myDayDate: smart?.id === "myday" ? todayStr() : null,
        important: smart?.id === "important",
        dueDate: smart?.id === "planned" ? todayStr() : null,
      });
      setTasks((prev) => [...prev, created]);
    } catch (error) {
      fail(error);
    }
  }

  const sortForView = (list: TodoTask[]) =>
    smart?.id === "planned"
      ? [...list].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
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
                : `${open.length} task${open.length === 1 ? "" : "s"}${done.length ? ` · ${done.length} completed` : ""}`}
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
                })
              }
              className="active:bg-slate-100"
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={theme.icon} />
            </Pressable>
          )}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}>

          {open.length === 0 && done.length === 0 && (
            <Text style={{ color: theme.textFaint, fontSize: 16, textAlign: "center", marginTop: 48 }}>
              {smart?.id === "myday" ? "Nothing planned for today yet." : "No tasks yet."}
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
              onOpen={() => router.push({ pathname: "/lists/task/[id]", params: { id: task._id } })}
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
                <Text style={{ marginLeft: 6, color: theme.icon, fontSize: 14, fontWeight: "600" }}>Completed</Text>
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
                    onOpen={() => router.push({ pathname: "/lists/task/[id]", params: { id: task._id } })}
                  />
                ))}
            </>
          )}
        </ScrollView>

        {/* Add a Task */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: adding ? 10 : 28,
            backgroundColor: theme.headerBg,
            borderTopWidth: 1,
            borderTopColor: theme.cardBorder,
          }}
        >
          <Pressable
            onPress={() => {
              setAdding(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              minHeight: 52,
              borderRadius: 16,
              paddingHorizontal: 16,
              backgroundColor: theme.bg,
              borderWidth: 1,
              borderColor: theme.cardBorder,
            }}
          >
            <Ionicons name={adding ? "ellipse-outline" : "add"} size={adding ? 24 : 26} color={adding ? theme.circle : accent} />
            {adding ? (
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a Task"
                placeholderTextColor={theme.textFaint}
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={() => void addTask()}
                onBlur={() => {
                  if (!draft.trim()) setAdding(false);
                }}
                style={{ flex: 1, marginLeft: 12, fontSize: 16, color: theme.text, paddingVertical: 12 }}
              />
            ) : (
              <Text style={{ marginLeft: 12, fontSize: 16, fontWeight: "600", color: accent }}>Add a Task</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

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
  onToggle,
  onStar,
  onOpen,
}: {
  task: TodoTask;
  theme: TodoTheme;
  accent: string;
  showListName: boolean;
  inMyDayView: boolean;
  onToggle: () => void;
  onStar: () => void;
  onOpen: () => void;
}) {
  const doneSteps = task.steps.filter((s) => s.completed).length;
  const meta: { text: string; icon?: keyof typeof Ionicons.glyphMap; color?: string }[] = [];
  if (showListName) meta.push({ text: task.list.name });
  if (!inMyDayView && task.myDayDate === todayStr()) meta.push({ text: "My Day", icon: "sunny-outline" });
  if (task.steps.length > 0) meta.push({ text: `${doneSteps} of ${task.steps.length}` });
  if (task.dueDate) {
    const overdue = !task.completed && isOverdue(task.dueDate);
    meta.push({ text: friendlyDate(task.dueDate), icon: "calendar-outline", color: overdue ? theme.danger : undefined });
  }
  if (task.repeat) meta.push({ text: "", icon: "repeat" });
  if (task.note.trim()) meta.push({ text: "", icon: "document-text-outline" });

  return (
    <Pressable
      onPress={onOpen}
      className="active:opacity-80"
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 56,
        marginBottom: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.cardBorder,
        paddingLeft: 16,
        paddingRight: 6,
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
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          </View>
        ) : (
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: theme.circle }} />
        )}
      </Pressable>
      <View style={{ flex: 1, marginLeft: 14, marginRight: 8 }}>
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
      </View>
      <Pressable
        onPress={onStar}
        accessibilityLabel={task.important ? "Remove importance" : "Mark as important"}
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name={task.important ? "star" : "star-outline"} size={22} color={task.important ? accent : theme.circle} />
      </Pressable>
    </Pressable>
  );
}
