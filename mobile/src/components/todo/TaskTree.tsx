import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import type { TodoSubtask, TodoTask } from "@/src/services/todoApi";

import { PriorityPill, StatusPill, TaskNumber } from "./TaskBits";
import { friendlyDate, isOverdue } from "./theme";

// The two structured views on a task's page: every description as an
// outline, and the subtasks as a collapsible tree. Both walk the whole
// subtree, so they work at any depth.

const INDENT = 16;

interface FlatRow {
  subtask: TodoSubtask;
  level: number;
  // "1", "1.2", "1.2.1" — its position among its siblings, at each level.
  path: string;
}

function flatten(subtasks: TodoSubtask[], collapsed?: Set<string>, level = 0, prefix = ""): FlatRow[] {
  return subtasks.flatMap((subtask, i) => {
    const path = `${prefix}${i + 1}`;
    const row = { subtask, level, path };
    if (collapsed?.has(subtask._id)) return [row];
    return [row, ...flatten(subtask.subtasks, collapsed, level + 1, `${path}.`)];
  });
}

// How many of the task and its subtasks (every level) have a description.
export function countDescriptions(task: TodoTask, subtasks: TodoSubtask[]): number {
  return (
    (task.description.trim() ? 1 : 0) + flatten(subtasks).filter((row) => row.subtask.description.trim()).length
  );
}

// "All descriptions": the task's own description, then each subtask's (at
// every level), indented under a bar so the whole brief reads in one place.
// Just the content — the caller supplies the card around it.
export function DescriptionOutline({ task, subtasks, accent }: { task: TodoTask; subtasks: TodoSubtask[]; accent: string }) {
  const rows = flatten(subtasks).filter((row) => row.subtask.description.trim());

  return (
    <View className="mt-3">

      <View className="border-l-2 pl-3" style={{ borderLeftColor: accent }}>
        <Text className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
          Main task{task.number != null ? ` · #${task.number}` : ""}
        </Text>
        <Text className="mt-0.5 text-[15px] font-semibold text-slate-900">{task.title}</Text>
        <Text className="mt-0.5 text-sm leading-5 text-slate-600">
          {task.description.trim() || "No description."}
        </Text>
      </View>

      {rows.map(({ subtask, level, path }) => (
        <View
          key={subtask._id}
          className="mt-3 border-l-2 border-slate-200 pl-3"
          style={{ marginLeft: level * INDENT }}
        >
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Subtask {path}
            {subtask.number != null ? ` · #${subtask.number}` : ""}
          </Text>
          <Text
            className={`mt-0.5 text-[15px] font-semibold ${subtask.completed ? "text-slate-400 line-through" : "text-slate-900"}`}
          >
            {subtask.title}
          </Text>
          <Text className="mt-0.5 text-sm leading-5 text-slate-600">{subtask.description.trim()}</Text>
        </View>
      ))}
    </View>
  );
}

type DropMode = "child" | "sibling" | "top";
interface DropTarget {
  // The row dropped on (null for "top": first, at the top level).
  id: string | null;
  mode: DropMode;
}

// How many levels of subtasks sit under this one.
function heightOf(subtask: TodoSubtask): number {
  return subtask.subtasks.length ? 1 + Math.max(...subtask.subtasks.map(heightOf)) : 0;
}

function idsUnder(subtask: TodoSubtask): string[] {
  return subtask.subtasks.flatMap((s) => [s._id, ...idsUnder(s)]);
}

// The subtasks as a tree: one card per subtask, indented under its parent
// with a guide line per level; a chevron folds a branch away. Tapping a
// card opens that subtask's details.
//
// Drag a card by its grip to rearrange: drop on the RIGHT half of another
// card to make it that card's subtask (its first), on the LEFT half to
// place it straight after that card at the same level, or above the first
// card to put it first.
export function SubtaskTree({
  subtasks,
  rootId,
  maxLevel,
  accent,
  onOpen,
  onToggle,
  onMove,
  onDragChange,
}: {
  subtasks: TodoSubtask[];
  // The task this tree hangs off — the parent of the top-level rows.
  rootId: string;
  // The deepest level a row may sit at (0 = directly under the task).
  maxLevel: number;
  accent: string;
  onOpen: (subtask: TodoSubtask) => void;
  onToggle: (subtask: TodoSubtask) => void;
  onMove: (id: string, parent: string, after: string | null) => void;
  // True while a card is being dragged (so the page can stop scrolling).
  onDragChange?: (dragging: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const rows = flatten(subtasks, collapsed);

  const containerRef = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0, width: 1 });
  const layouts = useRef<Record<string, { y: number; height: number }>>({});
  // Kept in refs too, for the gesture callbacks.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const dragRef = useRef<{ row: FlatRow; excluded: Set<string>; height: number } | null>(null);
  const targetRef = useRef<DropTarget | null>(null);

  const toggleBranch = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function setDropTarget(next: DropTarget | null) {
    const current = targetRef.current;
    if (current?.id === next?.id && current?.mode === next?.mode) return;
    targetRef.current = next;
    setTarget(next);
  }

  function startDrag(id: string) {
    const row = rowsRef.current.find((r) => r.subtask._id === id);
    if (!row) return;
    dragRef.current = { row, excluded: new Set([id, ...idsUnder(row.subtask)]), height: heightOf(row.subtask) };
    containerRef.current?.measureInWindow((x, y, width) => {
      origin.current = { x, y, width: width || 1 };
    });
    setDragId(id);
    onDragChange?.(true);
  }

  // Which row the finger is over, and which half of it.
  function moveDrag(absoluteX: number, absoluteY: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const candidates = rowsRef.current.filter((r) => !drag.excluded.has(r.subtask._id) && layouts.current[r.subtask._id]);
    if (candidates.length === 0) return setDropTarget({ id: null, mode: "top" });
    const y = absoluteY - origin.current.y;
    const first = layouts.current[candidates[0].subtask._id];
    if (y < first.y) return setDropTarget({ id: null, mode: "top" });
    const over =
      candidates.find((r) => {
        const l = layouts.current[r.subtask._id];
        return y >= l.y && y < l.y + l.height;
      }) ?? candidates[candidates.length - 1];
    const wantsChild = absoluteX > origin.current.x + origin.current.width / 2;
    // Only where the whole dragged branch still fits within the depth limit.
    const childFits = over.level + 1 + drag.height <= maxLevel;
    const siblingFits = over.level + drag.height <= maxLevel;
    if (wantsChild && childFits) return setDropTarget({ id: over.subtask._id, mode: "child" });
    if (siblingFits) return setDropTarget({ id: over.subtask._id, mode: "sibling" });
    return setDropTarget(null);
  }

  function endDrag(commit: boolean) {
    const drag = dragRef.current;
    const drop = targetRef.current;
    dragRef.current = null;
    targetRef.current = null;
    setDragId(null);
    setTarget(null);
    onDragChange?.(false);
    if (!commit || !drag || !drop) return;
    const id = drag.row.subtask._id;
    if (drop.mode === "top") return onMove(id, rootId, null);
    const over = rowsRef.current.find((r) => r.subtask._id === drop.id);
    if (!over) return;
    if (drop.mode === "child") onMove(id, over.subtask._id, null);
    else onMove(id, over.subtask.parent ?? rootId, over.subtask._id);
  }

  return (
    <View ref={containerRef} collapsable={false} className="px-3 pb-1">
      {target?.mode === "top" && <DropLine level={0} label="Move to the top" />}
      {rows.map((row) => (
        <TreeRow
          key={row.subtask._id}
          row={row}
          accent={accent}
          folded={collapsed.has(row.subtask._id)}
          dragging={dragId === row.subtask._id}
          drop={target?.id === row.subtask._id ? target.mode : null}
          onLayout={(y, height) => {
            layouts.current[row.subtask._id] = { y, height };
          }}
          onOpen={() => onOpen(row.subtask)}
          onToggle={() => onToggle(row.subtask)}
          onToggleBranch={() => toggleBranch(row.subtask._id)}
          onDragStart={() => startDrag(row.subtask._id)}
          onDragMove={moveDrag}
          onDragEnd={endDrag}
        />
      ))}
      {rows.length > 1 && (
        <Text className="px-1 pb-2 pt-1 text-[11px] leading-4 text-slate-400">
          Drag ≡ to rearrange. Drop on the right half of a card to make it that card&apos;s subtask, or on the left half to
          place it after that card.
        </Text>
      )}
    </View>
  );
}

// Where a dragged card will land.
function DropLine({ level, label }: { level: number; label: string }) {
  return (
    <View className="mb-2 flex-row items-center" style={{ marginLeft: level * INDENT }}>
      <View className="h-2 w-2 rounded-full bg-blue-600" />
      <View className="h-0.5 flex-1 bg-blue-600" />
      <Text className="ml-2 text-[11px] font-semibold text-blue-600">{label}</Text>
    </View>
  );
}

function TreeRow({
  row,
  accent,
  folded,
  dragging,
  drop,
  onLayout,
  onOpen,
  onToggle,
  onToggleBranch,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  row: FlatRow;
  accent: string;
  folded: boolean;
  dragging: boolean;
  // Set when the dragged card is over this one.
  drop: DropMode | null;
  onLayout: (y: number, height: number) => void;
  onOpen: () => void;
  onToggle: () => void;
  onToggleBranch: () => void;
  onDragStart: () => void;
  onDragMove: (absoluteX: number, absoluteY: number) => void;
  onDragEnd: (commit: boolean) => void;
}) {
  const { subtask, level } = row;
  const overdue = !!subtask.dueDate && !subtask.completed && isOverdue(subtask.dueDate);
  const hasChildren = subtask.subtasks.length > 0;

  const translateY = useSharedValue(0);
  const lifted = useSharedValue(0);
  const drag = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart(() => {
      lifted.value = 1;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
      runOnJS(onDragMove)(e.absoluteX, e.absoluteY);
    })
    .onEnd(() => {
      runOnJS(onDragEnd)(true);
    })
    .onFinalize((_e, success) => {
      translateY.value = 0;
      lifted.value = 0;
      if (!success) runOnJS(onDragEnd)(false);
    });
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: 1 + lifted.value * 0.02 }],
    zIndex: lifted.value ? 20 : 0,
    opacity: lifted.value ? 0.92 : 1,
    shadowOpacity: lifted.value * 0.2,
  }));

  return (
    <Animated.View
      onLayout={(e) => onLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      style={[{ shadowColor: "#000", shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, liftStyle]}
    >
      <View className="flex-row">
        {/* One guide line per level above this row. */}
        {Array.from({ length: level }, (_, i) => (
          <View key={i} style={{ width: INDENT }} className="items-center">
            <View className="w-0.5 flex-1 bg-slate-200" />
          </View>
        ))}
        <Pressable
          onPress={onOpen}
          className={`mb-2 flex-1 flex-row rounded-2xl border bg-white py-2.5 pl-3 active:bg-slate-50 ${
            drop === "child" ? "border-blue-500 bg-blue-50" : dragging ? "border-blue-300" : "border-slate-200"
          }`}
        >
          <Pressable onPress={onToggle} hitSlop={10} accessibilityLabel="Complete subtask" className="pt-0.5">
            {subtask.completed ? (
              <View className="h-[22px] w-[22px] items-center justify-center rounded-full" style={{ backgroundColor: accent }}>
                <Ionicons name="checkmark" size={14} color="white" />
              </View>
            ) : (
              <View className="h-[22px] w-[22px] rounded-full border-2 border-slate-400" />
            )}
          </Pressable>

          <View className="ml-3 flex-1">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <TaskNumber number={subtask.number} />
              <StatusPill status={subtask.status} />
              <PriorityPill priority={subtask.priority} />
            </View>
            <Text
              className={`mt-1 text-[15px] font-semibold ${subtask.completed ? "text-slate-400 line-through" : "text-slate-900"}`}
            >
              {subtask.title}
            </Text>
            {!!subtask.description.trim() && (
              <Text className="mt-0.5 text-xs leading-4 text-slate-500" numberOfLines={2}>
                {subtask.description.trim()}
              </Text>
            )}
            {(subtask.dueDate || subtask.parties.length > 0 || hasChildren) && (
              <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-0.5">
                {subtask.dueDate && (
                  <View className="flex-row items-center">
                    <Ionicons name="calendar-outline" size={12} color={overdue ? "#DC2626" : "#94A3B8"} />
                    <Text className={`ml-1 text-xs ${overdue ? "font-medium text-red-600" : "text-slate-500"}`}>
                      {friendlyDate(subtask.dueDate)}
                      {overdue ? " (overdue)" : ""}
                    </Text>
                  </View>
                )}
                {subtask.parties.length > 0 && (
                  <View className="flex-row items-center">
                    <Ionicons name="people-outline" size={12} color="#94A3B8" />
                    <Text className="ml-1 text-xs text-slate-500" numberOfLines={1}>
                      {subtask.parties.join(", ")}
                    </Text>
                  </View>
                )}
                {hasChildren && (
                  <Text className="text-xs text-slate-500">
                    {subtask.subtaskCount - subtask.openSubtaskCount}/{subtask.subtaskCount} subtasks
                  </Text>
                )}
              </View>
            )}
          </View>

          <View className="items-center">
            <GestureDetector gesture={drag}>
              <View accessibilityLabel="Drag to rearrange" className="h-9 w-10 items-center justify-center">
                <Ionicons name="reorder-three-outline" size={22} color="#94A3B8" />
              </View>
            </GestureDetector>
            {hasChildren && (
              <Pressable
                onPress={onToggleBranch}
                accessibilityLabel={folded ? "Show subtasks" : "Hide subtasks"}
                className="h-8 w-10 items-center justify-center rounded-full active:bg-slate-100"
              >
                <Ionicons name={folded ? "chevron-forward" : "chevron-down"} size={18} color="#64748B" />
              </Pressable>
            )}
          </View>
        </Pressable>
      </View>
      {drop === "child" && <DropLine level={level + 1} label="Make subtask" />}
      {drop === "sibling" && <DropLine level={level} label="Place after" />}
    </Animated.View>
  );
}
