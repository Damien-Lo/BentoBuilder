import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { TaskPriority, TaskStatus } from "@/src/services/todoApi";

import { TASK_PRIORITY_META, TASK_STATUS_META } from "./theme";

// Small shared pieces of the task UI: the status / priority pills, the
// "#12" reference and the progress bar.

export function StatusPill({ status }: { status: TaskStatus }) {
  const meta = TASK_STATUS_META[status] ?? TASK_STATUS_META.not_started;
  return (
    <View className="flex-row items-center rounded-full px-2 py-0.5" style={{ backgroundColor: meta.bg }}>
      <Ionicons name={meta.icon} size={12} color={meta.fg} />
      <Text className="ml-1 text-xs font-semibold" style={{ color: meta.fg }}>
        {meta.label}
      </Text>
    </View>
  );
}

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  const meta = TASK_PRIORITY_META[priority] ?? TASK_PRIORITY_META.medium;
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: meta.bg }}>
      <Text className="text-xs font-semibold" style={{ color: meta.fg }}>
        {meta.label}
      </Text>
    </View>
  );
}

export function TaskNumber({ number }: { number: number | null | undefined }) {
  if (number == null) return null;
  return <Text className="text-xs font-medium text-slate-400">#{number}</Text>;
}

export function ProgressBar({ value, color = "#2563EB" }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <View style={{ width: `${pct}%`, height: 8, backgroundColor: color }} />
    </View>
  );
}
