import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import type { ProjectStatus, TaskPriority, TaskStatus, TodoList } from "@/src/services/todoApi";
import { useOrbitPage, useOrbitTheme, type OrbitColors } from "@/src/theme/orbit";
import { hexToRgba } from "@/src/utils/mealPlan";

import { TASK_PRIORITY_META, TASK_STATUS_META, useTodoTheme, type TodoTheme } from "./theme";

// Small shared pieces of the task UI: the status / priority pills, the
// "#12" reference and the progress bar (plain, and as a slider). On an
// Orbit page (useOrbitPage) they take its colours; elsewhere they look as
// they always have.

// A project's status at a glance where lists are listed: a small dot
// before its name (`gap`: from the icon before it) — grey while planning, blue when active, amber on hold, green
// when done — and, once done, its name struck through.
export const PROJECT_STATUS_DOT: Record<ProjectStatus, { label: string; color: string }> = {
  planning: { label: "Planning", color: "#94A3B8" },
  active: { label: "Active", color: "#3B82F6" },
  on_hold: { label: "On hold", color: "#F59E0B" },
  done: { label: "Done", color: "#10B981" },
};

export const projectDone = (list: TodoList) => list.type === "project" && list.projectStatus === "done";

export function ProjectStatusDot({ list, gap }: { list: TodoList; gap: number }) {
  if (list.type !== "project") return null;
  const status = PROJECT_STATUS_DOT[list.projectStatus ?? "planning"];
  return <View accessible accessibilityLabel={status.label} style={{ width: 8, height: 8, borderRadius: 4, marginLeft: gap, backgroundColor: status.color }} />;
}

// A colour mixed towards white — a list's or a pill's hue made light enough
// to read as text on the dark theme.
export function lighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const channel = (i: number) => {
    const value = parseInt(h.slice(i, i + 2), 16);
    return Math.round(value + (255 - value) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

// A status or priority pill's colours. On a dark Orbit page its hue, made
// light, as the text over a soft tint of the same; otherwise its own.
export function pillTint(meta: { fg: string; bg: string }, o: OrbitColors | null, dark: boolean): { fg: string; bg: string } {
  if (!o || !dark) return meta;
  const fg = lighten(meta.fg, 0.55);
  return { fg, bg: hexToRgba(fg, 0.16) };
}

// A list's colour where it's text (e.g. a heading): itself, or lighter on a
// dark Orbit page so it still reads.
export function readableAccent(accent: string, o: OrbitColors | null, dark: boolean): string {
  return o && dark ? lighten(accent, 0.35) : accent;
}

// The Lists pages' colours on an Orbit page: the same roles as TodoTheme,
// filled from the Orbit palette (so pieces that take a TodoTheme follow).
export function useListsTheme(): TodoTheme {
  const base = useTodoTheme();
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  if (!o) return base;
  return {
    dark,
    bg: o.canvas,
    headerBg: o.canvas,
    card: o.surface,
    cardBorder: o.border,
    rowDivider: o.border,
    detailBg: o.canvas,
    title: o.text,
    text: o.text,
    textMuted: o.muted,
    textFaint: o.faint,
    icon: o.icon,
    separator: o.border,
    circle: o.faint,
    pill: o.pill,
    danger: o.danger,
  };
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  const meta = TASK_STATUS_META[status] ?? TASK_STATUS_META.not_started;
  const tint = pillTint(meta, o, dark);
  return (
    <View className="flex-row items-center rounded-full px-2 py-0.5" style={{ backgroundColor: tint.bg }}>
      <Ionicons name={meta.icon} size={12} color={tint.fg} />
      <Text className="ml-1 text-xs font-semibold" style={{ color: tint.fg }}>
        {meta.label}
      </Text>
    </View>
  );
}

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  const o = useOrbitPage();
  const { dark } = useOrbitTheme();
  const meta = TASK_PRIORITY_META[priority] ?? TASK_PRIORITY_META.medium;
  const tint = pillTint(meta, o, dark);
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: tint.bg }}>
      <Text className="text-xs font-semibold" style={{ color: tint.fg }}>
        {meta.label}
      </Text>
    </View>
  );
}

export function TaskNumber({ number }: { number: number | null | undefined }) {
  const o = useOrbitPage();
  if (number == null) return null;
  return (
    <Text className="text-xs font-medium text-slate-400" style={o && { color: o.faint }}>
      #{number}
    </Text>
  );
}

// (On an Orbit page: its track, and filled in the section's colour unless
// told otherwise.)
export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const o = useOrbitPage();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View className="h-2 w-full overflow-hidden rounded-full bg-slate-100" style={o && { backgroundColor: o.track }}>
      <View style={{ width: `${pct}%`, height: 8, backgroundColor: color ?? o?.fill ?? "#2563EB" }} />
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
  color,
  onPreview,
  onChange,
}: {
  value: number;
  color?: string;
  onPreview?: (value: number | null) => void;
  onChange: (value: number) => void;
}) {
  const o = useOrbitPage();
  const fill = color ?? o?.fill ?? "#2563EB";
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
        <View className="h-2 w-full overflow-hidden rounded-full bg-slate-100" style={o && { backgroundColor: o.track }}>
          <View style={{ width: `${pct}%`, height: 8, backgroundColor: fill }} />
        </View>
        {/* The thumb (on an Orbit page: the card's colour, ringed in the
            section's ink — or in the bar's own colour, e.g. a list's). */}
        <View
          style={{
            position: "absolute",
            left: (Math.max(0, width - THUMB) * pct) / 100,
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            backgroundColor: o?.surface ?? "#FFFFFF",
            borderWidth: 2,
            borderColor: o && (!color || color === o.fill) ? o.ink : fill,
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
