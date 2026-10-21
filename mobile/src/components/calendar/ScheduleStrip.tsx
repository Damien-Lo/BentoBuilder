import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { listAccent, SMART_LISTS, useTodoTheme } from "@/src/components/todo/theme";
import { Tap } from "@/src/components/ui/Tap";
import {
  getListTasks,
  getSmartTasks,
  getTodoOverview,
  getTodoTask,
  type SmartListId,
  type TodoList,
  type TodoTask,
} from "@/src/services/todoApi";
import { useOrbitTheme } from "@/src/theme/orbit";
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
// task, with nothing to browse. (On the phone's calendar only, so in
// Orbit's look; lists keep their own colours.)
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
  const { colors: o, dark } = useOrbitTheme();
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
  // A list or task to pick: a chip on the page's colour.
  const chip = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: o.border,
    backgroundColor: o.canvas,
  };

  return (
    // A sheet along the bottom, its top corners rounded.
    <View
      className="absolute bottom-0 left-0 right-0"
      style={{
        paddingBottom: bottomInset + 8,
        backgroundColor: o.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: o.border,
        shadowColor: "#000",
        shadowOpacity: dark ? 0.4 : 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: -2 },
      }}
    >
      {/* Header bar: where you are, and what's selected. */}
      <View className="flex-row items-center px-3 pt-2.5" style={{ minHeight: 46 }}>
        {!lockedTaskId && (source || current) ? (
          <Tap
            onPress={back}
            accessibilityLabel="Back"
            style={{ marginRight: 4, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}
            pressedStyle={{ backgroundColor: o.pill }}
          >
            <Ionicons name="chevron-back" size={22} color={o.icon} />
          </Tap>
        ) : (
          <View className="ml-1 mr-2">
            <Ionicons name="time-outline" size={18} color={o.ink} />
          </View>
        )}

        {current ? (
          // The highlighted task, in the Calendar's blue.
          <View className="flex-1 flex-row items-center px-3 py-2" style={{ borderRadius: 14, backgroundColor: o.ink }}>
            <Ionicons name={current.depth > 0 ? "diamond-outline" : "flag"} size={12} color={o.onInk} />
            <View className="ml-2 flex-1">
              <Text style={{ fontSize: 14, fontWeight: "600", color: o.onInk }} numberOfLines={1}>
                {current.title}
              </Text>
              <Text style={{ fontSize: 11, color: o.onInk, opacity: 0.75 }} numberOfLines={1}>
                {chain.length > 1 ? `${chain.slice(0, -1).map((t) => t.title).join(" › ")} · ` : ""}
                Hold and drag on the day to book time
              </Text>
            </View>
            {hasUpcomingBlock(current) && <Ionicons name="time" size={14} color={o.onInk} style={{ opacity: 0.75 }} />}
          </View>
        ) : (
          <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: o.text }} numberOfLines={1}>
            {source ? `${source.name} — pick a task` : "Schedule tasks — pick a list"}
          </Text>
        )}

        <Tap
          onPress={onDone}
          hitSlop={8}
          style={{ marginLeft: 8, height: 32, justifyContent: "center", paddingHorizontal: 14, borderRadius: 16, backgroundColor: o.pill }}
          pressedStyle={{ opacity: 0.7 }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: o.onPill }}>Done</Text>
        </Tap>
      </View>

      {/* What can be picked next. */}
      {!lockedTaskId && (
        <View style={{ height: 54 }} className="justify-center">
          {loading && items.length === 0 && (source || current) ? (
            <ActivityIndicator size="small" color={o.muted} />
          ) : !source && !current ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: "center" }}>
              {sources.map((s) => (
                <Tap key={s.id} onPress={() => setSource(s)} style={chip} pressedStyle={{ backgroundColor: o.pill }}>
                  <Ionicons name={s.icon} size={16} color={listAccent(s.color, theme)} />
                  <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: "500", color: o.text }}>{s.name}</Text>
                </Tap>
              ))}
            </ScrollView>
          ) : items.length === 0 ? (
            <Text style={{ paddingHorizontal: 16, fontSize: 14, color: o.faint }}>
              {current ? "No subtasks — this is the one being scheduled." : "No open tasks in this list."}
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: "center" }}>
              {items.map((task) => (
                <Tap
                  key={task._id}
                  onPress={() => setChain((prev) => [...prev, task])}
                  style={[chip, { maxWidth: 220 }]}
                  pressedStyle={{ backgroundColor: o.pill }}
                >
                  <Ionicons name={current ? "diamond-outline" : "flag"} size={11} color={accent} />
                  <Text style={{ marginLeft: 6, flexShrink: 1, fontSize: 14, fontWeight: "500", color: o.text }} numberOfLines={1}>
                    {task.title}
                  </Text>
                  {task.subtaskCount > 0 && (
                    <Text style={{ marginLeft: 6, fontSize: 11, color: o.faint }}>{task.openSubtaskCount}</Text>
                  )}
                  {hasUpcomingBlock(task) && <Ionicons name="time" size={13} color={o.ink} style={{ marginLeft: 6 }} />}
                </Tap>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

export default ScheduleStrip;
