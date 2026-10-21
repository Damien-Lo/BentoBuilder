import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";

import { Tap } from "@/src/components/ui/Tap";
import type { TodoDashboard, TodoTask } from "@/src/services/todoApi";
import { useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";

import { PriorityPill, StatusPill, TaskNumber } from "./TaskBits";
import { friendlyDate } from "./theme";

// The summary at the top of the Lists home: counts of top-level tasks,
// overall completion, and the overdue and most recently touched ones.
// Checklists aren't counted.
// (The phone's Overview; in Orbit's look, the Tasks section's violet.)
export function TaskDashboard({
  dashboard,
  onOpenTask,
  sectionsOpen = false,
}: {
  dashboard: TodoDashboard;
  onOpenTask: (task: TodoTask) => void;
  // Start with Overdue and Recent expanded (they can still be collapsed).
  sectionsOpen?: boolean;
}) {
  const o = useOrbitTheme().colors;
  const recent = dashboard.recent.filter((t) => !dashboard.overdueTasks.some((other) => other._id === t._id));

  // The counts as cards like the Kitchen's Plan: the colour only where it
  // means something — in progress in the section's, done green, overdue red.
  const stats: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; tone?: string }[] = [
    { label: "Total", value: dashboard.total, icon: "list-outline" },
    { label: "In progress", value: dashboard.inProgress, icon: "time-outline", tone: dashboard.inProgress ? o.ink : undefined },
    { label: "Completed", value: dashboard.completed, icon: "checkmark-circle-outline", tone: dashboard.completed ? o.success : undefined },
    { label: "Overdue", value: dashboard.overdue, icon: "warning-outline", tone: dashboard.overdue ? o.danger : undefined },
  ];
  const pct = Math.max(0, Math.min(100, dashboard.completion));
  return (
    <View style={{ marginBottom: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {stats.map((stat) => (
          <View key={stat.label} style={{ flex: 1, backgroundColor: o.surface, borderRadius: 18, borderWidth: 1, borderColor: o.border, paddingHorizontal: 10, paddingVertical: 12 }}>
            <Ionicons name={stat.icon} size={18} color={stat.tone ?? o.muted} />
            <Text style={{ marginTop: 8, fontSize: 22, fontWeight: "800", color: stat.tone ?? o.text }}>{stat.value}</Text>
            <Text style={{ marginTop: 1, fontSize: 11.5, color: o.muted }} numberOfLines={1}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: o.surface, borderRadius: 18, borderWidth: 1, borderColor: o.border, paddingHorizontal: 16, paddingVertical: 14 }}>
        <View style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: o.text }}>Overall completion</Text>
          <Text style={{ fontSize: 15, fontWeight: "800", color: o.ink }}>{dashboard.completion}%</Text>
        </View>
        {/* (Its own bar, in the theme's track and the section's fill.) */}
        <View style={{ height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: o.track }}>
          <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: o.fill }} />
        </View>
      </View>

      <TaskGroup startOpen={sectionsOpen} title="Overdue" danger tasks={dashboard.overdueTasks} onOpenTask={onOpenTask} o={o} />
      <TaskGroup startOpen={sectionsOpen} title="Recent" tasks={recent} onOpenTask={onOpenTask} o={o} />
    </View>
  );
}

// Overdue / Recent: a card that opens to its tasks.
function TaskGroup({
  title,
  tasks,
  danger = false,
  startOpen = false,
  onOpenTask,
  o,
}: {
  startOpen?: boolean;
  title: string;
  tasks: TodoTask[];
  danger?: boolean;
  onOpenTask: (task: TodoTask) => void;
  o: OrbitColors;
}) {
  const [open, setOpen] = useState(startOpen);
  if (tasks.length === 0) return null;
  return (
    <View style={{ backgroundColor: o.surface, borderRadius: 18, borderWidth: 1, borderColor: o.border, overflow: "hidden" }}>
      <Tap
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${tasks.length}`}
        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}
        pressedStyle={{ backgroundColor: o.pill }}
      >
        {danger && <Ionicons name="warning-outline" size={17} color={o.danger} style={{ marginRight: 8 }} />}
        <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: danger ? o.danger : o.text }}>{title}</Text>
        <Text style={{ marginRight: 8, fontSize: 14, fontWeight: danger ? "700" : "400", color: danger ? o.danger : o.faint }}>{tasks.length}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={o.faint} />
      </Tap>
      {open && tasks.map((task) => (
        <Tap
          key={task._id}
          onPress={() => onOpenTask(task)}
          accessibilityRole="button"
          accessibilityLabel={task.title}
          style={{ borderTopWidth: 1, borderTopColor: o.border, paddingHorizontal: 16, paddingVertical: 11 }}
          pressedStyle={{ backgroundColor: o.pill }}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <TaskNumber number={task.number} />
            <StatusPill status={task.status} />
            <PriorityPill priority={task.priority} />
          </View>
          <Text style={{ marginTop: 5, fontSize: 15, fontWeight: "600", color: o.text }} numberOfLines={1}>
            {task.title}
          </Text>
          <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center" }}>
            {task.dueDate && (
              <Text style={{ fontSize: 12.5, fontWeight: danger ? "600" : "400", color: danger ? o.danger : o.muted }}>
                {friendlyDate(task.dueDate)}
                {danger ? " (overdue)" : ""}
                {"  ·  "}
              </Text>
            )}
            <Text style={{ flex: 1, fontSize: 12.5, color: o.muted }} numberOfLines={1}>
              {task.list.name}
              {task.subtaskCount > 0 ? `  ·  ${task.subtaskCount - task.openSubtaskCount}/${task.subtaskCount} subtasks` : ""}
            </Text>
          </View>
        </Tap>
      ))}
    </View>
  );
}

export default TaskDashboard;
