import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
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

import { DatePickerModal, FormCard } from "@/src/components/forms";
import { PriorityPill, ProgressBar, StatusPill, TaskNumber } from "@/src/components/todo/TaskBits";
import { countDescriptions, DescriptionOutline, SubtaskTree } from "@/src/components/todo/TaskTree";
import {
  friendlyDate,
  isOverdue,
  listAccent,
  shortDateFromIso,
  showActions,
  TASK_PRIORITIES,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_STATUSES,
  useTodoTheme,
} from "@/src/components/todo/theme";
import {
  createTodoTask,
  deleteTodoTask,
  getTodoTask,
  moveTodoTask,
  updateTodoTask,
  type TodoSubtask,
  type TodoTask,
  type TodoTaskChanges,
  type TodoTaskDetail,
} from "@/src/services/todoApi";
import { todayStr } from "@/src/utils/mealPlan";

// Subtasks nest this deep below a top-level task (matches the server).
const MAX_DEPTH = 2;

const splitList = (text: string) =>
  text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

export interface TaskDetailProps {
  id: string;
  // "page": the task's own screen. "sheet": a subtask shown in the overlay
  // that slides up over its task.
  mode: "page" | "sheet";
  // A subtask row was tapped.
  onOpenSubtask: (id: string) => void;
  // Page only, when it's showing a subtask: go up to its parent.
  onOpenParent?: (parentId: string) => void;
  // Leave this view: the task was deleted, couldn't load, or (page) Back.
  onExit: () => void;
  // Sheet only: close the whole overlay, and whether there's a sheet level
  // underneath to go back to.
  onClose?: () => void;
  canGoBack?: boolean;
  // Bump to reload (the page does when the overlay closes).
  refreshKey?: number;
}

// One task (or subtask) in full: status, priority, progress, due date,
// calendar toggle, tags, people, notes and its subtasks. Used as the task's
// page and, for subtasks, inside the overlay sheet.
export function TaskDetail({
  id,
  mode,
  onOpenSubtask,
  onOpenParent,
  onExit,
  onClose,
  canGoBack = false,
  refreshKey = 0,
}: TaskDetailProps) {
  const theme = useTodoTheme();
  const sheet = mode === "sheet";

  const [task, setTask] = useState<TodoTaskDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [parties, setParties] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  // Which date is being picked: this task's, or one of its subtasks'.
  const [pickingDateFor, setPickingDateFor] = useState<TodoTask | null>(null);
  const [pickingDoDate, setPickingDoDate] = useState(false);
  // The page stops scrolling while a subtask card is being dragged.
  const [treeDragging, setTreeDragging] = useState(false);
  // The sections below the summary are folded away until tapped, like the
  // add-ingredient page's. A subtask's card opens with its details showing.
  const [detailsOpen, setDetailsOpen] = useState(mode === "sheet");
  const [descriptionsOpen, setDescriptionsOpen] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);

  const fail = (error: unknown) =>
    Alert.alert("Something went wrong", error instanceof Error ? error.message : "Please try again.");

  const load = useCallback(() => {
    getTodoTask(id)
      .then(setTask)
      .catch((error) =>
        Alert.alert("Couldn't load task", error instanceof Error ? error.message : "Something went wrong.", [
          { text: "OK", onPress: onExit },
        ]),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useFocusEffect(load);
  useEffect(() => {
    if (refreshKey > 0) load();
  }, [refreshKey, load]);

  // Text fields follow the loaded task, but only when it's a different task
  // or the server's copy changed — never mid-typing.
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description);
    setNote(task.note);
    setTags(task.tags.join(", "));
    setParties(task.parties.join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?._id, task?.title, task?.description, task?.note, task?.tags.join(), task?.parties.join()]);

  // Saves a change to this task or one of its subtasks, then reloads so
  // progress and counts stay right.
  function save(target: Pick<TodoTask, "_id">, changes: TodoTaskChanges) {
    if (target._id === id) setTask((prev) => (prev ? { ...prev, ...changes } : prev));
    updateTodoTask(target._id, changes).then(load, (error) => {
      fail(error);
      load();
    });
  }

  // Ticking off something with open subtasks warns first; going ahead
  // completes them too.
  function toggleComplete(target: TodoTask) {
    if (!target.completed && target.openSubtaskCount > 0) {
      const n = target.openSubtaskCount;
      Alert.alert(
        "Complete with open subtasks?",
        `"${target.title}" still has ${n} open subtask${n === 1 ? "" : "s"}. Completing it will complete ${n === 1 ? "it" : "them"} too.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Complete all", onPress: () => save(target, { completed: true, completeSubtasks: true }) },
        ],
      );
      return;
    }
    save(target, { completed: !target.completed });
  }

  // The calendar shows a task on its due date, so it needs one first.
  function toggleCalendar(target: TodoTask) {
    if (!target.showInCalendar && !target.dueDate) {
      Alert.alert("Set a due date first", "The calendar shows a task on its due date.", [
        { text: "Cancel", style: "cancel" },
        { text: "Set due date", onPress: () => setPickingDateFor(target) },
      ]);
      return;
    }
    save(target, { showInCalendar: !target.showInCalendar });
  }

  function addSubtask() {
    const text = newSubtask.trim();
    if (!text || !task) return;
    setNewSubtask("");
    createTodoTask({ parent: task._id, title: text }).then(load, fail);
  }

  function confirmDelete() {
    if (!task) return;
    Alert.alert(
      `Delete "${task.title}"?`,
      task.subtaskCount > 0 ? `Its ${task.subtaskCount} subtask${task.subtaskCount === 1 ? "" : "s"} will be deleted too.` : undefined,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteTodoTask(task._id).then(onExit, fail) },
      ],
    );
  }

  if (!task) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  const accent = listAccent(task.list.color, theme);
  const isSubtask = task.depth > 0;
  const parent = task.ancestors[task.ancestors.length - 1];
  const overdue = !!task.dueDate && !task.completed && isOverdue(task.dueDate);
  const canHaveSubtasks = task.depth < MAX_DEPTH;
  const descriptionCount = countDescriptions(task, task.subtasks);
  // What the folded Details header says, e.g. "Due Thu, 8 Oct · In calendar · 2 tags".
  const detailsSummary =
    [
      task.doDate ? `Do ${friendlyDate(task.doDate)}` : null,
      task.dueDate ? `Due ${friendlyDate(task.dueDate)}${overdue ? " (overdue)" : ""}` : null,
      task.showInCalendar ? "In calendar" : null,
      task.tags.length ? `${task.tags.length} tag${task.tags.length === 1 ? "" : "s"}` : null,
      task.parties.length ? task.parties.join(", ") : null,
      task.note.trim() ? "Notes" : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Due date, calendar, tags, people and notes";

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={sheet ? ["left", "right"] : ["top", "left", "right"]}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View className="flex-row items-center border-b border-slate-200 bg-white px-3 py-2.5">
          <Pressable
            onPress={sheet && !canGoBack ? onClose : onExit}
            accessibilityLabel={sheet && !canGoBack ? "Close" : "Back"}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100"
          >
            <Ionicons name={sheet && !canGoBack ? "close" : "chevron-back"} size={26} color="#0F172A" />
          </Pressable>
          <View className="ml-1 flex-1">
            <Text className="text-lg font-bold text-slate-950" numberOfLines={1}>
              {isSubtask ? (task.depth > 1 ? "Sub-subtask" : "Subtask") : "Task"}
            </Text>
            {/* The path down to here, so it's clear how deep this is. */}
            <Text className="text-xs text-slate-500" numberOfLines={1}>
              {(sheet ? task.ancestors.map((a) => a.title) : [task.list.name, ...task.ancestors.map((a) => a.title)]).join("  ›  ")}
            </Text>
          </View>
          <Pressable
            onPress={confirmDelete}
            accessibilityLabel="Delete task"
            className="h-10 w-10 items-center justify-center rounded-xl bg-red-50 active:bg-red-100"
          >
            <Ionicons name="trash-outline" size={19} color="#DC2626" />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          scrollEnabled={!treeDragging}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {parent && onOpenParent && (
            <Pressable
              onPress={() => onOpenParent(parent._id)}
              className="mb-3 flex-row items-center rounded-2xl bg-blue-50 px-4 py-2.5 active:bg-blue-100"
            >
              <Ionicons name="return-up-back-outline" size={16} color="#1D4ED8" />
              <Text className="ml-2 flex-1 text-sm text-blue-800" numberOfLines={1}>
                Part of <Text className="font-semibold">{parent.title}</Text>
              </Text>
            </Pressable>
          )}

          {/* Summary */}
          <Card>
            <View className="px-4 pt-4">
              <View className="flex-row flex-wrap items-center gap-2">
                <TaskNumber number={task.number} />
                <Pressable
                  hitSlop={6}
                  onPress={() =>
                    showActions(
                      "Status",
                      TASK_STATUSES.map((status) => ({
                        label: `${TASK_STATUS_META[status].label}${status === task.status ? " ✓" : ""}`,
                        onPress: () => (status === "completed" ? toggleCompleteTo(true) : save(task, { status })),
                      })),
                    )
                  }
                >
                  <StatusPill status={task.status} />
                </Pressable>
                <Pressable
                  hitSlop={6}
                  onPress={() =>
                    showActions(
                      "Priority",
                      TASK_PRIORITIES.map((priority) => ({
                        label: `${TASK_PRIORITY_META[priority].label}${priority === task.priority ? " ✓" : ""}`,
                        onPress: () => save(task, { priority }),
                      })),
                    )
                  }
                >
                  <PriorityPill priority={task.priority} />
                </Pressable>
                {!isSubtask && (
                  <Pressable
                    hitSlop={8}
                    onPress={() => save(task, { important: !task.important })}
                    accessibilityLabel={task.important ? "Remove importance" : "Mark as important"}
                    className="ml-auto"
                  >
                    <Ionicons name={task.important ? "star" : "star-outline"} size={22} color={task.important ? accent : "#94A3B8"} />
                  </Pressable>
                )}
              </View>

              <TextInput
                value={title}
                onChangeText={setTitle}
                onBlur={() => {
                  const trimmed = title.trim();
                  if (!trimmed) setTitle(task.title);
                  else if (trimmed !== task.title) save(task, { title: trimmed });
                }}
                multiline
                blurOnSubmit
                returnKeyType="done"
                placeholder="Title"
                placeholderTextColor="#94A3B8"
                className={`mt-2 text-xl font-bold ${task.completed ? "text-slate-400 line-through" : "text-slate-950"}`}
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                onBlur={() => description.trim() !== task.description && save(task, { description: description.trim() })}
                multiline
                placeholder="Add a description"
                placeholderTextColor="#94A3B8"
                className="mt-1 pb-1 text-[15px] leading-5 text-slate-700"
              />

              <View className="mb-1.5 mt-3 flex-row items-center justify-between">
                <Text className="text-xs font-medium text-slate-500">
                  Progress
                  {task.subtaskCount > 0 ? ` · ${task.subtaskCount - task.openSubtaskCount} of ${task.subtaskCount} subtasks` : ""}
                </Text>
                <Text className="text-sm font-bold text-slate-900">{task.progress}%</Text>
              </View>
              <ProgressBar value={task.progress} color={accent} />
              {task.subtaskCount === 0 && !task.completed && (
                <View className="mt-2 flex-row gap-1.5">
                  {[0, 25, 50, 75].map((value) => {
                    const on = task.manualProgress === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => save(task, { manualProgress: value })}
                        className={`flex-1 items-center rounded-lg py-1.5 ${on ? "bg-blue-600" : "bg-slate-100 active:bg-slate-200"}`}
                      >
                        <Text className={`text-xs font-semibold ${on ? "text-white" : "text-slate-600"}`}>{value}%</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <Pressable
              onPress={() => toggleComplete(task)}
              className={`mx-4 mb-4 mt-4 flex-row items-center justify-center rounded-2xl py-3 ${
                task.completed ? "bg-slate-100 active:bg-slate-200" : "bg-blue-600 active:bg-blue-700"
              }`}
            >
              <Ionicons
                name={task.completed ? "arrow-undo-outline" : "checkmark-circle-outline"}
                size={18}
                color={task.completed ? "#475569" : "white"}
              />
              <Text className={`ml-2 text-sm font-semibold ${task.completed ? "text-slate-600" : "text-white"}`}>
                {task.completed ? "Mark as not completed" : "Complete"}
              </Text>
            </Pressable>
          </Card>

          {/* Details */}
          <FormCard
            icon="information-circle-outline"
            title="Details"
            description={detailsSummary}
            expanded={detailsOpen}
            onToggle={() => setDetailsOpen((v) => !v)}
          >
            <View className="-mx-4 mt-3 border-t border-slate-100">
            <Row icon="calendar-outline" label="Due date" onPress={() => setPickingDateFor(task)}>
              <Text className={`text-base ${overdue ? "font-semibold text-red-600" : task.dueDate ? "text-slate-900" : "text-slate-400"}`}>
                {task.dueDate ? `${friendlyDate(task.dueDate)}${overdue ? " (overdue)" : ""}` : "None"}
              </Text>
              {task.dueDate && (
                <Pressable hitSlop={10} onPress={() => save(task, { dueDate: null, showInCalendar: false })} className="ml-2">
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </Pressable>
              )}
            </Row>
            <Row icon="play-circle-outline" label="Do date" border onPress={() => setPickingDoDate(true)}>
              <Text className={`text-base ${task.doDate ? "text-slate-900" : "text-slate-400"}`}>
                {task.doDate ? friendlyDate(task.doDate) : "None"}
              </Text>
              {task.doDate && (
                <Pressable hitSlop={10} onPress={() => save(task, { doDate: null })} className="ml-2">
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </Pressable>
              )}
            </Row>
            <Row icon="calendar-number-outline" label="Show in calendar" border onPress={() => toggleCalendar(task)}>
              <Toggle value={task.showInCalendar} />
            </Row>
            {!isSubtask && (
              <Row
                icon="sunny-outline"
                label="My Day"
                border
                onPress={() => save(task, { myDayDate: task.myDayDate === todayStr() ? null : todayStr() })}
              >
                <Toggle value={task.myDayDate === todayStr()} />
              </Row>
            )}
            <Field icon="pricetag-outline" label="Tags" border>
              <TextInput
                value={tags}
                onChangeText={setTags}
                onBlur={() => splitList(tags).join() !== task.tags.join() && save(task, { tags: splitList(tags) })}
                placeholder="e.g. home, planning"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                className="text-base text-slate-900"
              />
            </Field>
            <Field icon="people-outline" label="Relevant parties" border>
              <TextInput
                value={parties}
                onChangeText={setParties}
                onBlur={() => splitList(parties).join() !== task.parties.join() && save(task, { parties: splitList(parties) })}
                placeholder="e.g. Landlord, HR"
                placeholderTextColor="#94A3B8"
                className="text-base text-slate-900"
              />
            </Field>
            <Field icon="document-text-outline" label="Notes" border>
              <TextInput
                value={note}
                onChangeText={setNote}
                onBlur={() => note.trim() !== task.note && save(task, { note: note.trim() })}
                placeholder="Add notes"
                placeholderTextColor="#94A3B8"
                multiline
                className="text-base leading-5 text-slate-900"
                style={{ minHeight: 44 }}
              />
            </Field>
            <Text className="px-4 pb-1 text-xs text-slate-400">Separate tags and people with commas.</Text>
            </View>
          </FormCard>

          {/* Every description, top to bottom (the task's page only). */}
          {!sheet && descriptionCount > 0 && (
            <FormCard
              icon="reader-outline"
              title="All descriptions"
              description={`${descriptionCount} description${descriptionCount === 1 ? "" : "s"} across this task and its subtasks`}
              expanded={descriptionsOpen}
              onToggle={() => setDescriptionsOpen((v) => !v)}
            >
              <DescriptionOutline task={task} subtasks={task.subtasks} accent={accent} />
            </FormCard>
          )}

          {/* Subtasks */}
          {canHaveSubtasks && (
            <FormCard
              icon="git-merge-outline"
              title={`Subtasks (${task.subtaskCount})`}
              description={
                task.subtaskCount === 0
                  ? "Break this down into smaller steps."
                  : `${task.subtaskCount - task.openSubtaskCount} of ${task.subtaskCount} done`
              }
              expanded={subtasksOpen}
              onToggle={() => setSubtasksOpen((v) => !v)}
            >
              <View className="-mx-4 mt-3">
              {task.subtasks.length === 0 && (
                <Text className="px-4 pb-3 text-sm text-slate-400">No subtasks yet.</Text>
              )}
              {/* The task's page shows the whole tree; a subtask's card
                  just lists what's directly under it. */}
              {!sheet && (
                <SubtaskTree
                  subtasks={task.subtasks}
                  rootId={task._id}
                  maxLevel={MAX_DEPTH - task.depth - 1}
                  onMove={(subId, parentId, after) =>
                    moveTodoTask(subId, parentId, after).then(load, (error) => {
                      fail(error);
                      load();
                    })
                  }
                  onDragChange={setTreeDragging}
                  accent={accent}
                  onOpen={(s) => onOpenSubtask(s._id)}
                  onToggle={toggleComplete}
                />
              )}
              {sheet && task.subtasks.map((subtask) => (
                <SubtaskRows
                  key={subtask._id}
                  subtask={subtask}
                  level={0}
                  accent={accent}
                  onToggle={toggleComplete}
                  onOpen={(s) => onOpenSubtask(s._id)}
                  onPickDate={setPickingDateFor}
                  onToggleCalendar={toggleCalendar}
                />
              ))}
              <View className="flex-row items-center border-t border-slate-100 px-4">
                <Ionicons name="add" size={22} color={accent} />
                <TextInput
                  value={newSubtask}
                  onChangeText={setNewSubtask}
                  onSubmitEditing={addSubtask}
                  blurOnSubmit={false}
                  returnKeyType="done"
                  placeholder="Add subtask"
                  placeholderTextColor="#94A3B8"
                  className="ml-2 flex-1 text-base text-slate-900"
                  style={{ height: 46 }}
                />
              </View>
              </View>
            </FormCard>
          )}

          <Text className="mt-1 text-center text-xs text-slate-400">
            {task.completed && task.completedAt
              ? `Completed ${shortDateFromIso(task.completedAt)}`
              : `Created ${shortDateFromIso(task.createdAt)}`}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={pickingDateFor !== null}
        title="Due date"
        value={pickingDateFor?.dueDate ?? todayStr()}
        onCancel={() => setPickingDateFor(null)}
        onConfirm={(value) => {
          const target = pickingDateFor;
          setPickingDateFor(null);
          if (target) save(target, { dueDate: value });
        }}
      />
      <DatePickerModal
        visible={pickingDoDate}
        title="Do date"
        value={task.doDate ?? todayStr()}
        onCancel={() => setPickingDoDate(false)}
        onConfirm={(value) => {
          setPickingDoDate(false);
          save(task, { doDate: value });
        }}
      />
    </SafeAreaView>
  );

  // Choosing "Completed" from the status menu goes through the same
  // open-subtasks warning as the Complete button.
  function toggleCompleteTo(completed: boolean) {
    if (task && task.completed !== completed) toggleComplete(task);
  }
}

// A subtask row and, indented under it, its own subtasks.
function SubtaskRows({
  subtask,
  level,
  accent,
  onToggle,
  onOpen,
  onPickDate,
  onToggleCalendar,
}: {
  subtask: TodoSubtask;
  level: number;
  accent: string;
  onToggle: (task: TodoTask) => void;
  onOpen: (task: TodoTask) => void;
  onPickDate: (task: TodoTask) => void;
  onToggleCalendar: (task: TodoTask) => void;
}) {
  const overdue = !!subtask.dueDate && !subtask.completed && isOverdue(subtask.dueDate);
  return (
    <>
      <Pressable
        onPress={() => onOpen(subtask)}
        className="flex-row items-center border-t border-slate-100 py-2.5 pr-2 active:bg-slate-50"
        style={{ paddingLeft: 16 + level * 26 }}
      >
        <Pressable onPress={() => onToggle(subtask)} hitSlop={10} accessibilityLabel="Complete subtask">
          {subtask.completed ? (
            <View className="h-[22px] w-[22px] items-center justify-center rounded-full" style={{ backgroundColor: accent }}>
              <Ionicons name="checkmark" size={14} color="white" />
            </View>
          ) : (
            <View className="h-[22px] w-[22px] rounded-full border-2 border-slate-400" />
          )}
        </Pressable>
        <View className="ml-3 flex-1">
          <Text
            className={`text-[15px] ${subtask.completed ? "text-slate-400 line-through" : "text-slate-900"}`}
            numberOfLines={2}
          >
            {subtask.title}
          </Text>
          {(subtask.dueDate || subtask.subtaskCount > 0) && (
            <Text className={`mt-0.5 text-xs ${overdue ? "font-medium text-red-600" : "text-slate-500"}`}>
              {subtask.dueDate ? friendlyDate(subtask.dueDate) : ""}
              {subtask.dueDate && subtask.subtaskCount > 0 ? "  ·  " : ""}
              {subtask.subtaskCount > 0
                ? `${subtask.subtaskCount - subtask.openSubtaskCount}/${subtask.subtaskCount} done`
                : ""}
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => onPickDate(subtask)}
          accessibilityLabel="Set due date"
          className="h-9 w-9 items-center justify-center rounded-full active:bg-slate-100"
        >
          <Ionicons name="calendar-outline" size={18} color={subtask.dueDate ? "#475569" : "#CBD5E1"} />
        </Pressable>
        <Pressable
          onPress={() => onToggleCalendar(subtask)}
          accessibilityLabel={subtask.showInCalendar ? "Remove from calendar" : "Show in calendar"}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-slate-100"
        >
          <Ionicons
            name={subtask.showInCalendar ? "calendar-number" : "calendar-number-outline"}
            size={18}
            color={subtask.showInCalendar ? "#2563EB" : "#CBD5E1"}
          />
        </Pressable>
        <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
      </Pressable>
      {subtask.subtasks.map((child) => (
        <SubtaskRows
          key={child._id}
          subtask={child}
          level={level + 1}
          accent={accent}
          onToggle={onToggle}
          onOpen={onOpen}
          onPickDate={onPickDate}
          onToggleCalendar={onToggleCalendar}
        />
      ))}
    </>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <View className="mb-3 overflow-hidden rounded-3xl border border-slate-200 bg-white">{children}</View>;
}

function Row({
  icon,
  label,
  children,
  onPress,
  border = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  children?: ReactNode;
  onPress?: () => void;
  border?: boolean;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className={`flex-row items-center px-4 active:bg-slate-50 ${border ? "border-t border-slate-100" : ""}`}
      style={{ minHeight: 54 }}
    >
      <Ionicons name={icon} size={20} color="#64748B" />
      <Text className="ml-3 flex-1 text-base text-slate-900">{label}</Text>
      {children}
    </Pressable>
  );
}

function Field({
  icon,
  label,
  children,
  border = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  children: ReactNode;
  border?: boolean;
}) {
  return (
    <View className={`flex-row px-4 py-3 ${border ? "border-t border-slate-100" : ""}`}>
      <Ionicons name={icon} size={20} color="#64748B" style={{ marginTop: 2 }} />
      <View className="ml-3 flex-1">
        <Text className="mb-0.5 text-xs font-medium text-slate-500">{label}</Text>
        {children}
      </View>
    </View>
  );
}

// The app's own blue switch (same look as ToggleRow's).
function Toggle({ value }: { value: boolean }) {
  return (
    <View className={`h-7 w-12 justify-center rounded-full px-1 ${value ? "bg-blue-600" : "bg-slate-200"}`}>
      <View className="h-5 w-5 rounded-full bg-white" style={{ transform: [{ translateX: value ? 20 : 0 }] }} />
    </View>
  );
}
