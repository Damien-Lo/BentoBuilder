import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TimePickerModal } from "@/src/components/calendar/CalendarSheets";
import { durationLabel, longDateLabel, minutesLabel } from "@/src/components/calendar/calendarUtils";
import { DatePickerModal } from "@/src/components/forms";
import { PriorityPill, ProgressBar, ProgressSlider, StatusPill, TaskNumber } from "@/src/components/todo/TaskBits";
import { friendlyDate, isOverdue } from "@/src/components/todo/theme";
import { Tap } from "@/src/components/ui/Tap";
import type { EventOccurrence } from "@/src/services/calendarApi";
import {
  getTodoTask,
  moveTodoTaskBlock,
  unscheduleTodoTask,
  updateTodoTask,
  type TodoTaskDetail,
} from "@/src/services/todoApi";
import { useOrbitPage, useOrbitTheme } from "@/src/theme/orbit";
import { hexToRgba } from "@/src/utils/mealPlan";

type TaskInfo = NonNullable<EventOccurrence["task"]>;
type Timing = { date: string; startMinutes: number; endMinutes: number };

// One booking of a task's time, opened from the calendar and laid out like
// an event's page: summary card, details, actions. It stands for the
// booking alone — its date and time can be moved here, and its bin removes
// this time from the calendar and leaves the task untouched. The task
// itself is reached (and deleted) only through "View full task".
// On an Orbit page it takes the page's look, light or dark; anywhere else
// (the desktop) it keeps the older one.
export function TaskBlockSheet({
  block: current,
  onClose,
  onChanged,
  onRemoved,
  onOpenTask,
  onScheduleAnother,
}: {
  // The tapped work block, or null when closed.
  block: EventOccurrence | null;
  onClose: () => void;
  // The booking moved, or the task's progress changed.
  onChanged: () => void;
  onRemoved: () => void;
  onOpenTask: (task: TaskInfo) => void;
  // Close this and book another block for the same task.
  onScheduleAnother: (taskId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  // Orbit's cards on the sheet.
  const card = o && { backgroundColor: o.surface, borderColor: o.border, borderRadius: 18 };
  // Keep the last block on the card while it fades out.
  const [block, setBlock] = useState(current);
  const [timing, setTiming] = useState<Timing | null>(null);
  if (current && current !== block) {
    setBlock(current);
    setTiming({ date: current.date, startMinutes: current.startMinutes, endMinutes: current.endMinutes });
  }
  const [task, setTask] = useState<TodoTaskDetail | null>(null);
  // The percentage under the finger while the slider is dragged.
  const [progressPreview, setProgressPreview] = useState<number | null>(null);
  const [picking, setPicking] = useState<"date" | "start" | "end" | null>(null);
  const taskId = block?.task?.id;
  const blockId = block?._id.slice("block-".length);
  // What to do once this card has gone: a subtask opens as a card of its
  // own, and iOS can't present one while another is still dismissing.
  const afterClose = useRef<(() => void) | null>(null);

  function closeThen(action: () => void) {
    if (Platform.OS === "ios") {
      afterClose.current = action;
      onClose();
    } else {
      onClose();
      action();
    }
  }

  function dismissed() {
    const action = afterClose.current;
    afterClose.current = null;
    action?.();
  }

  useEffect(() => {
    setTask(null);
    if (!taskId) return;
    let live = true;
    getTodoTask(taskId)
      .then((loaded) => live && setTask(loaded))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [taskId, blockId]);

  const info = block?.task;
  const isSubtask = (info?.depth ?? 0) > 0;
  const fail = (error: unknown) =>
    Alert.alert("Couldn't save", error instanceof Error ? error.message : "Something went wrong.");

  function move(next: Timing) {
    if (!info || !blockId || !timing) return;
    const before = timing;
    setTiming(next);
    moveTodoTaskBlock(info.id, blockId, next).then(onChanged, (error) => {
      setTiming(before);
      fail(error);
    });
  }

  // Changing the start keeps the length; the end can't pass the start.
  function pickTime(target: "start" | "end", minutes: number) {
    if (!timing) return;
    if (target === "start") {
      const length = timing.endMinutes - timing.startMinutes;
      const start = Math.min(minutes, 1440 - 15);
      move({ ...timing, startMinutes: start, endMinutes: Math.min(1440, start + length) });
    } else {
      const end = minutes === 0 ? 1440 : minutes;
      if (end <= timing.startMinutes) {
        Alert.alert("Ends too early", "The end has to be after the start.");
        return;
      }
      move({ ...timing, endMinutes: end });
    }
  }

  function setProgress(value: number) {
    if (!task) return;
    setTask({ ...task, manualProgress: value, progress: value });
    updateTodoTask(task._id, { manualProgress: value }).then(onChanged, fail);
  }

  function confirmRemove() {
    if (!info || !blockId) return;
    Alert.alert("Remove this time?", "Only this booking leaves the calendar. The task stays in your list.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => unscheduleTodoTask(info.id, blockId).then(onRemoved, fail),
      },
    ]);
  }

  return (
    <Modal visible={!!current} transparent animationType="fade" onRequestClose={onClose} onDismiss={dismissed}>
      <View
        className="flex-1 justify-center bg-black/45"
        style={[{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, paddingHorizontal: 12 }, o && { backgroundColor: o.scrim }]}
      >
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Close" />
        {block && info && timing && (
          <View
            className="overflow-hidden rounded-3xl bg-slate-50"
            style={[
              {
                maxHeight: "100%",
                shadowColor: "#000",
                shadowOpacity: 0.25,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 8 },
              },
              o && { backgroundColor: o.canvas, borderRadius: 28 },
            ]}
          >
            {/* Header (on an Orbit page: on the card itself, round buttons
                either side, no band) */}
            <View
              className="flex-row items-center border-b border-slate-200 bg-white px-3 py-2.5"
              style={o && { backgroundColor: "transparent", borderBottomWidth: 0, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }}
            >
              <Tap
                onPress={onClose}
                accessibilityLabel="Close"
                className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-100"
                style={o && { backgroundColor: o.surface, borderWidth: 1, borderColor: o.border }}
                pressedStyle={o ? { backgroundColor: o.pill } : {}}
              >
                <Ionicons name="close" size={o ? 21 : 24} color={o?.text ?? "#0F172A"} />
              </Tap>
              <View className="mx-1 flex-1 items-center">
                <Text className="text-base font-bold text-slate-950" numberOfLines={1} style={o && { fontSize: 17, fontWeight: "800", color: o.text }}>
                  Scheduled time
                </Text>
                <Text className="text-xs text-slate-500" numberOfLines={1} style={o && { color: o.muted }}>
                  {task
                    ? [task.list.name, ...task.ancestors.map((a) => a.title)].join("  ›  ")
                    : isSubtask
                      ? info.rootTitle
                      : "Tasks"}
                </Text>
              </View>
              <Tap
                onPress={confirmRemove}
                accessibilityLabel="Remove this time"
                className="h-10 w-10 items-center justify-center rounded-full active:bg-red-50"
                // (Orbit: the soft red of a destructive button.)
                style={o && { backgroundColor: dark ? "rgba(248,113,113,0.14)" : "#FEF2F2" }}
                pressedStyle={o ? { opacity: 0.7 } : {}}
              >
                <Ionicons name="trash-outline" size={o ? 20 : 22} color={o?.danger ?? "#DC2626"} />
              </Tap>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              {/* Summary */}
              <View className="mb-3 flex-row rounded-3xl border border-slate-200 bg-white p-4" style={card}>
                <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-100" style={o && { backgroundColor: hexToRgba(o.fill, 0.18) }}>
                  <Ionicons name={isSubtask ? "diamond-outline" : "flag"} size={18} color={o?.ink ?? "#2563EB"} />
                </View>
                <View className="ml-3 flex-1">
                  <Text
                    className={`text-xl font-bold ${info.completed ? "text-slate-400 line-through" : "text-slate-950"}`}
                    style={o && { fontWeight: "800", letterSpacing: -0.3, color: info.completed ? o.faint : o.text }}
                  >
                    {block.title}
                  </Text>
                  <Text className="mt-1.5 text-base text-slate-700" style={o && { color: o.icon }}>{longDateLabel(timing.date)}</Text>
                  <Text className="mt-0.5 text-base text-slate-500" style={o && { color: o.muted }}>
                    {minutesLabel(timing.startMinutes)} → {minutesLabel(timing.endMinutes)} (
                    {durationLabel(timing.endMinutes - timing.startMinutes)})
                  </Text>
                  <View className="mt-2 flex-row flex-wrap items-center gap-2">
                    <TaskNumber number={task?.number ?? info.number} />
                    {task && <StatusPill status={task.status} />}
                    {task && <PriorityPill priority={task.priority} />}
                  </View>
                </View>
              </View>

              {/* When — each row opens its picker */}
              <View className="mb-3 overflow-hidden rounded-3xl border border-slate-200 bg-white" style={card}>
                <Row icon="calendar-outline" label="Date" value={longDateLabel(timing.date)} onPress={() => setPicking("date")} />
                <Row icon="time-outline" label="Starts" value={minutesLabel(timing.startMinutes)} onPress={() => setPicking("start")} />
                <Row icon="time-outline" label="Ends" value={minutesLabel(timing.endMinutes)} onPress={() => setPicking("end")} last />
              </View>

              {/* The task */}
              <View className="mb-3 overflow-hidden rounded-3xl border border-slate-200 bg-white" style={card}>
                {!task ? (
                  <ActivityIndicator className="my-5" color={o?.muted ?? "#2563EB"} />
                ) : (
                  <>
                    <Detail icon="stats-chart-outline">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-base text-slate-900" style={o && { color: o.text }}>
                          Progress
                          {task.subtaskCount > 0
                            ? ` · ${task.subtaskCount - task.openSubtaskCount} of ${task.subtaskCount} subtasks`
                            : ""}
                        </Text>
                        <Text className="text-base font-bold text-slate-900" style={o && { color: o.text }}>{progressPreview ?? task.progress}%</Text>
                      </View>
                      {/* (Orbit: filled in the Calendar's blue.) */}
                      {task.subtaskCount === 0 && !task.completed ? (
                        <ProgressSlider value={task.progress} color={o?.fill} onPreview={setProgressPreview} onChange={setProgress} />
                      ) : (
                        <View className="mt-2">
                          <ProgressBar value={task.progress} color={o?.fill} />
                        </View>
                      )}
                      {task.subtaskCount > 0 && (
                        <Text className="mt-1.5 text-xs text-slate-500" style={o && { color: o.muted }}>Worked out from its subtasks.</Text>
                      )}
                    </Detail>
                    {!!task.description && (
                      <Detail icon="reorder-three-outline">
                        <Text className="text-base leading-6 text-slate-700" style={o && { color: o.icon }}>{task.description}</Text>
                      </Detail>
                    )}
                    {task.dueDate && (
                      <Detail icon="flag-outline">
                        <Text
                          className={`text-base ${!task.completed && isOverdue(task.dueDate) ? "text-red-600" : "text-slate-900"}`}
                          style={o && { color: !task.completed && isOverdue(task.dueDate) ? o.danger : o.text }}
                        >
                          Due {friendlyDate(task.dueDate)}
                        </Text>
                      </Detail>
                    )}
                    {!!task.note && (
                      <Detail icon="document-text-outline">
                        <Text className="text-base leading-6 text-slate-700" style={o && { color: o.icon }}>{task.note}</Text>
                      </Detail>
                    )}
                    <Detail icon="list-outline" last>
                      <Text className="text-base text-slate-900" style={o && { color: o.text }}>
                        {task.workBlocks.length === 1 ? "The only time booked" : `One of ${task.workBlocks.length} times booked`}
                      </Text>
                    </Detail>
                  </>
                )}
              </View>

              {/* Didn't finish? Book the same task again. */}
              {/* (Orbit: the main button in the Calendar's blue, the other
                  outlined.) */}
              <Tap
                onPress={() => closeThen(() => onScheduleAnother(info.id))}
                className="flex-row items-center justify-center rounded-2xl bg-blue-600 py-3.5 active:bg-blue-700"
                style={o && { height: 52, paddingVertical: 0, borderRadius: 16, backgroundColor: o.ink }}
                pressedStyle={o ? { opacity: 0.85 } : {}}
              >
                <Ionicons name="copy-outline" size={18} color={o?.onInk ?? "#FFFFFF"} />
                <Text className="ml-2 font-semibold text-white" style={o && { fontSize: 15, color: o.onInk }}>Schedule another time</Text>
              </Tap>
              <Tap
                onPress={() => closeThen(() => onOpenTask(info))}
                className="mt-2 flex-row items-center justify-center rounded-2xl border border-slate-200 bg-white py-3.5 active:bg-slate-100"
                style={o && { height: 52, paddingVertical: 0, borderRadius: 16, backgroundColor: o.surface, borderColor: o.border }}
                pressedStyle={o ? { backgroundColor: o.pill } : {}}
              >
                <Text className="font-semibold text-blue-700" style={o && { fontSize: 15, color: o.ink }}>View full task</Text>
                <Ionicons name="chevron-forward" size={17} color={o?.ink ?? "#1D4ED8"} style={{ marginLeft: 4 }} />
              </Tap>
            </ScrollView>
          </View>
        )}
      </View>

      {timing && (
        <>
          <DatePickerModal
            visible={picking === "date"}
            title="Date"
            value={timing.date}
            onCancel={() => setPicking(null)}
            onConfirm={(value) => {
              setPicking(null);
              if (value !== timing.date) move({ ...timing, date: value });
            }}
          />
          <TimePickerModal
            visible={picking === "start" || picking === "end"}
            title={picking === "end" ? "Ends" : "Starts"}
            minutes={picking === "end" ? timing.endMinutes % 1440 : timing.startMinutes}
            onCancel={() => setPicking(null)}
            onConfirm={(value) => {
              const target = picking === "end" ? "end" : "start";
              setPicking(null);
              pickTime(target, value);
            }}
          />
        </>
      )}
    </Modal>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
  last?: boolean;
}) {
  const o = useOrbitPage();
  return (
    <Tap
      onPress={onPress}
      className={`flex-row items-center px-4 py-3.5 active:bg-slate-50 ${last ? "" : "border-b border-slate-100"}`}
      style={o && { backgroundColor: "transparent", borderBottomColor: o.border }}
      pressedStyle={o ? { backgroundColor: o.pill } : {}}
    >
      <Ionicons name={icon} size={20} color={o?.muted ?? "#64748B"} />
      <Text className="ml-3 flex-1 text-base text-slate-900" style={o && { color: o.text }}>{label}</Text>
      <Text className="text-base font-medium text-blue-700" style={o && { color: o.ink }}>{value}</Text>
      <Ionicons name="chevron-forward" size={16} color={o?.faint ?? "#94A3B8"} style={{ marginLeft: 6 }} />
    </Tap>
  );
}

function Detail({ icon, children, last = false }: { icon: keyof typeof Ionicons.glyphMap; children: ReactNode; last?: boolean }) {
  const o = useOrbitPage();
  return (
    <View className={`flex-row items-start px-4 py-3.5 ${last ? "" : "border-b border-slate-100"}`} style={o && { borderBottomColor: o.border }}>
      <Ionicons name={icon} size={20} color={o?.muted ?? "#64748B"} style={{ marginTop: 1 }} />
      <View className="ml-3 flex-1">{children}</View>
    </View>
  );
}
