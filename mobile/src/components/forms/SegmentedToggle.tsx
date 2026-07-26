import { Pressable, Text, View } from "react-native";

interface SegmentedToggleOption<T> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T> {
  options: readonly [SegmentedToggleOption<T>, SegmentedToggleOption<T>];
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}

export function SegmentedToggle<T extends string | boolean>({
  options,
  value,
  disabled = false,
  onChange,
}: SegmentedToggleProps<T>) {
  return (
    <View className="flex-row rounded-2xl border border-slate-200 bg-white p-1">
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <Pressable
            key={String(option.value)}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            className={`flex-1 items-center rounded-xl py-3 ${
              isActive ? "bg-blue-600" : ""
            } ${disabled && !isActive ? "opacity-50" : ""}`}
          >
            <Text
              className={`text-sm font-semibold ${
                isActive ? "text-white" : "text-slate-600"
              }`}
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
