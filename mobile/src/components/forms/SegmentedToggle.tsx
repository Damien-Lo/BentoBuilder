import { Pressable, Text, View } from "react-native";

import { useOrbitPage } from "@/src/theme/orbit";

interface SegmentedToggleOption<T> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T> {
  options: readonly [SegmentedToggleOption<T>, SegmentedToggleOption<T>];
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
  // A shorter rendering (tighter vertical padding, smaller text) for
  // cramped layouts.
  compact?: boolean;
  // A fixed outer height, to line up with neighbouring fields in a row.
  height?: number;
}

export function SegmentedToggle<T extends string | boolean>({
  options,
  value,
  disabled = false,
  onChange,
  compact = false,
  height,
}: SegmentedToggleProps<T>) {
  // (On an Orbit page: its card colours, the chosen one in ink.)
  const o = useOrbitPage();
  return (
    <View className="flex-row rounded-2xl border border-slate-200 bg-white p-1" style={[height ? { height } : undefined, o && { backgroundColor: o.surface, borderColor: o.border }]}>
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <Pressable
            key={String(option.value)}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            className={`flex-1 items-center justify-center rounded-xl ${compact ? "py-1.5" : "py-3"} ${
              isActive ? "bg-blue-600" : ""
            } ${disabled && !isActive ? "opacity-50" : ""}`}
            style={o && isActive ? { backgroundColor: o.ink } : undefined}
          >
            <Text
              className={`font-semibold ${compact ? "text-xs" : "text-sm"} ${
                isActive ? "text-white" : "text-slate-600"
              }`}
              style={o ? { color: isActive ? o.onInk : o.muted } : undefined}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default SegmentedToggle;
