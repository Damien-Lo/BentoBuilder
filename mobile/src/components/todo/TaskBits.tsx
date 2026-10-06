import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import type { TaskPriority, TaskStatus } from "@/src/services/todoApi";

import { TASK_PRIORITY_META, TASK_STATUS_META } from "./theme";

// Small shared pieces of the task UI: the status / priority pills, the
// "#12" reference and the progress bar (plain, and as a slider).

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

const SLIDER_STEP = 5;
const THUMB = 22;

// The progress bar as a slider: drag the thumb (or tap the bar) to set a
// hand-set percentage. `onPreview` follows the drag so a number beside it
// can keep up; `onChange` fires once, on release.
export function ProgressSlider({
  value,
  color = "#2563EB",
  onPreview,
  onChange,
}: {
  value: number;
  color?: string;
  onPreview?: (value: number | null) => void;
  onChange: (value: number) => void;
}) {
  const [width, setWidth] = useState(0);
  // The value under the finger while dragging.
  const [dragging, setDragging] = useState<number | null>(null);
  const pct = Math.max(0, Math.min(100, dragging ?? value));

  const at = (x: number) => {
    const raw = width > THUMB ? ((x - THUMB / 2) / (width - THUMB)) * 100 : 0;
    return Math.max(0, Math.min(100, Math.round(raw / SLIDER_STEP) * SLIDER_STEP));
  };
  const preview = (next: number | null) => {
    setDragging(next);
    onPreview?.(next);
  };
  const commit = (next: number) => {
    preview(null);
    if (next !== value) onChange(next);
  };

  // Sideways only, so the page underneath still scrolls.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onStart((e) => preview(at(e.x)))
    .onUpdate((e) => preview(at(e.x)))
    .onEnd((e) => commit(at(e.x)))
    .onFinalize((_e, success) => {
      if (!success) preview(null);
    });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => commit(at(e.x)));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel="Progress"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={{ height: 32, justifyContent: "center" }}
      >
        <View className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <View style={{ width: `${pct}%`, height: 8, backgroundColor: color }} />
        </View>
        <View
          style={{
            position: "absolute",
            left: (Math.max(0, width - THUMB) * pct) / 100,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: "#FFFFFF",
            borderWidth: 2,
            borderColor: color,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            transform: [{ scale: dragging != null ? 1.2 : 1 }],
          }}
        />
      </View>
    </GestureDetector>
  );
}
