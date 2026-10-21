import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Tap } from "@/src/components/ui/Tap";
import { useOrbitPage } from "@/src/theme/orbit";

import { WEEKDAYS_SHORT } from "./calendarUtils";

// Picks days of the week — for "have this every Monday" on a meal's food.
// On an Orbit page it takes the page's colours (a sheet like the planner's);
// anywhere else it keeps the older look.
export function RepeatDaysSheet({
  visible,
  title,
  subtitle,
  initialDays,
  weekStartDay,
  confirmLabel = "Save",
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  // 0 = Sunday … 6 = Saturday.
  initialDays: number[];
  weekStartDay: number;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (days: number[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const o = useOrbitPage();
  const [days, setDays] = useState<number[]>(initialDays);
  useEffect(() => {
    if (visible) setDays(initialDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const order = Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7);
  const toggle = (day: number) => setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  const same = (a: number[], b: number[]) => a.length === b.length && b.every((d) => a.includes(d));
  const presets: { label: string; days: number[] }[] = [
    { label: "Weekdays", days: [1, 2, 3, 4, 5] },
    { label: "Every day", days: [0, 1, 2, 3, 4, 5, 6] },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/40" style={o && { backgroundColor: o.scrim }} onPress={onCancel} />
      <View
        className="rounded-t-3xl bg-white px-5 pt-5"
        style={{ paddingBottom: insets.bottom + 16, ...(o && { backgroundColor: o.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10 }) }}
      >
        {/* (The handle, on an Orbit page.) */}
        {o && (
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: o.track }} />
          </View>
        )}
        <Text className="text-lg font-bold text-slate-950" style={o && { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: o.text }} numberOfLines={2}>
          {title}
        </Text>
        {!!subtitle && <Text className="mt-1 text-sm text-slate-500" style={o && { color: o.muted }}>{subtitle}</Text>}

        <View className="mt-4 flex-row gap-1.5">
          {order.map((day) => {
            const on = days.includes(day);
            return (
              <Tap
                key={day}
                onPress={() => toggle(day)}
                className={`flex-1 items-center rounded-xl py-3 ${on ? "bg-blue-600" : "bg-slate-100 active:bg-slate-200"}`}
                style={o && { borderRadius: 12, borderWidth: 1, backgroundColor: on ? o.ink : o.surface, borderColor: on ? o.ink : o.border }}
                pressedStyle={o ? { opacity: 0.75 } : {}}
              >
                <Text className={`text-[13px] font-semibold ${on ? "text-white" : "text-slate-700"}`} style={o && { color: on ? o.onInk : o.text }}>{WEEKDAYS_SHORT[day]}</Text>
              </Tap>
            );
          })}
        </View>

        <View className="mt-3 flex-row gap-2">
          {presets.map((preset) => {
            const on = same(days, preset.days);
            return (
              <Tap
                key={preset.label}
                onPress={() => setDays(preset.days)}
                className={`rounded-full border px-3.5 py-1.5 ${on ? "border-blue-600 bg-blue-50" : "border-slate-200 active:bg-slate-100"}`}
                style={o && { backgroundColor: on ? o.ink : o.pill, borderColor: on ? o.ink : o.pill }}
                pressedStyle={o ? { opacity: 0.75 } : {}}
              >
                <Text className={`text-[13px] font-semibold ${on ? "text-blue-700" : "text-slate-600"}`} style={o && { color: on ? o.onInk : o.onPill }}>{preset.label}</Text>
              </Tap>
            );
          })}
        </View>

        <View className="mt-5 flex-row gap-3">
          <Tap
            onPress={onCancel}
            className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:bg-slate-200"
            style={o && { height: 52, paddingVertical: 0, justifyContent: "center", borderRadius: 16, backgroundColor: o.pill }}
            pressedStyle={o ? { opacity: 0.8 } : {}}
          >
            <Text className="text-sm font-semibold text-slate-700" style={o && { fontSize: 15, color: o.onPill }}>Cancel</Text>
          </Tap>
          <Tap
            disabled={days.length === 0}
            onPress={() => onConfirm([...days].sort())}
            className={`flex-1 items-center rounded-2xl py-3.5 ${days.length ? "bg-blue-600 active:bg-blue-700" : "bg-blue-300"}`}
            style={o && { height: 52, paddingVertical: 0, justifyContent: "center", borderRadius: 16, backgroundColor: o.ink, opacity: days.length ? 1 : 0.4 }}
            pressedStyle={o ? { opacity: 0.8 } : {}}
          >
            <Text className="text-sm font-semibold text-white" style={o && { fontSize: 15, color: o.onInk }}>{confirmLabel}</Text>
          </Tap>
        </View>
      </View>
    </Modal>
  );
}
