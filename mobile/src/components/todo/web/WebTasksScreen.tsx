import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import {
  createTodoList,
  createTodoTask,
  getDeletedTasks,
  getListTasks,
  getSmartTasks,
  getTodoOverview,
  updateTodoList,
  updateTodoTask,
  type SmartListId,
  type TodoList,
  type TodoOverview,
  type TodoTask,
} from "@/src/services/todoApi";
import { todayStr } from "@/src/utils/mealPlan";

import { AddTaskBar, type NewTaskInput } from "../AddTaskBar";
import { openListOptions } from "../listActions";
import { PriorityPill, StatusPill, TaskNumber } from "../TaskBits";
import { TaskDetail } from "../TaskDetail";
import { TextPromptModal } from "../TextPromptModal";
import { friendlyDate, isOverdue, listAccent, longToday, SMART_LISTS, useTodoTheme } from "../theme";

// Tasks in a desktop browser, laid out like Microsoft To Do on the web:
// the lists down the left, the chosen list's tasks in the middle with the
// add bar on top, and the task you click opening in a panel on the right
// rather than as a page of its own. Same data and behaviour as the phone.

const LISTS_WIDTH = 270;
const DETAIL_WIDTH = 440;

type Row = { hovered?: boolean };

export function WebTasksScreen() {
  const router = useRouter();
  const theme = useTodoTheme();
  const [overview, setOverview] = useState<TodoOverview | null>(null);
  const [deletedCount, setDeletedCount] = useState(0);
  // A smart list's id ("myday", …) or a list's own id.
  const [selected, setSelected] = useState<string>("myday");
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  // The task open on the right, then any subtasks drilled into from it.
  const [detail, setDetail] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<"newList" | "rename" | null>(null);

  const smart = SMART_LISTS.find((s) => s.id === selected);
  const lists = (overview?.lists ?? [])
    .filter((l) => l.type !== "checklist")
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.order - b.order);
  const list = smart ? null : lists.find((l) => l._id === selected) ?? null;
  const accent = listAccent(smart?.color ?? list?.color, theme);
  const title = smart?.name ?? list?.name ?? "";

  const fail = (error: unknown) =>
    Alert.alert("Something went wrong", error instanceof Error ? error.message : "Please try again.");

  const loadOverview = useCallback(() => {
    getTodoOverview().then(setOverview).catch(fail);
    getDeletedTasks().then((d) => setDeletedCount(d.length)).catch(() => {});
  }, []);

  const loadTasks = useCallback((which: string) => {
    const isSmart = SMART_LISTS.some((s) => s.id === which);
    (isSmart ? getSmartTasks(which as SmartListId) : getListTasks(which))
      .then((loaded) => {
        setTasks(loaded);
        setLoadedFor(which);
      })
      .catch(fail);
  }, []);

  const refresh = useCallback(() => {
    loadOverview();
    loadTasks(selected);
  }, [loadOverview, loadTasks, selected]);

  useFocusEffect(
    useCallback(() => {
      loadOverview();
    }, [loadOverview]),
  );
  useEffect(() => loadTasks(selected), [selected, loadTasks]);

  function pick(id: string) {
    setSelected(id);
    setDetail([]);
  }

  function patchLocal(taskId: string, changes: Partial<TodoTask>) {
    setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, ...changes } : t)));
  }

  function setCompleted(task: TodoTask, completed: boolean, completeSubtasks = false) {
    patchLocal(task._id, { completed });
    updateTodoTask(task._id, { completed, completeSubtasks }).then(refresh, (error) => {
      patchLocal(task._id, { completed: task.completed });
      fail(error);
    });
  }

  // Ticking off a task that still has open subtasks warns first.
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

  function toggleImportant(task: TodoTask) {
    patchLocal(task._id, { important: !task.important });
    updateTodoTask(task._id, { important: !task.important }).then(refresh, (error) => {
      patchLocal(task._id, { important: task.important });
      fail(error);
    });
  }

  async function addTask(input: NewTaskInput) {
    try {
      await createTodoTask({
        title: input.title,
        list: smart ? undefined : selected,
        myDayDate: input.myDay ? todayStr() : null,
        important: smart?.id === "important",
        dueDate: input.dueDate,
        doDate: input.doDate,
        description: input.description,
      });
      refresh();
    } catch (error) {
      fail(error);
    }
  }

  const ready = loadedFor === selected;
  const open = tasks
    .filter((t) => !t.completed)
    .sort((a, b) =>
      smart?.id === "planned" ? (a.doDate ?? a.dueDate ?? "").localeCompare(b.doDate ?? b.dueDate ?? "") : 0,
    );
  const done = tasks.filter((t) => t.completed).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const openId = detail[detail.length - 1];

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: "#FFFFFF" }}>
      {/* Lists */}
      <View style={{ width: LISTS_WIDTH, borderRightWidth: 1, borderRightColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
        <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 16 }} showsVerticalScrollIndicator={false}>
          {SMART_LISTS.map((s) => (
            <ListRow
              key={s.id}
              icon={s.icon}
              color={listAccent(s.color, theme)}
              label={s.name}
              count={overview?.smartCounts[s.id] ?? 0}
              on={selected === s.id}
              onPress={() => pick(s.id)}
            />
          ))}

          <View style={{ height: 1, backgroundColor: "#E2E8F0", marginVertical: 10, marginHorizontal: 8 }} />

          {lists.map((l) => (
            <ListRow
              key={l._id}
              icon={l.isDefault ? "home-outline" : "list-outline"}
              color={listAccent(l.color, theme)}
              label={l.name}
              count={l.openCount ?? 0}
              on={selected === l._id}
              onPress={() => pick(l._id)}
            />
          ))}

          <View style={{ height: 1, backgroundColor: "#E2E8F0", marginVertical: 10, marginHorizontal: 8 }} />

          <ListRow
            icon="trash-outline"
            color="#64748B"
            label="Recently deleted"
            count={deletedCount}
            on={false}
            onPress={() => router.push("/lists/deleted")}
          />
        </ScrollView>

        <Pressable
          onPress={() => setPrompt("newList")}
          style={({ hovered }: Row) => ({
            flexDirection: "row",
            alignItems: "center",
            height: 48,
            paddingHorizontal: 20,
            borderTopWidth: 1,
            borderTopColor: "#E2E8F0",
            backgroundColor: hovered ? "#EEF2F7" : "transparent",
          })}
        >
          <Ionicons name="add" size={20} color="#2563EB" />
          <Text style={{ marginLeft: 10, fontSize: 14, fontWeight: "600", color: "#2563EB" }}>New list</Text>
        </Pressable>
      </View>

      {/* The chosen list's tasks */}
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 28, paddingTop: 24, paddingBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 26, fontWeight: "700", color: accent }}>
              {title}
            </Text>
            {smart?.id === "myday" && <Text style={{ marginTop: 2, fontSize: 13, color: "#64748B" }}>{longToday()}</Text>}
          </View>
          {list && (
            <Pressable
              onPress={() =>
                openListOptions({
                  list,
                  groups: overview?.groups ?? [],
                  onRename: () => setPrompt("rename"),
                  onChanged: refresh,
                  onDeleted: () => {
                    pick("myday");
                    loadOverview();
                  },
                })
              }
              accessibilityLabel="List options"
              style={({ hovered }: Row) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: hovered ? "#E2E8F0" : "transparent",
              })}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#475569" />
            </Pressable>
          )}
        </View>

        <View style={{ paddingHorizontal: 28 }}>
          <AddTaskBar accent={accent} checklist={false} defaults={{ myDay: smart?.id === "myday" }} onAdd={(input) => void addTask(input)} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 12, paddingBottom: 40 }}>
          {ready && open.length === 0 && done.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Ionicons name="checkmark-done-outline" size={40} color="#CBD5E1" />
              <Text style={{ marginTop: 10, fontSize: 15, fontWeight: "600", color: "#475569" }}>Nothing here yet</Text>
              <Text style={{ marginTop: 2, fontSize: 13, color: "#94A3B8" }}>Add a task above to get started.</Text>
            </View>
          )}

          {open.map((task) => (
            <TaskRow
              key={task._id}
              task={task}
              accent={accent}
              showList={!!smart}
              selected={detail[0] === task._id}
              onOpen={() => setDetail([task._id])}
              onToggle={() => toggleComplete(task)}
              onStar={() => toggleImportant(task)}
            />
          ))}

          {done.length > 0 && (
            <>
              <Pressable
                onPress={() => setShowCompleted((v) => !v)}
                style={({ hovered }: Row) => ({
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 14,
                  marginBottom: 8,
                  paddingHorizontal: 10,
                  height: 30,
                  borderRadius: 8,
                  backgroundColor: hovered ? "#E2E8F0" : "#EEF2F7",
                })}
              >
                <Ionicons name={showCompleted ? "chevron-down" : "chevron-forward"} size={14} color="#475569" />
                <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: "#475569" }}>Completed  {done.length}</Text>
              </Pressable>
              {showCompleted &&
                done.map((task) => (
                  <TaskRow
                    key={task._id}
                    task={task}
                    accent={accent}
                    showList={!!smart}
                    selected={detail[0] === task._id}
                    onOpen={() => setDetail([task._id])}
                    onToggle={() => toggleComplete(task)}
                    onStar={() => toggleImportant(task)}
                  />
                ))}
            </>
          )}
        </ScrollView>
      </View>

      {/* The open task */}
      {openId && (
        <View style={{ width: DETAIL_WIDTH, borderLeftWidth: 1, borderLeftColor: "#E2E8F0", backgroundColor: "#F8FAFC" }}>
          <TaskDetail
            key={openId}
            id={openId}
            mode="sheet"
            canGoBack={detail.length > 1}
            onOpenSubtask={(id) => setDetail((prev) => [...prev, id])}
            // Back up one level, or (deleted / failed to load) close.
            onExit={() => {
              setDetail((prev) => prev.slice(0, -1));
              refresh();
            }}
            onClose={() => setDetail([])}
            onChanged={refresh}
          />
        </View>
      )}

      <TextPromptModal
        visible={prompt != null}
        title={prompt === "rename" ? "Rename list" : "New list"}
        placeholder="List name"
        initialValue={prompt === "rename" ? list?.name ?? "" : ""}
        confirmLabel={prompt === "rename" ? "Save" : "Create"}
        onCancel={() => setPrompt(null)}
        onSubmit={(name) => {
          const mode = prompt;
          setPrompt(null);
          if (mode === "rename" && list) {
            updateTodoList(list._id, { name }).then(refresh, fail);
          } else {
            createTodoList(name, "blue").then((created: TodoList) => {
              loadOverview();
              pick(created._id);
            }, fail);
          }
        }}
      />
    </View>
  );
}

function ListRow({
  icon,
  color,
  label,
  count,
  on,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  count: number;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: Row) => ({
        flexDirection: "row",
        alignItems: "center",
        height: 38,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: on ? "#E0EAFF" : hovered ? "#EEF2F7" : "transparent",
      })}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text numberOfLines={1} style={{ flex: 1, marginLeft: 12, fontSize: 14, fontWeight: on ? "700" : "500", color: "#0F172A" }}>
        {label}
      </Text>
      {count > 0 && <Text style={{ fontSize: 12, color: "#64748B" }}>{count}</Text>}
    </Pressable>
  );
}

function TaskRow({
  task,
  accent,
  showList,
  selected,
  onOpen,
  onToggle,
  onStar,
}: {
  task: TodoTask;
  accent: string;
  // In a smart list, say which list each task is from.
  showList: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onStar: () => void;
}) {
  const overdue = !task.completed && !!task.dueDate && isOverdue(task.dueDate);
  const meta = [
    showList ? task.list?.name : null,
    task.subtaskCount > 0 ? `${task.subtaskCount - task.openSubtaskCount} of ${task.subtaskCount}` : null,
    task.workBlocks.length ? `${task.workBlocks.length} time${task.workBlocks.length === 1 ? "" : "s"} booked` : task.doDate ? `Do ${friendlyDate(task.doDate)}` : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onOpen}
      style={({ hovered }: Row) => ({
        flexDirection: "row",
        alignItems: "center",
        minHeight: 54,
        marginBottom: 6,
        paddingLeft: 6,
        paddingRight: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: selected ? "#93C5FD" : "#E2E8F0",
        backgroundColor: selected ? "#EFF6FF" : hovered ? "#F1F5F9" : "#FFFFFF",
      })}
    >
      <Pressable
        onPress={onToggle}
        accessibilityLabel={task.completed ? "Mark as not done" : "Mark as done"}
        style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        {({ hovered }: Row) => (
          <Ionicons
            name={task.completed ? "checkmark-circle" : hovered ? "checkmark-circle-outline" : "ellipse-outline"}
            size={22}
            color={task.completed ? accent : hovered ? accent : "#94A3B8"}
          />
        )}
      </Pressable>

      <View style={{ flex: 1, paddingVertical: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontSize: 15,
              color: task.completed ? "#94A3B8" : "#0F172A",
              textDecorationLine: task.completed ? "line-through" : "none",
            }}
          >
            {task.title}
          </Text>
          <TaskNumber number={task.number} />
        </View>
        <View style={{ marginTop: 3, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          {!task.completed && task.status !== "not_started" && <StatusPill status={task.status} />}
          {!task.completed && task.priority !== "medium" && <PriorityPill priority={task.priority} />}
          {meta.length > 0 && <Text style={{ fontSize: 12, color: "#64748B" }}>{meta.join("  ·  ")}</Text>}
          {!!task.dueDate && (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="calendar-outline" size={12} color={overdue ? "#DC2626" : "#64748B"} />
              <Text style={{ marginLeft: 3, fontSize: 12, color: overdue ? "#DC2626" : "#64748B" }}>Due {friendlyDate(task.dueDate)}</Text>
            </View>
          )}
        </View>
      </View>

      <Pressable
        onPress={onStar}
        accessibilityLabel={task.important ? "Remove importance" : "Mark as important"}
        style={{ width: 36, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name={task.important ? "star" : "star-outline"} size={19} color={task.important ? accent : "#94A3B8"} />
      </Pressable>
    </Pressable>
  );
}
