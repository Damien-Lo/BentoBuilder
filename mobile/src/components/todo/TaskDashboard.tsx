import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { TodoDashboard, TodoTask } from "@/src/services/todoApi";

import { PriorityPill, ProgressBar, StatusPill, TaskNumber } from "./TaskBits";
import { friendlyDate } from "./theme";

// The summary at the top of the Lists home: counts of top-level tasks,
// overall completion, and the overdue and most recently touched ones.
// Checklists aren't counted.
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
  const stats: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string }[] = [
    { label: "Total", value: dashboard.total, icon: "list-outline", fg: "#4F46E5", bg: "#EEF2FF" },
    { label: "In progress", value: dashboard.inProgress, icon: "time-outline", fg: "#2563EB", bg: "#EFF6FF" },
    { label: "Completed", value: dashboard.completed, icon: "checkmark-circle-outline", fg: "#059669", bg: "#ECFDF5" },
    { label: "Overdue", value: dashboard.overdue, icon: "warning-outline", fg: "#DC2626", bg: "#FEF2F2" },
  ];

  return (
    <View className="mb-4">
      <View className="flex-row gap-2">
        {stats.map((stat) => (
          <View key={stat.label} className="flex-1 rounded-2xl border border-slate-200 bg-white px-2 py-2.5">
            <View className="h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: stat.bg }}>
              <Ionicons name={stat.icon} size={16} color={stat.fg} />
            </View>
            <Text className="mt-1.5 text-xl font-bold text-slate-950">{stat.value}</Text>
            <Text className="text-[11px] font-medium text-slate-500" numberOfLines={1}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

      <View className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-slate-800">Overall completion</Text>
          <Text className="text-sm font-bold text-blue-600">{dashboard.completion}%</Text>
        </View>
        <ProgressBar value={dashboard.completion} />
      </View>

      <TaskGroup startOpen={sectionsOpen} title="Overdue" danger tasks={dashboard.overdueTasks} onOpenTask={onOpenTask} />
      <TaskGroup
        startOpen={sectionsOpen}
        title="Recent"
        tasks={dashboard.recent.filter((t) => !dashboard.overdueTasks.some((o) => o._id === t._id))}
        onOpenTask={onOpenTask}
      />
    </View>
  );
}

function TaskGroup({
  title,
  tasks,
  danger = false,
  startOpen = false,
  onOpenTask,
}: {
  startOpen?: boolean;
  title: string;
  tasks: TodoTask[];
  danger?: boolean;
  onOpenTask: (task: TodoTask) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  if (tasks.length === 0) return null;
  return (
    <View className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <Pressable onPress={() => setOpen((v) => !v)} className="flex-row items-center px-4 py-3 active:bg-slate-50">
        {danger && <Ionicons name="warning-outline" size={16} color="#DC2626" style={{ marginRight: 8 }} />}
        <Text className={`flex-1 text-sm font-semibold ${danger ? "text-red-600" : "text-slate-800"}`}>{title}</Text>
        <Text className={`mr-2 text-sm ${danger ? "font-semibold text-red-600" : "text-slate-400"}`}>{tasks.length}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#94A3B8" />
      </Pressable>
      {open && tasks.map((task) => (
        <Pressable
          key={task._id}
          onPress={() => onOpenTask(task)}
          className="border-t border-slate-100 px-4 py-2.5 active:bg-slate-50"
        >
          <View className="flex-row flex-wrap items-center gap-1.5">
            <TaskNumber number={task.number} />
            <StatusPill status={task.status} />
            <PriorityPill priority={task.priority} />
          </View>
          <Text className="mt-1 text-[15px] font-semibold text-slate-900" numberOfLines={1}>
            {task.title}
          </Text>
          <View className="mt-0.5 flex-row items-center">
            {task.dueDate && (
              <Text className={`text-xs ${danger ? "font-medium text-red-600" : "text-slate-500"}`}>
                {friendlyDate(task.dueDate)}
                {danger ? " (overdue)" : ""}
                {"  ·  "}
              </Text>
            )}
            <Text className="flex-1 text-xs text-slate-500" numberOfLines={1}>
              {task.list.name}
              {task.subtaskCount > 0 ? `  ·  ${task.subtaskCount - task.openSubtaskCount}/${task.subtaskCount} subtasks` : ""}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export default TaskDashboard;
