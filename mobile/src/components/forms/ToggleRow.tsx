import { Pressable, Text, View } from "react-native";

interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

// A labelled on/off switch row — used both for real ingredient properties
// (e.g. "Always available") and for "do you want to set this optional
// field" opt-ins (default storage location, default expiry duration).
export function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: ToggleRowProps) {
  return (
    <Pressable
      disabled={disabled}
      className="mt-5 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4"
      onPress={() => onChange(!value)}
    >
      <View className="mr-3 flex-1">
        <Text className="font-semibold text-slate-900">{label}</Text>
        {description ? (
          <Text className="mt-0.5 text-xs leading-4 text-slate-500">{description}</Text>
        ) : null}
      </View>
      <View
        className={`h-7 w-12 justify-center rounded-full px-1 ${
          value ? "bg-blue-600" : "bg-slate-200"
        }`}
      >
        <View
          className="h-5 w-5 rounded-full bg-white shadow"
          style={{ transform: [{ translateX: value ? 20 : 0 }] }}
        />
      </View>
    </Pressable>
  );
}

export default ToggleRow;
