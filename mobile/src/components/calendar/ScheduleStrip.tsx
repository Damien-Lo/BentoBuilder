import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { listAccent, SMART_LISTS, useTodoTheme } from "@/src/components/todo/theme";
import {
  getListTasks,
  getSmartTasks,
  getTodoOverview,
  getTodoTask,
  type SmartListId,
  type TodoList,
  type TodoTask,
} from "@/src/services/todoApi";
import { todayStr } from "@/src/utils/mealPlan";

export const SCHEDULE_STRIP_HEIGHT = 118;
export const SCHEDULE_STRIP_LOCKED_HEIGHT = 62;

// What's being scheduled.
export interface ScheduleTarget {
  _id: string;
  title: string;
}

interface Source {
  id: string;
  name: string;
  smart: boolean;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// The smart lists worth scheduling from ("All" would just be everything).
const SMART_SOURCES: SmartListId[] = ["myday", "important", "planned"];

const hasUpcomingBlock = (task: TodoTask) => task.workBlocks?.some((b) => b.date >= todayStr());

// The calendar's scheduling mode: a strip along the bottom that drills down
// to the thing to schedule, so a long task list never has to be scrolled.
//   1. pick a list (or My Day / Important / Planned);
//   2. pick a task — it's highlighted in the header bar and its subtasks
//      are listed underneath;
//   3. tap a subtask to make that the highlighted one instead (and see its
//      own subtasks), or leave it on the task.
// Whatever is highlighted is what a hold-and-drag on the day books time for.
// With `lockedTaskId` (opened from one task's Do date) it shows just that
// task, with nothing to browse.
export function ScheduleStrip({
  lockedTaskId,
  bottomInset,
  refreshKey,
  onTarget,
  onDone,
}: {
  lockedTaskId?: string;
  bottomInset: number;
  // Bump after a block is booked, to refresh the "has time" marks.
  refreshKey: number;
  onTarget: (target: ScheduleTarget | null) => void;
  onDone: () => void;
}) {
  const theme = useTodoTheme();
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  // The path of tasks drilled into: the last one is highlighted.
  const [chain, setChain] = useState<TodoTask[]>([]);
  // What's listed under the header: the list's tasks, or the highlighted
  // task's subtasks.
  const [items, setItems] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(false);

  const current = chain[chain.length - 1] ?? null;

  useEffect(() => {
    onTarget(current ? { _id: current._id, title: current.title } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?._id]);

  // Locked to one task: just load it.
  useEffect(() => {
    if (!lockedTaskId) return;
    getTodoTask(lockedTaskId).then((task) => setChain([task])).catch(() => {});
  }, [lockedTaskId]);

  // The lists to pick from.
  useEffect(() => {
    if (lockedTaskId) return;
    getTodoOverview()
      .then((overview) => {
        const lists: TodoList[] = overview.lists
          .filter((l) => l.type !== "checklist")
          .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.order - b.order);
        setSources([
          ...SMART_SOURCES.map((id) => {
            const smart = SMART_LISTS.find((s) => s.id === id)!;
            return { id, name: smart.name, smart: true, color: smart.color, icon: smart.icon };
          }),
          ...lists.map((l) => ({
            id: l._id,
            name: l.name,
            smart: false,
            color: l.color,
            icon: (l.isDefault ? "home-outline" : "list") as keyof typeof Ionicons.glyphMap,
          })),
        ]);
      })
      .catch(() => {});
  }, [lockedTaskId]);

  // What's listed: the highlighted task's subtasks, else the list's tasks.
  useEffect(() => {
    if (lockedTaskId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        let loaded: TodoTask[] = [];
        if (current) loaded = (await getTodoTask(current._id)).subtasks;
        else if (source) loaded = await (source.smart ? getSmartTasks(source.id as SmartListId) : getListTasks(source.id));
        if (!cancelled) setItems(loaded.filter((t) => !t.completed));
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedTaskId, source, current?._id, refreshKey]);

  function back() {
    if (chain.length > 0) setChain((prev) => prev.slice(0, -1));
    else setSource(null);
  }

  const accent = listAccent(source?.color ?? "blue", theme);

  return (
    <View
      className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white"
      style={{
        paddingBottom: bottomInset + 8,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
      }}
    >
      {/* Header bar: where you are, and what's selected. */}
      <View className="flex-row items-center px-3 pt-2.5" style={{ minHeight: 46 }}>
        {!lockedTaskId && (source || current) ? (
          <Pressable
            onPress={back}
            accessibilityLabel="Back"
            className="mr-1 h-9 w-9 items-center justify-center rounded-full active:bg-slate-100"
          >
            <Ionicons name="chevron-back" size={22} color="#334155" />
          </Pressable>
        ) : (
          <View className="ml-1 mr-2">
            <Ionicons name="time-outline" size={18} color="#2563EB" />
          </View>
        )}

        {current ? (
          <View className="flex-1 flex-row items-center rounded-xl bg-blue-600 px-3 py-2">
            <Ionicons name={current.depth > 0 ? "diamond-outline" : "flag"} size={12} color="#FFFFFF" />
            <View className="ml-2 flex-1">
              <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                {current.title}
              </Text>
              <Text className="text-[11px] text-blue-100" numberOfLines={1}>
                {chain.length > 1 ? `${chain.slice(0, -1).map((t) => t.title).join(" › ")} · ` : ""}
                Hold and drag on the day to book time
              </Text>
            </View>
            {hasUpcomingBlock(current) && <Ionicons name="time" size={14} color="#BFDBFE" />}
          </View>
        ) : (
          <Text className="flex-1 text-sm font-semibold text-slate-800" numberOfLines={1}>
            {source ? `${source.name} — pick a task` : "Schedule tasks — pick a list"}
          </Text>
        )}

        <Pressable onPress={onDone} hitSlop={8} className="ml-2 rounded-full bg-slate-100 px-3 py-2 active:bg-slate-200">
          <Text className="text-xs font-semibold text-slate-700">Done</Text>
        </Pressable>
      </View>

      {/* What can be picked next. */}
      {!lockedTaskId && (
        <View style={{ height: 54 }} className="justify-center">
          {loading && items.length === 0 && (source || current) ? (
            <ActivityIndicator size="small" color="#94A3B8" />
          ) : !source && !current ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: "center" }}>
              {sources.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => setSource(s)}
                  className="flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 active:bg-slate-100"
                >
                  <Ionicons name={s.icon} size={16} color={listAccent(s.color, theme)} />
                  <Text className="ml-2 text-sm font-medium text-slate-900">{s.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : items.length === 0 ? (
            <Text className="px-4 text-sm text-slate-400">
              {current ? "No subtasks — this is the one being scheduled." : "No open tasks in this list."}
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: "center" }}>
              {items.map((task) => (
                <Pressable
                  key={task._id}
                  onPress={() => setChain((prev) => [...prev, task])}
                  className="max-w-[220px] flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 active:bg-slate-100"
                >
                  <Ionicons name={current ? "diamond-outline" : "flag"} size={11} color={accent} />
                  <Text className="ml-1.5 text-sm font-medium text-slate-900" numberOfLines={1}>
                    {task.title}
                  </Text>
                  {task.subtaskCount > 0 && (
                    <Text className="ml-1.5 text-[11px] text-slate-400">{task.openSubtaskCount}</Text>
                  )}
                  {hasUpcomingBlock(task) && <Ionicons name="time" size={13} color="#2563EB" style={{ marginLeft: 6 }} />}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

export default ScheduleStrip;
