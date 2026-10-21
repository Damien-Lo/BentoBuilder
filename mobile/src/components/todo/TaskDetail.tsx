import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode, useRef } from "react";
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
import { PriorityPill, ProgressBar, ProgressSlider, StatusPill, TaskNumber } from "@/src/components/todo/TaskBits";
import { Tap } from "@/src/components/ui/Tap";
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
  unscheduleTodoTask,
  updateTodoTask,
  type TodoSubtask,
  type TodoTask,
  type TodoTaskChanges,
  type TodoTaskDetail,
} from "@/src/services/todoApi";
import { minutesLabel } from "@/src/components/calendar/calendarUtils";
import { useOrbitPage, useOrbitTheme } from "@/src/theme/orbit";
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
  // Something about the task (or its subtasks) was saved — for a list
  // shown beside it, as on the desktop layout, to refresh.
  onChanged?: () => void;
}

// One task (or subtask) in full: status, priority, progress, due date,
// calendar toggle, tags, people, notes and its subtasks. Used as the task's
// page and, for subtasks, inside the overlay sheet. On an Orbit page (the
// phone's task page and its sheets) in Orbit's look; elsewhere (the desktop's
// task pane) as it was.
export function TaskDetail({
  id,
  mode,
  onOpenSubtask,
  onOpenParent,
  onExit,
  onClose,
  canGoBack = false,
  refreshKey = 0,
  onChanged,
}: TaskDetailProps) {
  const theme = useTodoTheme();
  const router = useRouter();
  const sheet = mode === "sheet";
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();

  const [task, setTask] = useState<TodoTaskDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [parties, setParties] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  // Which date is being picked: this task's, or one of its subtasks'.
  const [pickingDateFor, setPickingDateFor] = useState<TodoTask | null>(null);
  // In a project: picking the day work on it starts.
  const [pickingStart, setPickingStart] = useState(false);
  // The page stops scrolling while a subtask card is being dragged.
  const [treeDragging, setTreeDragging] = useState(false);
  // The percentage under the finger while the progress slider is dragged.
  const [progressPreview, setProgressPreview] = useState<number | null>(null);
  // The sections below the summary are folded away until tapped, like the
  // add-ingredient page's. A subtask's card opens with its details showing.
  const [detailsOpen, setDetailsOpen] = useState(mode === "sheet");
  const [descriptionsOpen, setDescriptionsOpen] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);

  const fail = (error: unknown) =>
    Alert.alert("Something went wrong", error instanceof Error ? error.message : "Please try again.");

  const loadedOnce = useRef(false);
  const load = useCallback(() => {
    getTodoTask(id)
      .then((loaded) => {
        setTask(loaded);
        // Every save ends in a reload, so a reload after the first means
        // something changed.
        if (loadedOnce.current) onChanged?.();
        loadedOnce.current = true;
      })
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

  // Opens the calendar in scheduling mode with this task selected, to drag
  // out a block of time for it. From a subtask's card, the card closes first.
  function openScheduler() {
    const go = () => router.push({ pathname: "/calendar", params: { schedule: id } });
    if (sheet && onClose) {
      onClose();
      setTimeout(go, 250);
    } else {
      go();
    }
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
      // Say what goes with it — booked time is removed from the calendar,
      // but removing booked time (the calendar, or Details) never does this.
      [
        "This deletes the task itself, not just its time in the calendar.",
        task.subtaskCount > 0 ? `Its ${task.subtaskCount} subtask${task.subtaskCount === 1 ? "" : "s"} will be deleted too.` : "",
        "You can restore it from Recently deleted for 30 days.",
      ]
        .filter(Boolean)
        .join(" "),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteTodoTask(task._id).then(onExit, fail) },
      ],
    );
  }

  if (!task) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50" style={o && { backgroundColor: o.canvas }}>
        <ActivityIndicator size="large" color={o?.muted ?? "#2563EB"} />
      </View>
    );
  }

  const accent = listAccent(task.list.color, theme);
  const isSubtask = task.depth > 0;
  // A project's own tasks (not their subtasks) have a place in its plan.
  const inProject = task.list.type === "project" && !isSubtask;
  const phases = [...(task.list.phases ?? [])].sort((a, b) => a.order - b.order);
  const parent = task.ancestors[task.ancestors.length - 1];
  const overdue = !!task.dueDate && !task.completed && isOverdue(task.dueDate);
  const canHaveSubtasks = task.depth < MAX_DEPTH;
  const descriptionCount = countDescriptions(task, task.subtasks);
  // What the folded Details header says, e.g. "Due Thu, 8 Oct · In calendar · 2 tags".
  const detailsSummary =
    [
      task.workBlocks.length
        ? `${task.workBlocks.length} time${task.workBlocks.length === 1 ? "" : "s"} scheduled`
        : task.doDate
          ? `Do ${friendlyDate(task.doDate)}`
          : null,
      task.dueDate ? `Due ${friendlyDate(task.dueDate)}${overdue ? " (overdue)" : ""}` : null,
      task.showInCalendar ? "In calendar" : null,
      task.tags.length ? `${task.tags.length} tag${task.tags.length === 1 ? "" : "s"}` : null,
      task.parties.length ? task.parties.join(", ") : null,
      task.note.trim() ? "Notes" : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Due date, calendar, tags, people and notes";

  // (Orbit's look: text in its greys, hairlines its border, the soft red of
  // something to delete.)
  const textColor = o && { color: o.text };
  const faintColor = o && { color: o.faint };
  const line = o && { borderColor: o.border };
  const dangerTint = dark ? "rgba(248,113,113,0.14)" : "#FEF2F2";
  const path = (sheet ? task.ancestors.map((a) => a.title) : [task.list.name, ...task.ancestors.map((a) => a.title)]).join("  ›  ");
  const kind = isSubtask ? (task.depth > 1 ? "Sub-subtask" : "Subtask") : "Task";

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={sheet ? ["left", "right"] : ["top", "left", "right"]} style={o && { backgroundColor: o.canvas }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header (Orbit: round buttons on the page itself, no band — on the
            task's page a large title under them, on a subtask's card the
            title between them) */}
        {o ? (
          <View style={{ paddingHorizontal: sheet ? 14 : 16, paddingTop: sheet ? 14 : 4, paddingBottom: sheet ? 4 : 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: sheet ? 0 : -4, minHeight: 40 }}>
              <Tap
                onPress={sheet && !canGoBack ? onClose : onExit}
                accessibilityLabel={sheet && !canGoBack ? "Close" : "Back"}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }}
                pressedStyle={{ backgroundColor: o.pill }}
              >
                <Ionicons name={sheet && !canGoBack ? "close" : "chevron-back"} size={sheet && !canGoBack ? 21 : 22} color={o.text} />
              </Tap>
              <View style={{ flex: 1, marginHorizontal: 4, alignItems: "center" }}>
                {sheet && (
                  <>
                    <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "800", color: o.text }}>
                      {kind}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: o.muted }}>
                      {path}
                    </Text>
                  </>
                )}
              </View>
              <Tap
                onPress={confirmDelete}
                accessibilityLabel="Delete task"
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: dangerTint }}
                pressedStyle={{ opacity: 0.7 }}
              >
                <Ionicons name="trash-outline" size={19} color={o.danger} />
              </Tap>
            </View>
            {!sheet && (
              <>
                <Text numberOfLines={1} style={{ marginTop: 12, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: o.text }}>
                  {kind}
                </Text>
                {/* Where it lives: its list (in the list's own colour), and
                    the tasks above it. */}
                <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center" }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, marginRight: 8, backgroundColor: accent }} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: "600", color: o.muted }}>
                    {path}
                  </Text>
                </View>
              </>
            )}
          </View>
        ) : (
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
              {kind}
            </Text>
            {/* The path down to here, so it's clear how deep this is. */}
            <Text className="text-xs text-slate-500" numberOfLines={1}>
              {path}
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
        )}

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingTop: o && !sheet ? 20 : o ? 12 : 16, paddingBottom: 48 }}
          scrollEnabled={!treeDragging}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {parent && onOpenParent && (
            <Tap
              onPress={() => onOpenParent(parent._id)}
              className="mb-3 flex-row items-center rounded-2xl bg-blue-50 px-4 py-2.5 active:bg-blue-100"
              style={o && { backgroundColor: o.accentSoft, borderRadius: 16 }}
              pressedStyle={o ? { opacity: 0.8 } : {}}
            >
              <Ionicons name="return-up-back-outline" size={16} color={o?.accent ?? "#1D4ED8"} />
              <Text className="ml-2 flex-1 text-sm text-blue-800" numberOfLines={1} style={o && { color: o.icon }}>
                Part of <Text className="font-semibold" style={o && { color: o.accent }}>{parent.title}</Text>
              </Text>
            </Tap>
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
                    <Ionicons name={task.important ? "star" : "star-outline"} size={22} color={task.important ? accent : o?.faint ?? "#94A3B8"} />
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
                placeholderTextColor={o?.faint ?? "#94A3B8"}
                className={`mt-2 text-xl font-bold ${task.completed ? "text-slate-400 line-through" : "text-slate-950"}`}
                style={o && { fontWeight: "800", letterSpacing: -0.3, color: task.completed ? o.faint : o.text }}
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                onBlur={() => description.trim() !== task.description && save(task, { description: description.trim() })}
                multiline
                placeholder="Add a description"
                placeholderTextColor={o?.faint ?? "#94A3B8"}
                className="mt-1 pb-1 text-[15px] leading-5 text-slate-700"
                style={o && { color: o.icon }}
              />

              <View className="mb-1.5 mt-3 flex-row items-center justify-between">
                <Text className="text-xs font-medium text-slate-500" style={o && { color: o.muted }}>
                  Progress
                  {task.subtaskCount > 0 ? ` · ${task.subtaskCount - task.openSubtaskCount} of ${task.subtaskCount} subtasks` : ""}
                </Text>
                <Text className="text-sm font-bold text-slate-900" style={textColor}>{progressPreview ?? task.progress}%</Text>
              </View>
              {task.subtaskCount === 0 && !task.completed ? (
                <ProgressSlider
                  value={task.progress}
                  color={accent}
                  onPreview={setProgressPreview}
                  onChange={(value) => {
                    // Show it at once; the server's figure follows.
                    setTask((prev) => (prev ? { ...prev, progress: value } : prev));
                    save(task, { manualProgress: value });
                  }}
                />
              ) : (
                <ProgressBar value={task.progress} color={accent} />
              )}
            </View>

            {/* (Orbit: the section's main button; undoing, a secondary pill.) */}
            <Tap
              onPress={() => toggleComplete(task)}
              className={`mx-4 mb-4 mt-4 flex-row items-center justify-center rounded-2xl py-3 ${
                task.completed ? "bg-slate-100 active:bg-slate-200" : "bg-blue-600 active:bg-blue-700"
              }`}
              style={o && { height: 52, paddingVertical: 0, borderRadius: 16, backgroundColor: task.completed ? o.pill : o.ink }}
              pressedStyle={o ? { opacity: 0.85 } : {}}
            >
              <Ionicons
                name={task.completed ? "arrow-undo-outline" : "checkmark-circle-outline"}
                size={18}
                color={o ? (task.completed ? o.onPill : o.onInk) : task.completed ? "#475569" : "white"}
              />
              <Text
                className={`ml-2 text-sm font-semibold ${task.completed ? "text-slate-600" : "text-white"}`}
                style={o && { fontSize: 15, color: task.completed ? o.onPill : o.onInk }}
              >
                {task.completed ? "Mark as not completed" : "Complete"}
              </Text>
            </Tap>
          </Card>

          {/* Details */}
          <FormCard
            icon="information-circle-outline"
            title="Details"
            description={detailsSummary}
            expanded={detailsOpen}
            onToggle={() => setDetailsOpen((v) => !v)}
          >
            <View className="-mx-4 mt-3 border-t border-slate-100" style={line}>
            <Row icon="calendar-outline" label="Due date" onPress={() => setPickingDateFor(task)}>
              <Text
                className={`text-base ${overdue ? "font-semibold text-red-600" : task.dueDate ? "text-slate-900" : "text-slate-400"}`}
                style={o && { color: overdue ? o.danger : task.dueDate ? o.text : o.faint }}
              >
                {task.dueDate ? `${friendlyDate(task.dueDate)}${overdue ? " (overdue)" : ""}` : "None"}
              </Text>
              {task.dueDate && (
                <Pressable hitSlop={10} onPress={() => save(task, { dueDate: null, showInCalendar: false })} className="ml-2">
                  <Ionicons name="close-circle" size={18} color={o?.faint ?? "#94A3B8"} />
                </Pressable>
              )}
            </Row>
            {/* In a project: when work starts (its span on the timeline with
                the due date), whether it's a milestone, and its phase. */}
            {inProject && !task.milestone && (
              <Row icon="flag-outline" label="Start date" border onPress={() => setPickingStart(true)}>
                <Text className={`text-base ${task.startDate ? "text-slate-900" : "text-slate-400"}`} style={o && (task.startDate ? textColor : faintColor)}>{task.startDate ? friendlyDate(task.startDate) : "None"}</Text>
                {task.startDate && (
                  <Pressable hitSlop={10} onPress={() => save(task, { startDate: null })} className="ml-2">
                    <Ionicons name="close-circle" size={18} color={o?.faint ?? "#94A3B8"} />
                  </Pressable>
                )}
              </Row>
            )}
            {inProject && (
              <Row icon="diamond-outline" label="Milestone" border onPress={() => save(task, { milestone: !task.milestone })}>
                <Toggle value={!!task.milestone} />
              </Row>
            )}
            {inProject && phases.length > 0 && (
              <Row
                icon="layers-outline"
                label="Phase"
                border
                onPress={() =>
                  showActions("Phase", [
                    ...phases.map((phase) => ({ label: phase._id === task.phase ? `${phase.name} ✓` : phase.name, onPress: () => save(task, { phase: phase._id }) })),
                    ...(task.phase ? [{ label: "No phase", onPress: () => save(task, { phase: null }) }] : []),
                  ])
                }
              >
                <Text className={`text-base ${phases.some((p) => p._id === task.phase) ? "text-slate-900" : "text-slate-400"}`} style={o && (phases.some((p) => p._id === task.phase) ? textColor : faintColor)}>{phases.find((p) => p._id === task.phase)?.name ?? "None"}</Text>
                <Ionicons name="chevron-forward" size={16} color={o?.faint ?? "#CBD5E1"} style={{ marginLeft: 4 }} />
              </Row>
            )}
            {/* Do date: tapping it opens the calendar to drag out a block of
                time for this task alone. */}
            <Row icon="play-circle-outline" label="Do date" border onPress={openScheduler}>
              <Text className={`text-base ${task.workBlocks.length || task.doDate ? "text-slate-900" : "text-blue-600"}`} style={o && { color: task.workBlocks.length || task.doDate ? o.text : o.ink }}>
                {task.workBlocks.length
                  ? `${task.workBlocks.length} time${task.workBlocks.length === 1 ? "" : "s"} booked`
                  : task.doDate
                    ? friendlyDate(task.doDate)
                    : "Schedule"}
              </Text>
              {task.doDate && task.workBlocks.length === 0 && (
                <Pressable hitSlop={10} onPress={() => save(task, { doDate: null })} className="ml-2">
                  <Ionicons name="close-circle" size={18} color={o?.faint ?? "#94A3B8"} />
                </Pressable>
              )}
              <Ionicons name="chevron-forward" size={16} color={o?.faint ?? "#CBD5E1"} style={{ marginLeft: 4 }} />
            </Row>
            {/* Time blocked out in the calendar to do it. */}
            {[...task.workBlocks]
              .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)
              .map((block) => (
                <Row key={block._id} icon="time-outline" label={friendlyDate(block.date)} border>
                  <Text className={`text-base ${block.date < todayStr() ? "text-slate-400" : "text-slate-900"}`} style={o && (block.date < todayStr() ? faintColor : textColor)}>
                    {minutesLabel(block.startMinutes)}–{minutesLabel(block.endMinutes)}
                  </Text>
                  <Pressable
                    hitSlop={10}
                    accessibilityLabel="Remove this time"
                    onPress={() => unscheduleTodoTask(task._id, block._id).then(load, fail)}
                    className="ml-2"
                  >
                    <Ionicons name="close-circle" size={18} color={o?.faint ?? "#94A3B8"} />
                  </Pressable>
                </Row>
              ))}
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
                placeholderTextColor={o?.faint ?? "#94A3B8"}
                autoCapitalize="none"
                className="text-base text-slate-900"
                style={textColor}
              />
            </Field>
            <Field icon="people-outline" label="Relevant parties" border>
              <TextInput
                value={parties}
                onChangeText={setParties}
                onBlur={() => splitList(parties).join() !== task.parties.join() && save(task, { parties: splitList(parties) })}
                placeholder="e.g. Landlord, HR"
                placeholderTextColor={o?.faint ?? "#94A3B8"}
                className="text-base text-slate-900"
                style={textColor}
              />
            </Field>
            <Field icon="document-text-outline" label="Notes" border>
              <TextInput
                value={note}
                onChangeText={setNote}
                onBlur={() => note.trim() !== task.note && save(task, { note: note.trim() })}
                placeholder="Add notes"
                placeholderTextColor={o?.faint ?? "#94A3B8"}
                multiline
                className="text-base leading-5 text-slate-900"
                style={[{ minHeight: 44 }, textColor]}
              />
            </Field>
            <Text className="px-4 pb-1 text-xs text-slate-400" style={faintColor}>Separate tags and people with commas.</Text>
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
                <Text className="px-4 pb-3 text-sm text-slate-400" style={faintColor}>No subtasks yet.</Text>
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
              <View className="flex-row items-center border-t border-slate-100 px-4" style={line}>
                <Ionicons name="add" size={22} color={o?.ink ?? accent} />
                <TextInput
                  value={newSubtask}
                  onChangeText={setNewSubtask}
                  onSubmitEditing={addSubtask}
                  blurOnSubmit={false}
                  returnKeyType="done"
                  placeholder="Add subtask"
                  placeholderTextColor={o?.faint ?? "#94A3B8"}
                  className="ml-2 flex-1 text-base text-slate-900"
                  style={[{ height: 46 }, textColor]}
                />
              </View>
              </View>
            </FormCard>
          )}

          <Text className="mt-1 text-center text-xs text-slate-400" style={faintColor}>
            {task.completed && task.completedAt
              ? `Completed ${shortDateFromIso(task.completedAt)}`
              : `Created ${shortDateFromIso(task.createdAt)}`}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={pickingStart}
        title="Start date"
        value={task.startDate ?? task.dueDate ?? todayStr()}
        onCancel={() => setPickingStart(false)}
        onConfirm={(value) => {
          setPickingStart(false);
          save(task, { startDate: value });
        }}
      />
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
  const o = useOrbitPage();
  const overdue = !!subtask.dueDate && !subtask.completed && isOverdue(subtask.dueDate);
  return (
    <>
      <Tap
        onPress={() => onOpen(subtask)}
        className="flex-row items-center border-t border-slate-100 py-2.5 pr-2 active:bg-slate-50"
        style={[{ paddingLeft: 16 + level * 26 }, o && { borderTopColor: o.border }]}
        pressedStyle={o ? { backgroundColor: o.pill } : {}}
      >
        <Pressable onPress={() => onToggle(subtask)} hitSlop={10} accessibilityLabel="Complete subtask">
          {subtask.completed ? (
            <View className="h-[22px] w-[22px] items-center justify-center rounded-full" style={{ backgroundColor: accent }}>
              <Ionicons name="checkmark" size={14} color="white" />
            </View>
          ) : (
            <View className="h-[22px] w-[22px] rounded-full border-2 border-slate-400" style={o && { borderColor: o.faint }} />
          )}
        </Pressable>
        <View className="ml-3 flex-1">
          <Text
            className={`text-[15px] ${subtask.completed ? "text-slate-400 line-through" : "text-slate-900"}`}
            numberOfLines={2}
            style={o && { color: subtask.completed ? o.faint : o.text }}
          >
            {subtask.title}
          </Text>
          {(subtask.dueDate || subtask.subtaskCount > 0) && (
            <Text className={`mt-0.5 text-xs ${overdue ? "font-medium text-red-600" : "text-slate-500"}`} style={o && { color: overdue ? o.danger : o.muted }}>
              {subtask.dueDate ? friendlyDate(subtask.dueDate) : ""}
              {subtask.dueDate && subtask.subtaskCount > 0 ? "  ·  " : ""}
              {subtask.subtaskCount > 0
                ? `${subtask.subtaskCount - subtask.openSubtaskCount}/${subtask.subtaskCount} done`
                : ""}
            </Text>
          )}
        </View>
        <Tap
          onPress={() => onPickDate(subtask)}
          accessibilityLabel="Set due date"
          className="h-9 w-9 items-center justify-center rounded-full active:bg-slate-100"
          pressedStyle={o ? { backgroundColor: o.pill } : {}}
        >
          <Ionicons name="calendar-outline" size={18} color={subtask.dueDate ? o?.icon ?? "#475569" : o?.faint ?? "#CBD5E1"} />
        </Tap>
        <Tap
          onPress={() => onToggleCalendar(subtask)}
          accessibilityLabel={subtask.showInCalendar ? "Remove from calendar" : "Show in calendar"}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-slate-100"
          pressedStyle={o ? { backgroundColor: o.pill } : {}}
        >
          <Ionicons
            name={subtask.showInCalendar ? "calendar-number" : "calendar-number-outline"}
            size={18}
            color={subtask.showInCalendar ? o?.ink ?? "#2563EB" : o?.faint ?? "#CBD5E1"}
          />
        </Tap>
        <Ionicons name="chevron-forward" size={16} color={o?.faint ?? "#CBD5E1"} />
      </Tap>
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
  const o = useOrbitPage();
  return (
    <View className="mb-3 overflow-hidden rounded-3xl border border-slate-200 bg-white" style={o && { backgroundColor: o.surface, borderColor: o.border, borderRadius: 20 }}>
      {children}
    </View>
  );
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
  const o = useOrbitPage();
  return (
    <Tap
      disabled={!onPress}
      onPress={onPress}
      className={`flex-row items-center px-4 active:bg-slate-50 ${border ? "border-t border-slate-100" : ""}`}
      style={[{ minHeight: 54 }, o && { borderTopColor: o.border }]}
      pressedStyle={o ? { backgroundColor: o.pill } : {}}
    >
      <Ionicons name={icon} size={20} color={o?.muted ?? "#64748B"} />
      <Text className="ml-3 flex-1 text-base text-slate-900" style={o && { color: o.text }}>{label}</Text>
      {children}
    </Tap>
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
  const o = useOrbitPage();
  return (
    <View className={`flex-row px-4 py-3 ${border ? "border-t border-slate-100" : ""}`} style={o && { borderTopColor: o.border }}>
      <Ionicons name={icon} size={20} color={o?.muted ?? "#64748B"} style={{ marginTop: 2 }} />
      <View className="ml-3 flex-1">
        <Text className="mb-0.5 text-xs font-medium text-slate-500" style={o && { color: o.muted }}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

// The app's own blue switch (same look as ToggleRow's — on an Orbit page,
// the section's colour on its track).
function Toggle({ value }: { value: boolean }) {
  const o = useOrbitPage();
  return (
    <View className={`h-7 w-12 justify-center rounded-full px-1 ${value ? "bg-blue-600" : "bg-slate-200"}`} style={o && { backgroundColor: value ? o.ink : o.track }}>
      <View className="h-5 w-5 rounded-full bg-white" style={{ transform: [{ translateX: value ? 20 : 0 }] }} />
    </View>
  );
}
